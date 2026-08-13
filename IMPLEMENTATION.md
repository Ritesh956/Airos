# AIR OS — Implementation Plan

> **Interact with your computer without touching it.**

This is the working engineering document for AIR OS. It defines the architecture,
the contracts between layers, the phase order, and the definition of done for each
phase. It is meant to be read by a developer, updated as the build progresses, and
used as the source of truth when a decision needs re-litigating.

**Status:** Phases 1–12 complete. Phases 13–14 pending.

---

## 0. Product summary

AIR OS is a browser-based, touchless computer interface. A webcam feed is processed
**entirely on-device** by pretrained MediaPipe models. Hand landmarks are converted
into gestures by a rule-based geometry engine, gestures become interaction events,
and interaction events drive nine application modules — a cursor, a gesture lab, a
3D studio, a drawing canvas, a presentation controller, a game, analytics, and
settings.

Camera frames never leave the browser. There is no frame upload, no server-side
inference, and no footage storage.

---

## 1. Deviations from the original brief

The brief was solid. These are the changes I made and the reasoning, so future-me
knows they were deliberate rather than drift.

### 1.1 Demo Mode — a `LandmarkSource` abstraction (**new**)

The brief assumes a camera is always the input. That is a problem for a portfolio
project: the first thing a visitor sees is a permission prompt, and many will bounce.
It is also a problem for testing, because camera input is non-deterministic.

So the pipeline does not consume a camera. It consumes a `LandmarkSource`:

```
interface LandmarkSource {
  start(): Promise<void>
  stop(): void
  readonly kind: 'camera' | 'replay'
  subscribe(cb: (frame: VisionFrame) => void): () => void
}
```

- `CameraSource` — getUserMedia + MediaPipe inference. The real thing.
- `ReplaySource` — plays back a recorded `VisionFrame[]` fixture at wall-clock rate.

Every module downstream is source-agnostic. This buys three things at once: a
zero-permission demo mode, deterministic unit/integration tests for the gesture
engine, and a debugging tool (record a failing gesture, replay it frame by frame).

The UI must always show which source is active. Replay mode is labelled **DEMO
(RECORDED)** and is never presented as live tracking.

### 1.2 Task subscription — modules declare what they need

The brief lists hand, face, and pose tracking. Running all three MediaPipe
landmarkers on every frame will not hold 30fps on a laptop iGPU. Rather than
discovering this in Phase 10, the vision engine is designed around it now:

```
visionEngine.acquire({ hand: true, face: false, pose: false })  // returns a release handle
```

Modules acquire the tasks they need on mount and release on unmount. The engine
runs the union of all active requests, and lazily loads a model the first time it
is requested. Air Cursor asks for hands only; the Face Lab asks for face only.

### 1.3 One-Euro filter for cursor smoothing

The brief says "smooth cursor movement, reduce jitter". The naive answer is an
exponential moving average, which trades latency for smoothness on a fixed curve
and feels bad at both ends. The One-Euro filter (Casiez et al., CHI 2012) adapts
its cutoff frequency to hand speed: heavy smoothing when the hand is nearly still
(kills jitter), light smoothing when it moves fast (kills lag). It is ~40 lines,
has two tunable parameters exposed in Settings, and is the correct engineering
answer here.

### 1.4 Structural honesty about model vs. heuristic

The brief repeatedly — and rightly — insists we not pass off heuristics as AI.
Prose promises decay. So this is enforced in the type system: every value surfaced
to the UI carries provenance.

```
type Method = 'MODEL' | 'HEURISTIC' | 'DERIVED'
```

- `MODEL` — came out of a neural network (landmark positions, handedness score).
- `HEURISTIC` — rule-based geometry (all gesture classifications).
- `DERIVED` — arithmetic on the above (joint angles, velocities, FPS).

The readout components take `Method` as a required prop and render a provenance
badge. A gesture confidence therefore renders as `PINCH · 0.94 · HEURISTIC`, and
there is no code path that renders it any other way. Gesture "confidence" is
documented as a normalized geometric margin, not a probability.

