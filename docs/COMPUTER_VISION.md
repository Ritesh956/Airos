# Computer Vision

> **Status: hand tracking (Phase 2), face tracking (Phase 9), and pose
> tracking (Phase 10) are all implemented.** This document describes what's
> actually in the codebase today.

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
per-detection confidence score — the **Face Landmarker** — up to 478 3D
landmarks for a single face (`numFaces: 1`; this is a single-user tool,
not a room-scanning one) — and the **Pose Landmarker** — 33 3D landmarks
for a single body (`numPoses: 1`, `lite` model variant), reusing the same
`VisionEngine`/`LandmarkSource` machinery the other two already use.

## Where the model files live

`@mediapipe/tasks-vision`'s WASM runtime (~30MB across its SIMD/non-SIMD/
module variants), the Hand Landmarker model (~8MB), the Face Landmarker
model (~4MB), and the Pose Landmarker `lite` model (~5.8MB) are vendored
into `apps/web/public/models/` rather than loaded
from a third-party CDN at runtime — self-hosted, so the app doesn't depend
on Google's CDN being reachable in production. These are large, slow-
changing binaries, so they're **not committed to git**:
`apps/web/scripts/fetch-models.mjs` fetches them (copies the WASM files
from the installed npm package, downloads each `.task` model from Google's
model-hosting bucket) and runs automatically on `npm install` via a
`postinstall` hook. Run `npm run models:fetch` manually if
`public/models/` ever needs regenerating.

## The pipeline, as built

```
Video frame (from CameraLandmarkSource, or a fixture from ReplaySource)
  -> HandLandmarker.detectForVideo()          [vision/hand/HandLandmarkerService.ts]
  -> HandObservation[]                         MODEL — landmarks + handedness
  -> FaceLandmarker.detectForVideo()          [vision/face/FaceLandmarkerService.ts]
  -> FaceObservation | null                    MODEL — landmarks only, see below
  -> PoseLandmarker.detectForVideo()          [vision/pose/PoseLandmarkerService.ts]
  -> PoseObservation | null                    MODEL — landmarks only, see below
  -> VisionFrame                               [vision/types.ts]
  -> VisionEngine.handleFrame()                [vision/engine/VisionEngine.ts]
       -> visionStore (throttled ~10Hz)         cold path — FPS, hand/face/pose presence, text UI
       -> direct subscribers                    hot path — Hand/Face/PoseSkeletonOverlay, per frame
```

All three landmarkers run against the same video frame and timestamp,
gated independently by `VisionTaskRequest.hand`/`.face`/`.pose` — a module
that only acquires `{ hand: true }` never pays for face or pose inference
at all (see "Task subscription" below). Gesture classification (turning
hand landmarks into PINCH/FIST/etc.) is `gestures/` — see
`docs/GESTURES.md`. Pose's joint-angle computation
(`vision/pose/poseAngles.ts`) is a much smaller cousin of that: DERIVED
arithmetic on MODEL landmark positions, not a classifier, computed on
demand by whatever reads it rather than published into `VisionFrame`
itself.

## Face Landmarker: tracking only, by design

Phase 9's gate is literal: *"Tracking only — no attribute claims."* This
shapes `FaceLandmarkerService.ts` in a way worth calling out explicitly,
since the MediaPipe API makes the opposite choice easy to reach for:

- `outputFaceBlendshapes` stays unset. MediaPipe's blendshapes are a
  per-frame classification score for things like "smiling," "eyebrow
  raised," or "jaw open" — exactly the kind of expression/attribute
  inference the gate forbids. It isn't requested, not just unused, so the
  capability isn't one Readout away from someone adding it later without
  re-deriving why not to.
- `outputFacialTransformationMatrixes` also stays unset — nothing in this
  phase renders a 3D face model or AR effect, so there's no consumer for
  a pose/orientation matrix.
- The overlay (`vision/face/FaceMeshOverlay.tsx`) draws raw landmark
  connections — face oval, eyes, eyebrows, lips — and nothing else. No
  "openness" ratio, no derived expression state, no identity or age
  guess. Every point on screen is a MODEL landmark position, geometrically
  connected; nothing is classified.
- `numFaces: 1` — this is a single-user tool throughout, not a
  room-scanning one, matching the framing everywhere else in the app.

## Pose Landmarker: 33 landmarks, and the one derived computation

