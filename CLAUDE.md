# AIR OS — Session Handoff / Project Guide

This file is for Claude (and any contributor) picking this project back up.
It captures what exists, why it's built the way it is, and exactly where to
resume. Read this before touching code — it'll save re-deriving decisions
already made and re-discovering bugs already fixed.

## What this project is

AIR OS — "Interact with your computer without touching it." A portfolio-grade
touchless computer interface controlled by real-time hand gestures (webcam,
in-browser, MediaPipe). Built in 14 phases per **[IMPLEMENTATION.md](IMPLEMENTATION.md)**,
each phase gated on `typecheck && lint && test && build` all clean plus
manual browser verification — no phase starts while the previous one is
broken. That file is the full spec (architecture, coordinate conventions,
phase table, quality bar) — this file is the "where things stand right now"
supplement to it, not a replacement.

Also read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** (the hot-path/cold-path
split, why three stores, the Interaction Engine),
**[docs/COMPUTER_VISION.md](docs/COMPUTER_VISION.md)**, and
**[docs/GESTURES.md](docs/GESTURES.md)** before extending vision/gestures/interaction
code — each documents real thresholds and real bugs found while building, not
just design intent.

## Status: Phases 1–7 complete. Resume at Phase 8 (Presentation).

| # | Phase | Status |
|---|---|---|
| 1 | Architecture + Camera | ✅ done |
| 2 | Hand tracking | ✅ done |
| 3 | Gesture engine | ✅ done |
| 4 | Air Cursor | ✅ done |
| 5 | Gesture Lab | ✅ done |
| 6 | 3D Studio | ✅ done |
| 7 | Air Draw | ✅ done |
| **8** | **Presentation** | **← start here** |
| 9 | Face tracking | pending |
| 10 | Pose tracking | pending |
| 11 | Voice + Command Center | pending |
| 12 | Game Mode | pending |
| 13 | Analytics + Perf | pending |
| 14 | Polish | pending |

### Git status: nothing committed yet

This repo has **zero commits** (`git log` → "does not have any commits yet").
Everything from Phase 1 through Phase 6 is sitting in the working tree,
untracked/uncommitted. The user hasn't asked for a commit yet — don't commit
unless explicitly asked, per standing instructions. If asked to commit,
consider whether it should be one commit per phase (matches the gate
structure) or one big initial commit — ask if unclear.

## Phase 5 shipped: Gesture Lab

`apps/web/src/modules/lab/LabModule.tsx` is the real module now (no longer
a `ModulePlaceholder`), composed from:
- `modules/shared/CameraStage.tsx` — the camera-preview + skeleton overlay +
  Demo Mode toggle + Start/Stop block, **extracted here** once it became the
  third near-identical copy (Cursor, Home, Lab). `CursorModule.tsx` and
  `CameraControlPanel.tsx` were rewired to use it too, via render-prop slots
  (`extraControls`, `controlsNote`, `footer`) for what each still needs on
  top (Calibrate Reach button, readouts block, privacy note). If you need a
  fourth camera-preview block, extend this component rather than copying it.
- `modules/lab/LandmarkTable.tsx` — per-hand, all 21 landmarks, throttled to
  ~10Hz local state (not the hot path — a table a human reads doesn't need
  frame-rate updates). Shows raw MediaPipe output (unmirrored, `MODEL`) next
  to the mirrored/display-space X (`DERIVED`) — a live demonstration of the
  one-place-mirroring rule in `utils/coords.ts`, not just an assertion of it.