### 1.5 Gesture engine is pure and unit-tested

The gesture engine is a pure function of `(landmarks, history) -> GestureResult`.
No DOM, no React, no timers it doesn't own. It ships with Vitest tests driven by
recorded landmark fixtures. This is the single highest-signal piece of engineering
in the project and the brief did not mention testing at all.

### 1.6 Keyboard parity

Every gesture-driven action has a keyboard equivalent, routed through the same
Command Router as voice and gestures. Rationale: accessibility, demoability
without a camera, and it forces the command layer to be genuinely decoupled
rather than gesture-shaped.

### 1.7 Monorepo via npm workspaces

`apps/web`, `apps/server`, `packages/shared`. The shared package holds the wire
protocol and cross-cutting types so the client and server cannot drift. This costs
almost nothing and reads far better than a `server.js` dropped next to `src/`.

### 1.8 Explicit degradation ladder

"Handle low FPS" is not actionable. The concrete policy is in §9.

### 1.9 Cursor calibration

Mapping the camera's normalized space to the screen 1:1 means the screen corners
sit at the edge of the camera frame, where hand tracking is least reliable and the
user's arm is fully extended. A short 4-corner calibration defines a comfortable
*reach box* that maps to the full screen. Stored in localStorage, skippable, with
a sensible default (the centre 60% × 60% of frame).

---

## 2. Repository layout

```
AIR-OS/
├── IMPLEMENTATION.md          ← this file
├── README.md
├── package.json               ← npm workspaces root
├── docs/
│   ├── ARCHITECTURE.md
│   ├── COMPUTER_VISION.md
│   ├── GESTURES.md
│   ├── PERFORMANCE.md
│   └── DEVELOPMENT.md
├── packages/shared/           ← wire protocol + cross-cutting types
│   └── src/
│       ├── protocol.ts        ← WebSocket message contracts
│       └── index.ts
├── apps/server/               ← intentionally minimal Node backend
│   └── src/
│       ├── index.ts           ← express: /api/health, static prod serve
│       └── ws.ts              ← WebSocket relay (rooms; future multiplayer)
└── apps/web/
    ├── public/models/         ← vendored .task model files + wasm
    └── src/
        ├── main.tsx
        ├── App.tsx            ← routing + providers only. No feature logic.
        ├── app/
        │   ├── shell/         ← AppShell, Nav, StatusBar, CommandPalette
        │   └── routes.tsx     ← module registry (single source of nav truth)
        ├── vision/
        │   ├── camera/        ← CameraManager, permission + lifecycle
        │   ├── engine/        ← VisionEngine, LandmarkSource, task subscription
        │   ├── hand/          ← HandLandmarker wrapper
        │   ├── face/          ← FaceLandmarker wrapper
        │   ├── pose/          ← PoseLandmarker wrapper
        │   └── replay/        ← ReplaySource + fixtures
        ├── gestures/          ← pure engine. no imports from ui/ or state/.
        │   ├── engine.ts
        │   ├── classifiers/   ← static pose classifiers
        │   ├── temporal/      ← swipe detection, hysteresis, debounce
        │   └── types.ts
        ├── interaction/
        │   ├── cursor/        ← One-Euro filter, calibration, screen mapping
        │   └── commands/      ← Command Router (gesture | voice | keyboard | text)
        ├── modules/           ← the nine features. one folder each.
        │   ├── home/  cursor/  lab/  studio/  draw/
        │   └── present/  game/  analytics/  settings/
        ├── state/
        │   ├── createStore.ts ← tiny external store
        │   ├── appStore.ts    ← mode, theme, settings, cameraState
        │   ├── visionStore.ts ← hands, face, pose, fps  (throttled publish)
        │   └── interactionStore.ts
        ├── ui/                ← design system primitives (Panel, Badge, Readout…)
        ├── hooks/
        └── utils/
```

**Hard rule:** `gestures/` may not import from `state/`, `ui/`, or `modules/`.
Enforced by review, and later by an ESLint boundary rule.

---

