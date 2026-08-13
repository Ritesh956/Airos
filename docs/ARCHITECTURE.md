# Architecture

This document explains how AIR OS is put together and, more importantly,
*why* — the shape of the codebase is a direct answer to a few hard
constraints: camera frames must never leave the browser, the UI must not
re-render 60 times a second, and a heuristic must never be able to disguise
itself as a trained model. Read this after IMPLEMENTATION.md if you want the
full phase-by-phase plan; this doc is the "how the pieces fit" reference.

## The shape of the repo

```
AIR-OS/
├── packages/shared/     wire protocol shared by client and server
├── apps/server/         a health endpoint + a WebSocket relay. That's it.
└── apps/web/            the actual application
    └── src/
        ├── app/         routing, shell (Nav/StatusBar/CommandPalette), providers
        ├── vision/      camera lifecycle + (from Phase 2) MediaPipe wrappers
        ├── gestures/    pure landmark -> gesture engine (Phase 3)
        ├── interaction/ cursor mapping, command router
        ├── modules/     the nine features, one folder each
        ├── state/       three small external stores
        ├── ui/          the design-system primitives
        ├── hooks/       React glue between the above and components
        └── utils/       coordinate math, feature detection, etc.
```

It's an npm-workspaces monorepo with three packages: `@airos/shared`,
`@airos/server`, `@airos/web`. `@airos/shared` exists so the client and
server can't drift on what a WebSocket message looks like — both import the
same TypeScript types, so a shape mismatch is a compile error, not a runtime
surprise.

## Why three state stores, not one

Most React apps reach for a single global store. This one deliberately
doesn't, because the state here has genuinely different shapes and update
rates:

- **`appStore`** — which module is active, camera state, settings. Changes
  on user action. Persisted (settings) to localStorage.
- **`visionStore`** — hand/face/pose presence, FPS, inference time. Changes
  up to 30-60 times a second at the source, but is *published* into this
  store throttled to ~10Hz (see below) — nothing here needs to update
  faster than a human can read it.
- **`interactionStore`** — the cursor, the active gesture, what's selected.
  Sits downstream of vision + gestures, upstream of the modules that render
  cursors and selections.

Each is ~5 lines of type definition plus a handful of setter functions on
top of `state/createStore.ts`, a ~90-line external store implementation
(compatible with React's `useSyncExternalStore`) written in-repo instead of
pulling in Redux/Zustand/Jotai. For three small, independently-scoped
stores, a dependency wasn't worth it, and writing our own keeps "why isn't
this re-rendering on every camera frame" answerable by reading our own code.

## The hot path vs. the cold path

This is the single most important performance idea in the codebase, and the
reason the vision pipeline won't turn into a slideshow once Phase 2 lands.

A camera can deliver frames at 30-60Hz. If every frame triggered a React
re-render of a cursor dot or a landmark overlay, the UI thread would spend
more time reconciling a virtual DOM than doing anything useful. So the app
draws a hard line:

- **Hot path** — anything that changes every frame and is drawn on a
  canvas or WebGL surface (landmark positions, the cursor, 3D object
  transforms). This data lives in refs or is read directly inside a
  `requestAnimationFrame` loop. **It never touches React state**, and
  therefore never triggers a re-render.
- **Cold path** — anything a human actually reads as text (FPS, hand
  count, which gesture is active by name). This is throttled to ~10Hz
  (`state/createStore.ts`'s `throttle` helper) before it reaches a React
  store, so a stable value publishes once instead of sixty times a second.

`visionStore.ts`'s `publishVisionFrame` is the concrete example: it's meant
to be called from a per-frame vision callback, but it internally throttles,
so however fast frames arrive, React sees at most ~10 updates/sec.

## Camera lifecycle

`vision/camera/CameraManager.ts` is a plain class (no React) that owns the
`MediaStream`. It is a singleton — the camera is one OS-wide resource, not
one per module — and it publishes its state (`off` / `starting` / `active`
/ `stopping` / `error`) into `appStore` so any component can render it
without polling the class directly.

Two rules this class enforces structurally, not just by convention:

1. **`getUserMedia` is only ever called inside `start()`**, and `start()`
   is only ever called from a click handler (see `hooks/useCamera.ts` and
   `modules/home/CameraControlPanel.tsx`). Nothing calls it on mount.
2. **`stop()` always tears down completely** — every `MediaStreamTrack` is
   stopped, `srcObject` is nulled, the internal `<video>` element is
   dropped. There's no code path that leaves a stream running invisibly.

Errors are classified into a fixed taxonomy (`vision/camera/errors.ts`) —
permission denied, no camera, camera in use, insecure context, unsupported
browser, model load failure — each with a message that says what to do
next, not just what broke.

## The Command Router: one funnel for every input

`interaction/commands/CommandRouter.ts` is a tiny pub-sub registry.
Anything that can trigger an action — a keyboard shortcut, a gesture, or
(as of Phase 11) a spoken voice command — registers a `Command` (an id, a
title, some matchable phrases, an optional key, and a `run()` function) and
dispatches through the same two entry points: `dispatch(id)` for exact
triggers (keyboard, gestures) and `dispatchPhrase(text)` for fuzzy triggers
(voice, the text palette). `interaction/voice/VoiceRecognitionController.ts`
is the one new caller of `dispatchPhrase()` this phase added — every final
transcript from the Web Speech API goes straight through it, so voice
never gets its own parallel dispatch logic.

The payoff: `modules/*` never hard-code `if (key === '2') navigate(...)`
scattered around the app, and when Phase 11 adds voice input, it doesn't
touch a single existing component — it just starts calling
`dispatchPhrase()` with recognized speech.

One implementation detail worth knowing if you're extending this file:
`CommandRouterImpl`'s methods are arrow function class fields, not
prototype methods. They're routinely handed out as bare references (e.g.
`useSyncExternalStore(commandRouter.subscribe, ...)`), and a prototype
method loses its `this` binding the moment it's detached from the instance
like that. This bit us once during Phase 1 development — see the git
history for `CommandRouter.ts` if you want the exact failure mode.

## Architectural boundaries, enforced by lint

`gestures/` is meant to be a pure function of `(landmarks, history) ->
GestureResult` — no DOM, no React, no state store, callable from a unit
test with a JSON fixture and nothing else. That's a promise a comment can't
keep on its own, so `eslint.config.js` encodes it as a real rule
(`eslint-plugin-boundaries`): `gestures/` is not allowed to import from
`state/`, `ui/`, `modules/`, or `app/`. `vision/` has a looser version of
the same rule — it's allowed to *publish into* `state/` (that's how camera
frames become `visionStore` updates) but still can't reach into `ui/`,
`modules/`, or `app/`.