Phase 10's gate is different in kind from Phase 9's: *"Angles correct vs.
manual check."* Face tracking's gate forbade computing anything beyond
raw landmark positions; pose tracking's whole deliverable **is** a
derived computation on top of them — joint angles — so this phase adds
exactly one small piece of arithmetic rather than staying purely
tracking-only:

- `vision/pose/PoseLandmarkerService.ts` mirrors
  `FaceLandmarkerService.ts`'s structure (lazy singleton, `numPoses: 1`
  — single-user throughout). `outputSegmentationMasks` stays unset for
  the same "unset, not requested-and-ignored" reason face blendshapes
  are unset — no background-removal/body-cutout feature exists anywhere
  to consume a mask. Uses the `lite` model variant (MediaPipe ships
  lite/full/heavy): this is the third task that can run in the same
  frame as hand and face detection, and the performance budget
  (IMPLEMENTATION.md §9) has no room to spend on accuracy the angle
  readouts don't need.
- `vision/pose/poseAngles.ts`'s `computePoseAngles()` is the one derived
  value: left/right elbow and knee angles in degrees, via `jointAngle()`
  from `gestures/geometry.ts` — the identical angle-between-three-points
  math the gesture engine already uses for finger-curl detection, reused
  rather than reimplemented. It's a pure function of a `PoseObservation`,
  called on demand by whatever reads it (`hooks/usePoseAngles.ts`), not
  published as part of `VisionFrame`.
- `vision/pose/PoseSkeletonOverlay.tsx` draws every
  `PoseLandmarker.POSE_CONNECTIONS` edge — at only 33 points, pose has
  none of the face mesh's "too dense to read" problem, so unlike
  `FaceMeshOverlay.tsx` there's no subset curation.

## Demo Mode's face fixture: real topology, synthetic positions

`vision/replay/faceMesh.ts` generates a synthetic face for Demo Mode, and
it solves a problem the hand fixture doesn't have. `FaceLandmarker`'s
connection constants (`FACE_LANDMARKS_FACE_OVAL`, `_LEFT_EYE`, etc.)
reference *specific* canonical landmark indices — drawing them against
synthetic points only looks face-shaped if those specific indices sit in
roughly the right place. Rather than hardcoding ~150 canonical index
positions from memory (error-prone, and silently wrong is worse than
loudly wrong), `walkConnectionsIntoLoops` reads the *real* connection
constants at build time and walks each into an ordered loop or chain, so
placement only has to answer "where does this contour sit on a face"
(an ellipse, an arc), never "which index is the eye's outer corner."
A gentle blink and mouth-open pulse animate over time, independent of
whatever the synthetic hand is doing — purely synthetic landmark movement,
never displayed as a "blinking" or "talking" claim anywhere, for the same
reason the real service never requests blendshapes.

## Demo Mode's pose fixture: hand-placed, not topology-walked

`vision/replay/poseSkeleton.ts` generates a synthetic standing figure for
Demo Mode, but deliberately doesn't reuse `walkConnectionsIntoLoops` —
MediaPipe's 33-point BlazePose topology is small and fixed (indices like
"left elbow" or "right knee" are known constants, unlike a face's ~150
densely-packed contour indices), so hand-placing them directly was judged
simpler than deriving positions from the connection graph. All 33 points
are placed for a static standing pose; only the right elbow animates,
smoothly sweeping between two deliberately verifiable extremes — a fully
straight arm (180°) and a forearm folded perpendicular to the upper arm
(90°) — rather than an arbitrary gesture that would be hard to check by
eye. `poseSkeleton.test.ts` asserts both extremes land at the calibrated
angle, the same "prove the fixture actually demos its claimed behavior"
discipline `fixtures.test.ts` established for the hand fixture (see
CLAUDE.md bug #6).

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
screen/canvas space (`HandSkeletonOverlay.tsx` and `FaceMeshOverlay.tsx`
both go through it, never mirroring inline themselves).

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

All three MediaPipe tasks this project uses (hand, face, pose) are now
wired up; Phase 11 (Voice + Command Center) adds a fourth input modality
that isn't computer vision at all — the Web Speech API, dispatched through
the existing `CommandRouter` (see IMPLEMENTATION.md §8) — so no changes
are expected in this file. `docs/GESTURES.md` documents how hand
landmarks become named gestures.