## 3. The real-time loop

```
CameraSource                             ReplaySource
    │  MediaStream                            │  fixture playback
    └──────────────┬──────────────────────────┘
                   ▼
            VisionEngine            requestVideoFrameCallback loop
                   │                (falls back to rAF)
                   ▼
        MediaPipe Tasks Vision      detectForVideo(frame, timestamp)
                   │
                   ▼
             VisionFrame            landmarks + handedness + timings
                   │
        ┌──────────┴───────────┐
        ▼                      ▼
  visionStore.publish()   GestureEngine      ← pure, synchronous
  (throttled to ~10Hz)         │
        │                      ▼
        │              InteractionEngine     ← cursor filter, hysteresis
        │                      │
        │                      ▼
        │              interactionStore / CommandRouter
        ▼                      ▼
  React (cold UI)        rAF consumers read refs (hot UI)
```

### Why the split

React re-rendering at 30–60fps is the classic failure mode for this kind of app.
So there are two data paths:

- **Hot path** — landmark positions, cursor coordinates, 3D object transforms.
  Written to refs / mutable store slots. Consumed inside `requestAnimationFrame`
  loops and canvas/WebGL draw calls. **Zero React renders.**
- **Cold path** — FPS, current gesture *name*, camera state, hand count. Published
  through `useSyncExternalStore` with a throttle (≈10Hz) and a change guard, so a
  stable gesture publishes once, not sixty times a second.

Rule of thumb: if it changes every frame and is drawn on a canvas, it never touches
React state.

---

## 4. Core type contracts

Defined in Phase 1, stable thereafter. Everything downstream depends on these.

```ts
type Method = 'MODEL' | 'HEURISTIC' | 'DERIVED'

/** Normalized landmark. x,y in [0,1] relative to the *unmirrored* frame.
 *  z is relative depth (smaller = closer to camera), not metric. */
interface Landmark { x: number; y: number; z: number; visibility?: number }

interface HandObservation {
  landmarks: Landmark[]          // 21, MediaPipe ordering
  worldLandmarks: Landmark[]     // metric, wrist-origin
  handedness: 'Left' | 'Right'
  handednessScore: number        // MODEL
}

interface VisionFrame {
  timestamp: number              // performance.now() at capture
  hands: HandObservation[]
  face: FaceObservation | null
  pose: PoseObservation | null
  timings: { inferenceMs: number; totalMs: number }
  source: 'camera' | 'replay'
}

type GestureKind =
  | 'OPEN_PALM' | 'FIST' | 'POINT' | 'PINCH' | 'THUMBS_UP'
  | 'THUMBS_DOWN' | 'PEACE' | 'NONE'
  | 'SWIPE_LEFT' | 'SWIPE_RIGHT' | 'SWIPE_UP' | 'SWIPE_DOWN'

interface GestureResult {
  gesture: GestureKind
  /** Normalized geometric margin in [0,1]. NOT a model probability. */
  confidence: number
  method: Method                 // always 'HEURISTIC' for gestures
  hand: 'Left' | 'Right'
  timestamp: number
  landmarks: Landmark[]
}
```

### Coordinate spaces — one place, one convention

Mirroring bugs are the most common way these projects rot. The rule:

1. MediaPipe emits **unmirrored** normalized coords. Never mutate them.
2. Mirroring is a *presentation* concern, applied once in `utils/coords.ts`.
3. Screen mapping is `frame → calibrated reach box → viewport px`, and it lives
   in exactly one function.

---

## 5. State architecture

Three stores, no global soup. Each is a ~40-line external store with
`getSnapshot` / `subscribe`, consumed via `useSyncExternalStore`.

| Store | Owns | Update rate | Persisted |
|---|---|---|---|
| `appStore` | activeModule, theme, settings, cameraState, source kind | user-driven | localStorage |
| `visionStore` | hand/face/pose presence, counts, fps, inference ms | throttled 10Hz | no |
| `interactionStore` | cursor state, activeGesture, selection, drag state | event-driven | no |