Run `npm run lint` to see this enforced; try importing `@/ui/Panel` from
inside `gestures/` and watch it fail.

## The Interaction Engine: turning a gesture into a real click (Phase 4)

`interaction/cursor/CursorEngine.ts` is the piece that turns "index
fingertip landmark + classified gesture" into an actual on-screen pointer
that clicks and drags real elements. It's built from four independently
testable pieces, each isolated for the same reason the gesture engine's
classifiers are pure (see docs/GESTURES.md):

- **`OneEuroFilter.ts`** — smooths the raw fingertip position. A plain
  exponential moving average has one fixed smoothing factor: turn it up
  and a still hand stops jittering but a fast swipe lags; turn it down and
  the lag disappears but so does the jitter suppression. One-Euro adapts
  its cutoff to the signal's own speed instead, and is tunable live from
  the Cursor module (`cursorMinCutoff`/`cursorBeta` in `AppSettings`).
- **`calibration.ts`** — maps a "reach box" (a region of the mirrored
  camera frame, by default the center 60%×60%) onto the full [0,1] screen
  space. Without this, the screen's corners sit at the camera frame's
  edges, where tracking is least reliable and the user's arm is fully
  extended.
- **`pinchDragTracker.ts`** — the click-vs-drag decision as a small state
  machine, deliberately separated from DOM dispatch so it's unit-testable
  without mocking `document.elementFromPoint`. It operates in *normalized*
  coordinates, not viewport pixels — a fixed-pixel movement threshold
  would make the decision resolution-dependent (the same physical hand
  jitter maps to more raw pixels on a larger or higher-DPI screen, which
  would make accidental drags more likely purely from screen size). This
  was a real bug caught during Phase 4 development, not a hypothetical.
- **`syntheticPointer.ts`** — dispatches genuine `PointerEvent`/`MouseEvent`
  sequences (`bubbles: true`) at the real DOM element under the cursor. A
  browser page can't move the OS-level mouse or control other
  applications — "Air Cursor" is a virtual pointer *within this page* —
  but because these are real native events, React's root-delegated
  listeners pick them up exactly like a genuine click, with no
  per-component wiring anywhere else in the app.