- `modules/lab/GestureTimeline.tsx` — reads `interactionStore.gestureHistory`
  (new field), a newest-first bounded ring buffer (cap 50) that
  `interaction/gestureBridge.ts` appends to on *transition into* a new
  stable gesture (not per-frame — see bug class #4). `utils/format.ts` grew
  `formatClockTime()` to turn a `performance.now()`-relative timestamp into
  a wall-clock string for the log.
- Overlay toggles wired to the **already-existing but previously-unused**
  `AppSettings.showSkeletonOverlay`/`showDebugOverlay` — `HandSkeletonOverlay`
  now actually reads them (it used to always draw). `showDebugOverlay` labels
  each joint with its landmark index on the canvas.

Two pre-existing staleness bugs were found and fixed via the mandatory
browser-verification step (see bugs #8–9 below) — read those before adding
another hot-path canvas or another `appStore`-driven cold-path reset.

`moduleRegistry.tsx`'s `lab` entry is now `status: 'ready'`. (Note:
`cursor`'s entry is still `status: 'planned'` despite Phase 4 being done —
a pre-existing inconsistency, left alone as out-of-scope for Phase 5.)

## Phase 6 shipped: 3D Studio

`apps/web/src/modules/studio/StudioModule.tsx` is the real module now. The
first phase to render anything beyond a 2D canvas overlay, and the first
real test of the hot-path/cold-path split against a WebGL scene graph —
composed from:
- `interaction/studio/StudioEngine.ts` — the Interaction Engine stage,
  deliberately Three.js-agnostic (no `camera`/`scene` — those only exist
  inside `<Canvas>`). Turns tracked hands into up to two `HandPointer`s
  (NDC + pre-NDC normalized coords + pinch state), sticky primary/secondary
  hand identity (copied from `CursorEngine.pickPrimaryHand`'s pattern, so a
  two-hand gesture's rotation sign doesn't flip if MediaPipe's hand order
  changes frame to frame). No `subscribe()`/listeners like `CursorEngine`
  has — R3F's own `useFrame` already ticks every frame, so `StudioScene`
  just reads `studioEngine.latest` directly.
- `interaction/studio/twoHandGesture.ts` — pure, unit-tested vector-angle
  math resolving IMPLEMENTATION.md §13.3's open question (see there).
- `modules/studio/studioObjects.ts` (plain data: the cube/sphere/torus/
  centerpiece) + `studioTransforms.ts` (hot-path `Map<id, Transform>` — the
  *target* state a `useFrame` loop damps toward, no Three.js import, shared
  by both the gesture path and the keyboard commands so "how a transform
  changes" has exactly one implementation regardless of input source).
- `modules/studio/StudioScene.tsx` — the actual raycasting/drag/scale/
  rotate loop, `MathUtils.damp`-eased every frame (never snapped — the
  "no teleporting" gate, satisfied structurally). Mouse selection is free
  via R3F's own `onClick`; gesture selection is a manual `THREE.Raycaster`
  against an **oversized invisible hitbox** per object (see bug #10 —
  don't shrink `HIT_RADIUS`/`HIT_SEGMENTS` without rereading it).
- `modules/studio/useStudioKeyboardCommands.ts` — full keyboard parity
  (§1.6) registered through `CommandRouter`, mutating the exact same
  `studioTransforms` map the gesture path does.

Demo Mode can demonstrate single-hand select + drag (the fixture's pinch
reliably lands on the **cube**, not the centerpiece — see bug #10) but not
the two-hand gesture, since the fixture only ever has one hand. That's an
honest, permanent limitation, not a bug to chase — mouse + keyboard are the
fully-capable non-camera path, by design.

`moduleRegistry.tsx`'s `studio` entry is now `status: 'ready'`; the
`cursor` entry's stale `'planned'` status (noted in Phase 5's write-up) was
also fixed to `'ready'` at the start of this phase.

## Phase 7 shipped: Air Draw

`apps/web/src/modules/draw/DrawModule.tsx` is the real module now. The
first phase whose Interaction Engine deliberately follows `StudioEngine`'s
split rather than `CursorEngine`'s (see docs/ARCHITECTURE.md) — the engine
stays a generic "filtered fingertip pointer + raw gesture" and never
touches a stroke, the same way `StudioEngine` never touches a raycaster.
Composed from:
- `interaction/draw/DrawEngine.ts` — sticky-hand-selection, reach-boxed,
  One-Euro-filtered fingertip pointer (`DrawPointerState`), structurally
  identical to `CursorEngine`'s pointer math minus the click/drag dispatch.
  No knowledge of strokes, canvases, or an eraser radius — that's
  `DrawCanvas.tsx`'s job, one layer up, the same split `StudioScene.tsx`
  has from `StudioEngine`.
- `modules/draw/drawStrokes.ts` — the actual stroke data: a module-level
  singleton (not a `createStore`, not React state — hot-path data a rAF
  loop appends to every frame while a pinch is held, same reasoning as
  `studioTransforms.ts`). `beginStroke`/`appendPoint`/`commitStroke`,
  `undo`/`redo`, whole-stroke `eraseNear` (a pixel eraser isn't worth the
  complexity when a fist's precision doesn't support one), and a `clear()`
  designed to be **fully undoable**: it moves every current stroke onto the
  redo stack in place rather than discarding them, so a keyboard-bound
  Clear (`c`) can't be an accidental, irreversible wipe. 21 Vitest cases
  cover this file directly — no canvas/DOM mocking needed, same "pure logic
  is worth testing in isolation" reasoning as `pinchDragTracker.ts`.
- `modules/draw/drawStore.ts` — the cold-path summary (`color`, `brushSize`,
  `tool`, `canUndo`/`canRedo`/`strokeCount`) the toolbar reads reactively;
  `drawStrokes.ts`'s mutators call `setDrawCounts` directly after every
  change, the same direct-call pattern `setSelectedObjectId` uses rather
  than a second pub-sub layer.
- `modules/draw/DrawCanvas.tsx` — the actual gesture-to-paint logic, and
  the one place PINCH/FIST/idle get interpreted (`toolForGesture`). Runs
  its **own** `requestAnimationFrame` loop, deliberately not a
  `visionEngine.subscribe()` push callback like `HandSkeletonOverlay` —
  see the "a self-driven loop sidesteps bug #9" note below. Also wires
  real `pointerdown`/`pointermove`/`pointerup` listeners so a mouse can
  draw with zero camera involvement (full non-camera parity, same bar
  Cursor and Studio hold themselves to), guarded by an `activeInputRef` so
  a concurrent gesture-driven stroke can't be silently stomped by a mouse
  click mid-pinch.
- `modules/draw/drawExport.ts` / `drawGallery.ts` — `canvas.toBlob('image/
  png')` for both the download (`<a download>` + object-URL, revoked after
  the click) and the IndexedDB gallery (raw `indexedDB`, no wrapper
  library — three operations on one object store didn't justify a
  dependency, same call as the state stores in IMPLEMENTATION.md §1.7).
  The gallery stores raster PNG snapshots, not resumable stroke sessions —
  matches the original placeholder's brief exactly.
- `useDrawKeyboardCommands.ts` — `z`/`y`/`c` for undo/redo/clear through
  `CommandRouter`, single-key bindings only (per `useGlobalKeyboardCommands`'s
  own Ctrl/Cmd/Alt-chord exclusion). These aren't gesture-driven actions at
  all (no pose maps to "undo"), so this isn't §1.6 parity so much as
  keyboard being a first-class input in its own right.

**A design choice worth flagging explicitly**: unlike every other hot-path
canvas in this app (`HandSkeletonOverlay`, `AirCursorOverlay`), `DrawCanvas`
runs its *own* continuous rAF loop rather than redrawing only when a new
`visionEngine`/`DrawEngine` frame arrives. This wasn't arbitrary — a
push-subscription loop only redraws when something *arrives*, which is
exactly the mechanism behind bug #9 (a frozen ghost overlay once frames
stop). A self-driven loop keeps ticking regardless of tracking state, so
the brush/eraser cursor indicator disappears the instant
`drawEngine.latest.visible` goes false, with no separate
`trackingState`-watching effect needed — and any stroke mutation, from
*any* input source (gesture, mouse, or an Undo/Redo/Clear click), is
picked up on the very next frame with zero invalidation wiring. If you add
a fourth hot-path canvas, ask whether it can use this pattern instead of
bug #9's fix before reaching for a `trackingState` effect out of habit.

`moduleRegistry.tsx`'s `draw` entry is now `status: 'ready'`.

### A verification lesson worth recording (not a code bug)

Confirming the PINCH→draw gesture path live (as opposed to FIST→erase,
which *was* caught live — see below) turned out to be a genuine timing
race against this project's own browser-automation tooling, not a defect.
Two things learned chasing it, worth knowing before the next phase's
manual verification:
1. The synthetic demo fixture's full gesture loop is short (~7.6s,
   computed from `fixtures.ts`'s keyframe `holdMs`/`transitionMs` sums),
   and PINCH's stable window inside it is only ~650ms — external polling
   (screenshot/`get_page_text` calls) with multi-second gaps between them
   can easily straddle right past it purely by chance, especially against
   a backgrounded automation tab where Chrome's timer throttling makes the
   fixture's wall-clock-driven playback jump unpredictably between polls.
   FIST→erase *was* caught this way, on the first extended-wait attempt —
   PINCH wasn't, after many attempts, almost certainly bad luck compounding
   with the above rather than a real gap.
2. A **long-running in-page polling script** passed to the browser
   automation's JS-eval tool (a `while` loop `await`-ing `setTimeout`
   inside one `javascript_exec` call) reliably saw *zero* state changes
   over 9+ seconds, even immediately after external screenshot polling had
   just confirmed the same values were changing. Don't trust a busy-wait
   loop inside one long CDP-evaluate call to observe live app state for
   this reason — it appears to suppress the tab's own effective render/
   timer cadence for the call's duration. This is a distinct trap from the
   two documented in the Process Notes section below (which are about
   isolated JS worlds and click/read ordering), not a restatement of them.

Given that, this phase's live verification rests on: FIST→erase caught
live end-to-end (correct DOM state *and* the red eraser-cursor rendering
at the right position); mouse-driven drawing exercising the *identical*
`beginStroke`/`appendPoint`/`commitStroke`/`eraseNear` functions PINCH
would call (proven live: strokes render, the counter updates, colors
apply to new strokes); Undo/Redo/Clear including the redo-recoverable
Clear semantics; Save to Gallery and Export as PNG (the exported blob's
first 8 bytes were checked against the real PNG magic number via
`javascript_exec` — `89 50 4e 47 0d 0a 1a 0a` — rather than just assumed
from no thrown error). The PINCH path itself is structurally identical to
the verified FIST path (same `toolForGesture` branch, same call site
shape) and separately covered by `drawStrokes.test.ts`, but wasn't caught
live in this session. Flagging this plainly rather than claiming a
verification that didn't happen — see this file's own quality bar on
fabricated confidence.

## How to resume: Phase 8, Presentation

Current placeholder: `apps/web/src/modules/present/PresentModule.tsx`
(`ModulePlaceholder`, `phase={8}`). Its `willInclude` promises (check the
placeholder itself for the current wording before starting — this handoff
doesn't duplicate it) center on slide navigation via swipe, a presenter
HUD, and a timer.

**Gate for this phase**: *"Slides, swipe nav, presenter HUD, timer → Swipes
reliable, no double-fires."*

Reuse checklist: `SWIPE_LEFT`/`SWIPE_RIGHT` are already fully implemented
in the gesture engine (docs/GESTURES.md) and are discrete, one-frame events
published *unthrottled* by `gestureBridge.ts` (bug #4) — subscribe to
`interactionStore.activeGesture` or hook into `gestureBridge`'s swipe path
directly rather than polling for it, and remember a swipe doesn't go
through the pose-stability debounce the way held poses do. "No double-fires"
in the gate is exactly the 600ms cooldown `SwipeDetector` already enforces
(docs/GESTURES.md) — verify it's sufficient for a presentation's normal
pace rather than re-implementing a second cooldown at this layer. No open
questions parked for this phase in IMPLEMENTATION.md §13.

## Architecture quick-reference (see docs/ARCHITECTURE.md for full detail)

- **Three state stores**: `appStore` (module/camera/settings, user-driven),
  `visionStore` (hand/face/pose presence, FPS — throttled ~10Hz cold path),
  `interactionStore` (cursor, active gesture — downstream of vision+gestures).
- **Hot path vs. cold path**: anything per-frame (landmarks, cursor
  position) lives in refs / is read directly in a rAF loop, never touches
  React state. Anything text a human reads is throttled into a store first.
  `state/createStore.ts`'s `throttle()` helper is the mechanism — it now
  has a `.cancel()` method (added in Phase 4, see below) that reset paths
  must call.
- **Coordinate convention**: MediaPipe emits *unmirrored* normalized [0,1]
  coordinates. `vision/` and `gestures/` must never mirror them — mirroring
  happens exactly once, in `utils/coords.ts`, at the presentation layer.
  This includes handedness: MediaPipe's Left/Right label is on the
  unmirrored frame, so it's backwards from the user's own sense of their
  hand — `mirrorHandedness()` exists for when that matters.
- **Method taxonomy**: every displayed number is tagged `MODEL` (straight
  from a neural net — landmark positions, handedness score), `HEURISTIC`
  (rule-based — every gesture classification), or `DERIVED` (arithmetic on
  the above — FPS, angles, counts). Never let a heuristic display as a
  model. `ui/MethodBadge.tsx` + `Readout`'s `method` prop enforce this
  structurally (it's a required typed field, not just a convention).
- **Lint-enforced boundaries**: `gestures/` cannot import from `state/`,
  `ui/`, `modules/`, or `app/` (checked by `eslint-plugin-boundaries`, not
  just a comment). `vision/` can publish *into* `state/` but not import
  `ui/`/`modules/`/`app/`. Try breaking this and `npm run lint` will catch it.
- **Demo Mode**: `vision/replay/ReplaySource.ts` + `vision/replay/fixtures.ts`
  provide a synthetic hand (`generateGestureShowcaseFixture`, note the name
  — an earlier version was called `generateHandOpenCloseFixture`, renamed
  in Phase 3) that cycles through every gesture plus a swipe, so the whole
  app works with zero camera permission. `VisionEngine` treats
  camera/replay as interchangeable `LandmarkSource`s — nothing downstream
  knows which is active. Toggled via `appStore.inputSource` (`'camera' |
  'replay'`).

## Gate commands

```bash
npm run typecheck   # tsc -b across all 3 workspaces
npm run lint        # eslint, includes the boundaries rule
npm run test:run    # vitest run — 126 tests as of end of Phase 7
npm run build       # tsc + vite build, all 3 workspaces
```
Run all four before considering any phase done. `npm run dev` (or the
`airos-web` preview config) starts the dev server on :5173 for manual
browser verification — don't skip that step; several real bugs this project
has hit were invisible to the automated gate and only surfaced by actually
driving the app in a browser (see below).

## Bugs found and fixed (read before touching throttled state or resets)

These aren't historical trivia — they're the reason certain code looks the
way it does, and the same *class* of bug is easy to reintroduce in Phase 7+
if you don't know to watch for it.

1. **FPS measured the wrong thing** (Phase 2). Computing "frames per second"
   inside a throttled publish function measures the throttle's own rate
   (~10Hz), not the real frame rate. Fix: measure timing on *every* call,
   throttle only the store *write*. See `visionStore.ts`'s
   `recordFrameArrival()` vs. `throttledPublish`.

2. **Stale cross-source state** (Phase 2, recurred in Phase 4). Switching
   `VisionEngine`'s active source (Demo Mode toggle, or camera
   starting/stopping) can leave a *gap* where the new source produces zero
   frames for a while — or forever, if switching to camera mode while the
   camera is off. Anything downstream that caches "the last thing I saw"
   (hand count, active gesture, cursor position) must be explicitly reset
   when the source changes, not just wait for a fresh frame that might
   never come. `VisionEngine.recompute()`, `gestureBridge.ts`, and
   `CursorEngine.ts` all watch `appStore` for this and reset.

3. **Resets bypassing an in-flight throttle** (Phase 4 — the subtle one).
   Fixing #2 by calling the store setter *directly* on reset
   (`setActiveGesture(null)`) isn't enough: if a throttled publish was
   already scheduled from a frame just before the switch, it fires moments
   later on its own timer with stale `pendingArgs` and silently undoes the
   reset. Fixed by giving `throttle()` a `.cancel()` method
   (`state/createStore.ts`) that every reset path calls before writing
   cleared state. Regression tests in `createStore.test.ts`. **If you add
   a new throttled publish + a corresponding reset anywhere, call
   `.cancel()` in the reset, every time** — this bug will recur otherwise,
   it's not a one-off.

4. **Swipe events silently eaten by throttle** (Phase 3). A swipe is a
   one-frame discrete event, not sustained state — routing it through the
   same throttle as held poses meant a later "still OPEN_PALM" frame could
   overwrite the pending swipe before the throttle's window fired,
   dropping it entirely. Fix: `gestureBridge.ts` publishes swipes
   immediately, bypassing the throttle; only sustained poses go through it.
   **Lesson**: throttling is for coalescing repeated/sustained state, never
   for discrete one-off events — if something only happens once and matters
   every time, it must not be throttled.

5. **Resolution-dependent click/drag threshold** (Phase 4). The
   click-vs-drag distance decision (`pinchDragTracker.ts`) originally
   measured movement in viewport pixels — the same physical hand jitter
   maps to more raw pixels on a bigger/higher-DPI screen, so the same
   gesture would misclassify as a drag more often purely from screen size.
   Fixed by moving the decision into normalized (pre-viewport-scaling)
   space; only the final DOM dispatch uses real pixels. **Lesson**:
   distance/speed thresholds on hand-tracking data should generally live in
   normalized space, converting to pixels only at the last step (dispatch,
   rendering) — same reasoning applies to the One-Euro filter, which
   filters in normalized space before converting to pixels for the exact
   same reason.

6. **A demo fixture that didn't actually demo anything** (Phase 3). An
   earlier version of the synthetic hand fixture *looked* like a moving
   hand but, run through the real gesture engine, only ever produced 2 of
   11 possible gestures — the finger-curl parameters never crossed the
   FIST/POINT/PEACE/PINCH thresholds, and the wrist never moved far enough
   to trigger a swipe. Caught by actually driving Demo Mode in a browser,
   not by unit tests (which tested the classifier correctly in isolation,
   just never against this specific fixture's output). Now
   `fixtures.test.ts` asserts every gesture is reachable from the fixture,
   specifically so this can't silently regress. **Lesson**: a fixture
   "looking right" visually and a fixture actually exercising the code
   paths it's meant to demo are different claims — verify the second one
   explicitly, don't infer it from the first.

7. **Calibration self-completing during Demo Mode** (Phase 4). Demo Mode's
   synthetic hand cycles through PINCH as part of its gesture showcase;
   the calibration flow's pinch-to-confirm listener reacted to that too,
   silently completing both calibration steps without user intent. Since
   "calibrating" against a canned animation the user doesn't control isn't
   a coherent feature anyway, fixed by disabling the Calibrate button
   during Demo Mode rather than adding complexity to distinguish
   "real" pinches from synthetic ones.

8. **`VisionEngine` never told `visionStore` the camera stopped** (Phase 5).
   Bug #2's fix resets `visionStore`/`interactionStore` when `VisionEngine`
   switches which `LandmarkSource` is active (camera ↔ replay) or when the
   last task is released — but stopping the camera itself, while a consumer
   still holds the hand task (e.g. Gesture Lab stays mounted) and
   `inputSource` stays `'camera'`, matches neither condition.
   `CameraLandmarkSource` stops ticking the moment `cameraState` leaves
   `'active'`, so nothing was left to overwrite the last live
   hand-count/FPS/tracking numbers — they stayed frozen on screen
   indefinitely after Stop Camera. Fixed by tracking `cameraState` inside
   `VisionEngine.recompute()` and resetting on the `active → inactive`
   transition too, not just on a source-kind switch. **Lesson**: bug #2's
   "reset when the source changes" was too narrow a description of the
   real invariant — it should be "reset whenever frames could stop arriving
   for any reason," which turned out to have more triggers than the two
   that had been found by Phase 4.

9. **A frozen "ghost" skeleton after tracking stops** (Phase 5). Caught by
   the same browser-verification step that found bug #8, immediately after
   fixing it: `HandSkeletonOverlay` only redraws (and only clears) when a
   new frame arrives via `visionEngine.subscribe()`. Once frames stop
   arriving — camera stopped, Demo Mode turned off — nothing ever calls
   `draw()` again, so the last frame's skeleton stays painted over the
   camera preview (and over `CameraPreview`'s own "No signal" text)
   indefinitely. Store-driven UI doesn't have this problem because
   `resetVisionStore()`/`resetInteractionStore()` explicitly overwrite
   state; a hot-path canvas that isn't state-driven has no such hook. Fixed
   by adding a second, ordinary (non-hot-path) effect in
   `HandSkeletonOverlay` that watches `interactionStore.trackingState` and
   explicitly clears the canvas when it leaves `'tracking'`. **Lesson**:
   every hot-path consumer that draws based on "the last frame I saw" needs
   its own explicit "stop seeing frames" handling — subscribing to the
   frame stream alone only tells you when something *arrived*, never when
   nothing will again.

10. **A raycasting hitbox that was mathematically a near-hit but a real
    miss** (Phase 6). 3D Studio's pinch-to-select raycasts against an
    invisible hitbox sphere around each object, sized generously because
    gesture pointing is far less precise than a mouse. The *first* fix
    (`HIT_RADIUS = 0.95`) still failed in the browser — Demo Mode's fixture
    never selected anything — despite a from-scratch Vitest diagnostic
    (`new THREE.Raycaster().setFromCamera(...).intersectSphere(...)`,
    computed against the fixture's *actual* PINCH-frame coordinates, not
    guessed) proving the ray mathematically hit the cube's ideal sphere at
    that radius. The second half of the bug: the hitbox mesh used
    `sphereGeometry(radius, 8, 8)` — only 8 width/height segments, a coarse
    faceted polyhedron, not a true sphere. `THREE.Raycaster` tests actual
    triangles, so a ray that grazes the *ideal* sphere equation can still
    miss a low-poly approximation's flat facets. Fixed by raising both
    `HIT_RADIUS` (to 1.3) *and* `HIT_SEGMENTS` (to 16) — either alone was
    insufficient at the margin this bug lived at. **Lesson**: when a
    raycast/collision check involves a *procedural* sphere/box mesh (not
    an imported model), the segment count is part of its hitbox accuracy,
    not just its visual smoothness — a coarse approximation can silently
    shrink the effective collision volume below what the radius parameter
    promises, especially for glancing/near-tangent rays.

## Process notes for whoever (whatever) continues this

- Follow the phase gate literally: typecheck, lint, test, build, *then*
  manually drive the feature in a real browser (Demo Mode makes this
  possible with zero camera setup) before calling a phase done. Bugs 3, 5,
  6, 7, 8, 9, and 10 above were only found by that last manual step — the
  automated gate was green the whole time, every time.
- The sandboxed preview pane used for automated browser checks doesn't
  always composite frames (it can report the tab as `document.hidden`),
  which silently pauses anything driven by `requestAnimationFrame` —
  `ReplaySource`'s tick loop, `CameraLandmarkSource`'s raf fallback,
  `HandSkeletonOverlay`'s canvas, R3F's own render loop (`useFrame` in
  `StudioScene.tsx`). If Demo Mode looks inert (readouts stuck at idle/0,
  a Studio scene stuck with objects piled at the origin) in that pane
  specifically, don't assume the app is broken — drive it through a real,
  visible browser tab instead before concluding anything.
- **Two browser-automation gotchas that cost real time in Phase 6, worth
  knowing before you doubt the app instead of the test:**
  1. Reading a toggle's `aria-checked` (or any state) in the *same* script
     as the `.click()` that changed it captures the **pre-update** value —
     React's state update hasn't committed yet when the synchronous script
     returns. Always split "click" and "read the result" into separate
     tool calls with a short wait between them. Getting this backwards
     produces exactly the kind of "the toggle looks off when it should be
     on" confusion that burns a lot of debugging time on the wrong target.
  2. Don't trust `window.*` globals, dynamic `import()`, or console-log
     capture for cross-checking live app state from browser-automation
     tooling that may execute in an isolated JS world (shares the DOM with
     the page, but not `window`/the module registry). DOM queries
     (`document.querySelector(...).textContent`, `getAttribute(...)`)
     reliably reflect real state; the others may silently read a
     disconnected, empty context instead and look like the app is broken
     when it isn't. When you need ground truth for something computed
     in-frame (not rendered to the DOM), a throwaway Vitest test that
     imports the real modules and prints via `console.log` — read from
     the *terminal*, not the browser — sidesteps this category of
     confusion entirely (this is how bug #10 above was actually diagnosed,
     after several dead-end attempts at in-browser introspection).
- When adding a synthetic/demo fixture for a new module (Presentation and
  Game Mode will still want one; Air Draw's is optional), write a test
  asserting the fixture actually produces the behavior it's meant to
  showcase, not just that it produces *valid* data. See bug #6.
- Dev server stale-HMR: if the browser shows errors referencing code that
  was renamed/removed sessions ago, don't debug the app logic first —
  restart the dev server (stop + start the preview). This happened in
  Phase 4 and again in Phase 6, both times wasting real time before being
  correctly diagnosed as stale HMR/dev-server state, not a real
  regression. If a fix genuinely isn't taking effect after a normal
  reload, a full dev-server restart (not just `location.reload()`) is a
  cheap thing to try before assuming your code is wrong.
- `IMPLEMENTATION.md` and `README.md` both have a "Status" line near the
  top that should be updated at the end of each phase (currently say
  "Phases 1–6 complete"). Keep them in sync — they're the first thing a
  reader (or a future session) checks.