Raw landmark arrays live in a **ref channel** (`visionEngine.latest`), not in a
store, because nothing gains from re-rendering on them.

---

## 6. Camera lifecycle

States: `OFF → STARTING → ACTIVE → (STOPPING → OFF | ERROR)`

- Permission requested **only** on explicit user activation. Never on page load.
- On stop: stop every `MediaStreamTrack`, null the `srcObject`, cancel the frame
  callback, and close the MediaPipe landmarkers. Verified by the OS camera LED.
- The camera state is always visible in the status bar. There is no state in which
  the camera is running without the UI saying so.

Error taxonomy, each with a distinct, actionable message:

| Cause | Detection | Message |
|---|---|---|
| Permission denied | `NotAllowedError` | how to re-grant in browser settings |
| No camera present | `NotFoundError` | suggests Demo Mode |
| Camera in use | `NotReadableError` | name the likely culprit apps |
| Insecure context | `!isSecureContext` | requires https or localhost |
| No WebGL2 / WASM | feature probe | browser support matrix |
| Model fetch failed | fetch rejection | retry button + offline note |

Nothing fails silently.

---

## 7. Gesture recognition approach

**This is rule-based geometry, not a trained classifier.** Labelled `HEURISTIC`
everywhere, and `docs/GESTURES.md` states the exact rules and thresholds.

**Static poses** — per-finger extension via joint-angle and tip-vs-PIP tests,
normalized by hand scale (wrist→middle-MCP distance) so results are
distance-invariant. Yields a 5-bit finger state plus thumb orientation, matched
against pose templates. Confidence = normalized margin between the best and
second-best template.

**Pinch** — thumb-tip↔index-tip distance normalized by hand scale, with Schmitt
trigger thresholds (enter 0.28, exit 0.38) so it cannot chatter at the boundary.

**Temporal gestures (swipes)** — velocity of the palm centroid over a ring buffer
(~300ms), requiring a dominant axis, a minimum displacement, and a cooldown.

**Stability** — every gesture must hold for N consecutive frames before it is
emitted (default 3), and there is a global cooldown per gesture kind. This is the
difference between a demo that looks impressive and one that flickers.

---

## 8. Command Router

One funnel for every input modality:

```
gesture ─┐
voice   ─┼─► CommandRouter.dispatch(Command) ─► handler registry ─► app state
keyboard─┤
text    ─┘
```

Commands are declarative and registered by modules:

```ts
router.register({
  id: 'nav.studio',
  title: 'Open 3D Studio',
  phrases: ['open 3d studio', 'three d studio', 'open studio'],
  keys: ['g', '3'],
  run: () => appStore.setModule('studio'),
})
```

The Command Palette, voice recognition, and keyboard handler all read the same
registry. Voice uses the Web Speech API where available and degrades to the text
palette where not. **No LLM is required for any of this** — the registry is
designed so an LLM could later map free-form text to a command id, but the
built-in matcher is deterministic phrase matching.

No component hard-codes a voice string. Ever.

---

## 9. Performance budget and degradation ladder

Targets on a 2020-class laptop, Chromium:

| Metric | Target | Ceiling |
|---|---|---|
| End-to-end frame time | ≤ 22ms | 33ms |
| Hand inference | ≤ 12ms | 20ms |
| React renders/sec, steady state | < 12 | 20 |
| Cursor motion-to-photon | ≤ 60ms | 100ms |

All measured with `performance.now()` around real work. **No metric is ever
estimated, faked, or smoothed to look better than it is.** The FPS graph plots
actual inter-frame deltas.

Degradation ladder — triggered when the rolling median FPS stays under 20 for 3
seconds, applied in order, each announced in the status bar:

1. Drop camera capture to 640×480.
2. Reduce `numHands` from 2 to 1 (only if the active module allows it).
3. Halve inference rate (infer every other frame, interpolate cursor between).
4. Disable secondary tasks (face/pose) if the active module doesn't require them.
5. Surface a banner recommending Demo Mode, with a link to the perf panel.

