# Computer Vision

> **Status: hand tracking implemented (Phase 2).** Face and pose tracking
> are still Phase 9/10 — see IMPLEMENTATION.md §11. This document describes
> what's actually in the codebase today.

## What AIR OS uses, and why

AIR OS does not train or run a custom neural network. It uses Google's
**MediaPipe Tasks Vision** — pretrained, browser-compatible models that run
entirely client-side via WebAssembly/WebGL. This is a deliberate choice
stated in the project brief: the person building this is a software
engineer new to ML, and the value of this project is in the *system*
(pipeline design, real-time performance, interaction quality) rather than
in model training. See IMPLEMENTATION.md's "Important Development
Principle".

Currently wired up: the **Hand Landmarker** — 21 3D landmarks per hand, up
to 2 hands, plus a handedness (left/right) classification and a
per-detection confidence score. Face Landmarker and Pose Landmarker follow
in Phase 9/10, reusing the same `VisionEngine`/`LandmarkSource` machinery.

## Where the model files live

`@mediapipe/tasks-vision`'s WASM runtime (~30MB across its SIMD/non-SIMD/
module variants) and the Hand Landmarker model (~8MB) are vendored into
`apps/web/public/models/` rather than loaded from a third-party CDN at
runtime — self-hosted, so the app doesn't depend on Google's CDN being
reachable in production. These are large, slow-changing binaries, so
they're **not committed to git**: `apps/web/scripts/fetch-models.mjs` fetches
them (copies the WASM files from the installed npm package, downloads the
`.task` model from Google's model-hosting bucket) and runs automatically on
`npm install` via a `postinstall` hook. Run `npm run models:fetch` manually
if `public/models/` ever needs regenerating.

## The pipeline, as built

```
Video frame (from CameraLandmarkSource, or a fixture from ReplaySource)
  -> HandLandmarker.detectForVideo()          [vision/hand/HandLandmarkerService.ts]
  -> HandObservation[]                         MODEL — landmarks + handedness
  -> VisionFrame                               [vision/types.ts]
  -> VisionEngine.handleFrame()                [vision/engine/VisionEngine.ts]
       -> visionStore (throttled ~10Hz)         cold path — FPS, hand count, text UI
       -> direct subscribers                    hot path — HandSkeletonOverlay, per frame
```

Gesture classification (turning landmarks into PINCH/FIST/etc.) is Phase 3
— not yet built. Today, a `VisionFrame`'s hand data goes straight to the
skeleton overlay and the vision store; nothing interprets it as a gesture
yet.

## Task subscription — the actual API

Modules don't touch a camera or a `LandmarkSource` directly:

```ts
useVisionTask({ hand: true, face: false, pose: false });
```

`VisionEngine` (a singleton, `vision/engine/VisionEngine.ts`) tracks every
mounted consumer's request, runs the union of whatever's currently asked
for, and releases automatically on unmount (`hooks/useVisionTask.ts`). Two
modules both wanting hands share one running detector. See
IMPLEMENTATION.md §1.2.

## `LandmarkSource`: the camera/replay abstraction

```ts
interface LandmarkSource {
  readonly kind: 'camera' | 'replay';
  start(tasks: VisionTaskRequest): Promise<void>;
  stop(): void;
  updateTasks(tasks: VisionTaskRequest): void;
  subscribe(callback: (frame: VisionFrame) => void): () => void;
}
```

Two implementations exist, and `VisionEngine` switches between them based
on `appStore.inputSource` without any consumer caring which is active:

- **`CameraLandmarkSource`** (`vision/engine/CameraLandmarkSource.ts`) —
  the real thing. Deliberately does *not* call `getUserMedia` itself; it
  follows whatever state `CameraManager` is already in (camera permission
  is still only ever requested from the explicit "Start Camera" click, per
  IMPLEMENTATION.md §6) and runs its detection loop via
  `requestVideoFrameCallback` (falling back to `requestAnimationFrame` if
  unavailable) only while the camera is actually active.
- **`ReplaySource`** (`vision/replay/ReplaySource.ts`) — plays back a
  `VisionFrame[]` fixture at wall-clock rate, looping. Demo Mode (the
  toggle on the Home screen) is just this class instead of the other one —
  no separate "demo UI" code path exists anywhere downstream.

### The demo fixture is synthetic, and says so

`vision/replay/fixtures.ts` procedurally generates a plausible hand
open/close motion — it is **not** a recording of a real hand. It's built
to be geometrically self-consistent (correct MediaPipe landmark ordering
and joint angles) so it exercises the same code paths a camera frame
would, not to be indistinguishable from real tracking. The UI labels this
state "Demo · Recorded" rather than implying live tracking.

## Coordinate conventions (read this before touching landmark math)

MediaPipe emits **unmirrored** normalized coordinates in `[0, 1]`. Neither
`vision/` nor `gestures/` may mirror them — mirroring is a *presentation*
concern, applied exactly once, in `utils/coords.ts`, when mapping to
screen/canvas space (see `HandSkeletonOverlay.tsx` for the one place that
currently does this).

This applies to **handedness** too, and it's the single most common gotcha
in projects like this: MediaPipe's `Left`/`Right` label is computed on the
unmirrored image, so it's the *opposite* of the user's own sense of their
left/right hand (a front-facing camera shows a mirror image). Anything that
wants "the user's actual dominant hand" must call `mirrorHandedness()` —
see the doc comment on `HandObservation.handedness` in `vision/types.ts`.

## A real bug this caught, worth knowing about

Two bugs surfaced during Phase 2's browser verification, both in how
frames become UI state (`state/visionStore.ts` and
`vision/engine/VisionEngine.ts`):

1. **FPS was measuring the wrong thing.** The throttle wrapper around
   `publishVisionFrame` meant the "now minus last-frame-time" calculation
   only ever saw calls ~100ms apart — so the FPS readout reported the
   *throttled publish rate* (~10Hz), not the real detection rate. Fixed by
   recording frame-arrival timing on every call (untouched by the
   throttle) and only throttling the store *write*.
2. **Switching sources left stale numbers on screen.** Turning Demo Mode
   off while the camera then failed to start (denied permission) kept
   showing the demo fixture's last hand-count/FPS values, because nothing
   ever overwrote them if the new source never ticked. Fixed by resetting
   `visionStore` at the moment `VisionEngine` switches which `LandmarkSource`
   is active, not only when every task is released.

Both are the kind of bug that's invisible in isolated unit tests (each
piece was individually "correct") and only shows up when you actually
drive the feature in a browser — which is why that's part of this
project's phase gate, not an optional step.

## What's next

Phase 3 (Gesture engine) turns `HandObservation.landmarks` into named
gestures — see `docs/GESTURES.md`, which documents the classification
approach that isn't built yet. Phase 9/10 add `FaceLandmarker` and
`PoseLandmarker` behind this same `LandmarkSource`/`VisionEngine` pair, no
architectural changes required.