`CursorEngine` itself just wires these together per frame: pick the
dominant hand (sticky — once chosen, keeps using the same hand as long as
it's visible, rather than flopping between two hands in frame), mirror +
calibrate + filter its fingertip, feed the gesture and position to
`PinchDragTracker`, and turn its `PinchAction` output into real dispatched
events. `POINT`/`PINCH` drive movement; `OPEN_PALM`/`FIST`/anything else
freezes the cursor in place rather than jumping to wherever a curled fist
happens to be.

### A bug worth knowing about: resets vs. in-flight throttled publishes

Both `gestureBridge` and `CursorEngine` subscribe to `appStore` to detect
when the vision source changes (e.g. Demo Mode toggled off) and reset
their state — otherwise, switching to a source that produces zero frames
(camera mode while the camera is off) would leave the gesture/cursor HUD
frozen on stale data forever, since nothing would ever arrive to overwrite
it.

The first version of this reset called the store setter directly
(`setActiveGesture(null)`, `visionStore.set({...zeroed})`), which turned
out not to be enough: if a throttled publish was already scheduled from a
frame just before the reset, it would fire moments later on its own timer
and silently undo the reset with stale data. `state/createStore.ts`'s
`throttle()` now exposes `cancel()` specifically for this — every reset
path calls it before writing the cleared state. See
`state/createStore.test.ts` for the regression tests.

### A second Interaction Engine: `StudioEngine.ts` (Phase 6)

`interaction/studio/StudioEngine.ts` is the same idea applied to 3D
Studio, with one deliberate difference: it stops at "here's each tracked
hand's pointer position (NDC + normalized) and pinch state" and goes no
further — it has no `camera`/`scene`/raycaster of its own, because those
only exist inside R3F's `<Canvas>`. The actual raycasting/drag/scale/
rotate logic lives in `modules/studio/StudioScene.tsx`'s `useFrame` loop
instead, reading `studioEngine.latest` directly each frame rather than
via a push subscription (unlike `CursorEngine`, which needs `subscribe()`
because `AirCursorOverlay` runs its own separate rAF loop — R3F's
`useFrame` already *is* that loop, so `StudioEngine` doesn't need to
provide one). Same hot-path discipline (`MathUtils.damp`, never a snap),
same sticky-hand-identity trick as `CursorEngine.pickPrimaryHand`, applied
to up to two hands instead of one.

## Module registry: one array, four consumers

`app/moduleRegistry.tsx` is the single source of truth for the nine
modules — id, route path, label, icon, keyboard shortcut, which phase ships
it, and a lazy-loaded component. The sidebar nav, the router
(`app/routes.tsx`), the module grid on Home, and the navigation commands
registered in `app/shell/useNavigationCommands.ts` all read this one array.
Adding a tenth module means adding one entry here — no other file changes.

## What's actually built (everything, as of Phase 13)

Home, Settings, Air Cursor, Gesture Lab, 3D Studio, Air Draw, and
Presentation are fully functional: camera start/stop with real error
handling, live browser capability detection, localStorage-persisted
settings, working keyboard shortcuts and command palette, real-time hand
tracking with a live skeleton overlay, an 11-gesture recognition engine, a
cursor that actually clicks and drags real elements via genuine dispatched
DOM events, a live landmark table + gesture timeline + FPS readouts in
Gesture Lab (plus an opt-in Face Landmarker toggle drawing a face oval/
eyes/eyebrows/lips overlay — tracking only, no expression or identity
inference, and the model is never even asked for the blendshape scores
that would make that possible), a Three.js scene in 3D Studio whose objects you select/drag/
scale/rotate with real gestures (with full mouse and keyboard parity, per
§1.6), a drawing canvas in Air Draw where pinch paints smoothed strokes, a
fist erases, undo/redo/clear/color/brush-size all work, and drawings
export as real PNGs or save to a local IndexedDB gallery, a
Presentation module that drives a slide deck off swipes (next/previous),
THUMBS_UP/FIST (timer start/pause), and OPEN_PALM (a gesture-legend
toggle) — the first module needing no per-frame hand-position tracking at
all, just the gesture classifications every other module already
publishes — and Gesture Lab's opt-in Pose Landmarker toggle drawing a
33-point body skeleton plus four DERIVED elbow/knee joint-angle readouts
(`vision/pose/poseAngles.ts`, reusing the same angle-between-three-points
math the gesture engine uses for finger curl) — tracking plus one small,
literal arithmetic step on top, per Phase 10's gate. Settings now also has
a Voice control panel (Phase 11): a `VoiceRecognitionController` wraps the
Web Speech API and dispatches recognized phrases through the same
`CommandRouter.dispatchPhrase()` the text Command Palette always used, so
"open 3d studio" spoken aloud runs the identical code path as clicking it
in the palette or pressing its keyboard shortcut — with the browser's
lack-of-support case rendering an explanatory message instead of a dead
toggle, and Game Mode (Phase 12) — a small vertical shooter proving the
pipeline is fast and precise enough to actually play with: point to
steer, pinch to fire, hold an open palm to raise a shield, with the
entire game (enemy movement, spawning, collisions, lives) implemented as
a pure, unit-tested `stepSimulation()` function
(`modules/game/gameSimulation.ts`) a thin stateful wrapper drives every
animation frame — the same "pure core, thin wrapper" split Presentation's
timer math established, and Analytics (Phase 13) is a real performance
dashboard: live FPS (smoothed and a rolling 3-second median), inference/
frame-time readouts, an FPS history graph, a Debug Mode reusing Gesture
Lab's landmark table and gesture timeline, and IMPLEMENTATION.md §9's
degradation ladder fully wired to real measured FPS —
`vision/perf/DegradationController.ts` escalates through resolution
downgrade, single-hand tracking, halved inference, and disabled secondary
tasks as sustained low FPS demands, each step module-gated (3D Studio
keeps both hands, Gesture Lab's face/pose toggles are never overridden)
and reversible with hysteresis once FPS recovers. Every module in
`app/moduleRegistry.tsx` is now `status: 'ready'` — none render
`ui/ModulePlaceholder.tsx` anymore. See IMPLEMENTATION.md §11 for the
full phase plan, or CLAUDE.md for exactly where things stand right now.