Each step is reversible when FPS recovers, with hysteresis to avoid oscillation.

---

## 10. Backend scope

Deliberately tiny. The app is fully functional with the server offline.

- `GET /api/health` — version, uptime, model manifest.
- `WS /ws` — room join/leave, presence, and a typed relay for `GestureStateMessage`.
  Nothing is persisted. This exists to make the multiplayer architecture *real but
  unused*, per the brief.
- Serves the built client in production.

**The server never receives a camera frame or an image.** The WS protocol carries
only compact gesture/cursor state — enforced by the `packages/shared` types.

---

## 11. Phase plan

Each phase ends with the same gate: `npm run typecheck && npm run lint && npm run
test && npm run build` all clean, dev server runs, feature manually verified in
Chromium, and no console errors. **No phase starts while the previous one is
broken.**

| # | Phase | Key deliverable | Gate |
|---|---|---|---|
| 1 | **Architecture + Camera** | Monorepo, design system, shell, routing, 3 stores, camera lifecycle, error taxonomy, backend, docs skeleton | Camera starts/stops cleanly; LED off on stop; all 9 routes navigable |
| 2 | Hand tracking | HandLandmarker, VisionEngine, task subscription, skeleton overlay, real FPS | 2 hands tracked, ≥25fps, teardown verified |
| 3 | Gesture engine | Pure classifiers, hysteresis, swipes, **Vitest suite** | All 11 gestures detected; tests green |
| 4 | Air Cursor | One-Euro filter, calibration, click/drag, HUD | Can click real UI targets reliably |
| 5 | Gesture Lab | Landmark table, gesture timeline, overlay toggles | Live readouts correct |
| 6 | 3D Studio | R3F scene, gesture manipulation, two-hand scale/rotate | Smooth, no teleporting |
| 7 | Air Draw | Smoothed strokes, undo/redo, colors, PNG export, IndexedDB | Export produces valid PNG |
| 8 | Presentation | Slides, swipe nav, presenter HUD, timer | Swipes reliable, no double-fires |
| 9 | Face tracking | FaceLandmarker, mesh/eye/mouth viz | Tracking only — no attribute claims |
| 10 | Pose tracking | PoseLandmarker, skeleton, joint angles | Angles correct vs. manual check |
| 11 | Voice + Command Center | Web Speech, Command Router, palette | Commands execute; graceful degrade |
| 12 | Game Mode | Gesture-controlled game | Playable end-to-end by hand alone |
| 13 | Analytics + Perf | Real metrics, FPS graph, debug mode, degradation ladder | Metrics match DevTools |
| 14 | Polish | Motion design, a11y pass, README, demo fixtures, deploy | Lighthouse ≥90; demo mode works |

---

## 12. Quality bar

Non-negotiables carried from the brief:

- No fake buttons. Every control performs a real function.
- No placeholder AI. No fabricated confidence values.
- No heuristic described as a model — see §1.4, enforced in types.
- No animation used to disguise missing functionality.
- No silent failures.
- No camera frame leaves the device.

Added:

- No `any` in committed code without a justifying comment.
- No feature merged without its keyboard fallback.
- `App.tsx` contains routing and providers only, permanently.

---

## 13. Open questions

Parked until the relevant phase; recorded so they don't get silently decided.

1. **Web Worker for inference** — moving MediaPipe off the main thread would
   protect render smoothness, but complicates GPU delegate setup and adds transfer
   cost. Deferred to Phase 13, measured first. `VisionEngine` is deliberately an
   async, message-shaped interface so this becomes a swap, not a rewrite.
2. **Model hosting** — vendored into `public/models/` for offline use and CDN
   independence. Revisit if bundle size becomes a deployment problem.
3. ~~**Two-hand rotation mapping**~~ — **Resolved in Phase 6**: vector angle
   (the angle of the line between the two hands' pinch points, relative to
   where it pointed when the two-hand gesture started), the same mental
   model as a touchscreen two-finger pinch-to-zoom-and-rotate. See
   `interaction/studio/twoHandGesture.ts`'s doc comment.
