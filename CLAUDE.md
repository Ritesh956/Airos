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

## Status: Phases 1–13 complete. Resume at Phase 14 (Polish).

| # | Phase | Status |
|---|---|---|
| 1 | Architecture + Camera | ✅ done |
| 2 | Hand tracking | ✅ done |
| 3 | Gesture engine | ✅ done |
| 4 | Air Cursor | ✅ done |
| 5 | Gesture Lab | ✅ done |
| 6 | 3D Studio | ✅ done |
| 7 | Air Draw | ✅ done |
| 8 | Presentation | ✅ done |
| 9 | Face tracking | ✅ done |
| 10 | Pose tracking | ✅ done |
| 11 | Voice + Command Center | ✅ done |
| 12 | Game Mode | ✅ done |
| 13 | Analytics + Perf | ✅ done |
| **14** | **Polish** | **← start here** |

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

## Phase 8 shipped: Presentation

`apps/web/src/modules/present/PresentModule.tsx` is the real module now.
The first phase with **no `interaction/present/` Interaction Engine at
all** — a deliberate absence, not an oversight: every gesture this module
needs (SWIPE_LEFT/RIGHT, THUMBS_UP, FIST, OPEN_PALM) is already a fully
classified, published value in `interactionStore.activeGesture`, and
Presentation needs no per-frame hand *position* the way Cursor/Studio/Draw
do. Adding an engine class here would be a hot-path abstraction with
nothing hot to do. Composed from:
- `modules/present/presentStore.ts` — slide index (clamped, never
  wrapping) and a stopwatch-style timer (`accumulatedMs` banked from past
  run segments + `runStartedAt` for the live segment, so pausing/resuming
  never drifts). Every bit of timing/bounds math is a pure, exported
  function (`applyStartTimer`/`applyPauseTimer`/`computeElapsedMs`/
  `clampSlideIndex`) the store's public actions just call — 11 Vitest
  cases cover the math directly, no store or real clock involved, same
  "pure core, thin store wrapper" split `drawStrokes.ts` uses.
- `modules/present/usePresentGestureCommands.ts` — the one hook that
  *does* all the gesture-to-action work an engine would otherwise own. Its
  entire job is correctly separating two edge-detection semantics that
  look similar but aren't: swipes are one-shot events (react to *every*
  new `activeGesture` publish, since `gestureBridge` never republishes the
  same swipe — this is what makes two consecutive same-direction swipes
  both register, not just the first), while THUMBS_UP/FIST/OPEN_PALM are
  *held* poses republished every ~100ms by the throttle for as long as
  they're held (react only on the *value* transition into that pose, or a
  held OPEN_PALM would toggle the legend on and off ~10 times a second).
  Both trackers seed their baseline from whatever's already live in the
  global `interactionStore` at mount, not `null` — arriving here from
  Cursor or Studio with a stale gesture already sitting in the store must
  not fire an action the instant this module mounts.
- `modules/present/usePresentKeyboardCommands.ts` — arrows for slide nav,
  `s`/`p`/`r` for start/pause/reset, `h`/`n` for legend/notes, registered
  through `CommandRouter` like every other module's keyboard parity.
- `modules/present/SlideStage.tsx` — the slide view plus every control
  (prev/next, dot pagination, timer, notes, legend), all in the normal
  panel layout rather than hover-revealed — deliberately, to avoid a
  keyboard-accessibility trap where a control only becomes visible on
  mouse hover or a held gesture. OPEN_PALM's "reveal controls" (from the
  original placeholder's brief) became a toggleable gesture-legend
  overlay instead of a hidden-then-shown toolbar, for exactly that reason.
- `modules/present/slides.ts` — a fixed demo deck pitching AIR OS itself,
  presented with AIR OS's own gesture engine. No slide editor is in scope
  (the placeholder's brief was "drive a deck with swipes," not "author
  one"), matching Studio's fixed-object-set precedent.

**Unlike 3D Studio, Demo Mode here fully demonstrates the core
interaction**: the synthetic fixture's one baked-in swipe (`SWIPE_LEFT`,
per `fixtures.ts`) drives `nextSlide()` through the exact same code path a
live swipe would. No two-hand-gesture-style permanent gap exists for this
module.

`moduleRegistry.tsx`'s `present` entry is now `status: 'ready'`.

### A real testing-infrastructure gap this phase found

`usePresentGestureCommands.test.tsx` was the first test in the project to
use `@testing-library/react`'s `render`/`renderHook` across multiple
`it()` blocks in one file. `apps/web/src/test/setup.ts` had never called
Testing Library's `cleanup()` between tests — nothing before this phase
needed it, since every earlier test exercised pure logic or a class
singleton, never a mounted component. Without it, every `renderHook()`
call stayed mounted for the rest of the run: a later test's store update
was picked up by *every* previously-mounted hook instance, each firing its
own `nextSlide()`/`startTimer()`, turning one intended event into several.
Caught immediately by the swipe test's assertion (`slideIndex` landed on 2
instead of 1). Fixed by adding `afterEach(cleanup)` to the shared setup
file — see its comment for the failure mode in more detail. **This wasn't
specific to Presentation's tests; any future test using `render`/
`renderHook` would have hit the same silent multiplication bug.** Worth
knowing before writing the next component/hook test in this project.

### A verification lesson, continued (see Phase 7's for the first half)

Manually confirmed live and correct in the browser: THUMBS_UP starting the
timer, FIST pausing it (including the timer correctly *not* resetting,
just freezing), OPEN_PALM toggling the gesture-legend overlay with no
flicker across repeated throttled republishes of the same held pose, and
full mouse/keyboard parity for every control including bounds-clamping at
both ends of the deck. The one gesture path *not* caught live was
SWIPE_LEFT itself — the same narrow-window-vs-sparse-polling timing race
documented in Phase 7's PINCH note (the fixture's swipe segment is a
similarly short slice of its ~7.6s loop). Given that the identical
`nextSlide()`/`prevSlide()` functions were separately proven live via
mouse clicks and keyboard arrows, and the swipe-specific edge-detection
logic has 8 passing tests exercising the real `interactionStore` (not a
mock) — including a dedicated "two consecutive same-direction swipes both
register" case and a "held pose doesn't refire every throttle tick"
case — this is recorded as a known, honest gap in *live* verification
rather than left unstated.

## Phase 9 shipped: Face tracking

No new module route — Face tracking is a new *capability*, wired into the
existing `VisionEngine`/`LandmarkSource` pair exactly as
`docs/COMPUTER_VISION.md` predicted it would be, and surfaced inside
Gesture Lab (which already existed as "exactly what the tracking pipeline
sees") rather than a tenth nav item. Composed from:
- `vision/face/FaceLandmarkerService.ts` — a lazy singleton `FaceLandmarker`,
  structurally identical to `HandLandmarkerService.ts`, with two options
  left deliberately unset rather than defaulted-and-ignored:
  `outputFaceBlendshapes` (MediaPipe's per-frame "smiling"/"jaw open"
  classification scores — exactly the attribute inference the gate
  forbids) and `outputFacialTransformationMatrixes` (nothing here renders
  a 3D face model to apply it to). Unset, not requested-and-discarded, so
  the capability isn't one Readout away from someone adding it later
  without re-deriving why not to.
- `vision/engine/CameraLandmarkSource.ts` — `detectFace` now runs
  alongside `detectHands` in the same `tick()`, gated by `tasks.face`
  independently of `tasks.hand`, inference time summed into the same
  `timings.inferenceMs` the FPS readout already reads.
- `vision/replay/faceMesh.ts` — Demo Mode's synthetic face, and the one
  genuinely hard part this phase had that the hand fixture didn't:
  `FaceLandmarker`'s connection constants (`FACE_LANDMARKS_FACE_OVAL`,
  `_LEFT_EYE`, etc.) reference *specific* canonical landmark indices, so a
  synthetic point cloud only looks face-shaped if those exact indices sit
  in roughly the right place. Rather than hardcoding ~150 canonical index
  positions from memory, `walkConnectionsIntoLoops` reads the *real*
  connection constants at build time and walks each into an ordered
  loop/chain, so placement only has to answer "where does this contour
  sit on a face" (an ellipse, an arc), never "which index is the eye's
  outer corner." A gentle blink/mouth-open pulse animates over time,
  independently of whatever the synthetic hand is doing — pure landmark
  movement, never surfaced as a "blinking" claim anywhere, same reasoning
  as not requesting blendshapes. 7 Vitest cases cover the loop-walking
  logic directly plus the fixture's own well-formedness (bug #6's
  lesson — verify a demo fixture actually demos something).
- `vision/face/FaceMeshOverlay.tsx` — structurally identical to
  `HandSkeletonOverlay.tsx` (same hot-path subscription, same mirroring,
  same bug-#9 tracking-loss clear), but deliberately narrower in *what* it
  draws: only face oval, eyes, eyebrows, and lips — never the full
  ~7000-edge tesselation (too visually dense to read as anything but
  noise), and never a derived "openness" or expression readout. Every
  pixel on screen is a MODEL landmark position, geometrically connected;
  nothing is classified.
- `modules/lab/LabModule.tsx` — a "Track face" toggle drives
  `useVisionTask`'s `face` field directly (the hook already reacts to it
  changing — no new plumbing needed), opt-in rather than always-on
  alongside hands, per IMPLEMENTATION.md §1.2's whole reasoning for
  task-subscription existing at all. A separate "Face mesh overlay"
  toggle (backed by the new `AppSettings.showFaceMesh`) controls only the
  *visualization*, independent of whether detection itself is running —
  manually verified live: turning detection off clears the mesh
  completely (no bug-#9-style ghost), and turning only the overlay off
  while detection stays on leaves "Face detected: Yes" correctly
  reporting while the drawing itself disappears.
- `apps/web/scripts/fetch-models.mjs` — `face_landmarker.task` added
  alongside `hand_landmarker.task`, same Google model-hosting bucket
  layout; fetched and verified (~3.6MB) during this phase.

`docs/COMPUTER_VISION.md`, which had been left at its Phase 2 snapshot the
entire time (still describing gesture classification as "Phase 3 — not
yet built"), got a real refresh this phase, not just a Phase 9 addendum.

## Phase 10 shipped: Pose tracking

Same shape as Phase 9: no new module route, no new placeholder — a new
capability (`PoseLandmarker`) behind the existing `VisionEngine`/
`LandmarkSource` pair, surfaced inside Gesture Lab via another opt-in
"Track" toggle. Composed from:
- `vision/pose/PoseLandmarkerService.ts` — a lazy singleton
  `PoseLandmarker`, structurally identical to
  `FaceLandmarkerService.ts`/`HandLandmarkerService.ts`.
  `outputSegmentationMasks` stays unset for the same "unset, not
  requested-and-ignored" reason Phase 9 left face blendshapes unset —
  nothing in this phase renders a segmentation mask. Uses the `lite`
  model variant (not `full`/`heavy`): this is the third MediaPipe task
  that can run in the same frame alongside hand (and optionally face)
  detection, and IMPLEMENTATION.md §9's performance budget has no
  headroom to spend on pose accuracy beyond what the joint-angle readouts
  actually need.
- `vision/pose/poseAngles.ts` — `computePoseAngles()`, DERIVED arithmetic
  on MODEL landmark positions computing left/right elbow and knee angles
  in degrees. Reuses `jointAngle()` from `gestures/geometry.ts` verbatim
  (the exact same angle-between-three-points math already used for finger
  curl) rather than reimplementing it, applied to the
  shoulder-elbow-wrist and hip-knee-ankle triples instead of finger
  joints. Pure and directly unit-tested (`poseAngles.test.ts`) with
  synthetic landmark triples at known angles (collinear → 180°,
  perpendicular → 90°) — this is the literal computation Phase 10's gate
  ("angles correct vs. manual check") verifies.
- `vision/pose/PoseSkeletonOverlay.tsx` — structurally identical to
  `HandSkeletonOverlay.tsx`/`FaceMeshOverlay.tsx` (same hot-path
  subscription bypassing the throttled store, same mirroring, same
  bug-#9 tracking-loss clear). Draws every
  `PoseLandmarker.POSE_CONNECTIONS` edge — pose has no "too dense to
  read" problem at only 33 points, so unlike the face overlay there's no
  subset curation needed.
- `vision/replay/poseSkeleton.ts` — Demo Mode's synthetic standing
  figure. Judged fresh rather than reusing `faceMesh.ts`'s
  `walkConnectionsIntoLoops` machinery on reflex, per the note this
  section used to carry: MediaPipe's pose landmarks are a small, fixed,
  well-documented 33-point topology (BlazePose), so "which index is the
  left elbow" is a known constant, not something worth deriving from the
  connection graph the way face's ~150 densely-packed contour indices
  were. All 33 points are hand-placed for a static standing pose; only
  the right elbow animates, sweeping smoothly between two deliberately
  verifiable extremes — a fully straight arm (180°) and a forearm folded
  perpendicular to the upper arm (90°) — rather than an arbitrary
  naturalistic gesture that would be hard to check by eye.
  `poseSkeleton.test.ts` asserts both extremes land at the calibrated
  values, in the spirit of bug #6 (a fixture that demos its own claimed
  behavior, not just looks plausible).
- `modules/lab/LabModule.tsx` — a "Track pose" toggle (same opt-in
  pattern as Phase 9's "Track face") drives `useVisionTask`'s `pose`
  field; a "Pose skeleton overlay" toggle (`AppSettings.showPoseSkeleton`)
  controls only the visualization, independent of detection — same
  independent-toggle split Phase 9 established for the face mesh. Four
  new DERIVED Readouts (left/right elbow, left/right knee angle) render
  only while pose tracking is on.
- `vision/engine/CameraLandmarkSource.ts` — `detectPose` now runs
  alongside `detectHands`/`detectFace` in the same `tick()`, gated by
  `tasks.pose` independently, inference time summed into the same
  `timings.inferenceMs`. `vision/replay/fixtures.ts`'s `buildFrame` now
  always populates `pose` too (same "always populated, `ReplaySource`
  strips it back to null per-task" pattern the face fixture already
  used).
- `apps/web/scripts/fetch-models.mjs` — `pose_landmarker_lite.task`
  added, fetched from the same Google model-hosting bucket layout as
  hand/face (this task ships lite/full/heavy variants; lite chosen for
  the performance-budget reason above).

Manually verified live in a real (non-sandboxed) browser tab: Demo Mode's
right-elbow angle read 180° at rest and swung down through the 140s into
the 100s as the fixture animated, visually matching the rendered skeleton
bend at each sample; left elbow held at 180° and both knees at ~177°
throughout, exactly as the fixture's static half is built. Turning "Track
pose" off cleanly cleared both the skeleton overlay and all four angle
Readouts with no ghost frame — confirming the bug #8/#9 staleness
discipline holds for a third tracking task without needing any new
reset-path code (pose piggybacks on the same `trackingState`/
`visionStore.poseDetected` plumbing hand and face already established).
No new bug classes found this phase — every piece of machinery it needed
(`VisionTaskRequest.pose`, `ReplaySource`'s per-task gating,
`ARCHITECTURE.md`'s hot/cold path split) already existed from Phase 1/9
and needed no changes, only a third instance plugged in.

**A verification-tooling note, not a code bug**: the sandboxed
browser-automation pane used for earlier phases' checks had
`document.hidden === true` for this entire session (confirmed via
`javascript_exec`), which silently pauses every `requestAnimationFrame`
loop in the app (`ReplaySource`'s tick loop included) — exactly the
"Process notes" section below already warns about. Demo Mode looked
completely inert through that pane (Tracking stuck on `idle` indefinitely
regardless of wait time) even though nothing was wrong. Switching to a
real, visible Chrome tab (via the Claude-in-Chrome browser-automation
surface rather than the sandboxed preview pane) immediately showed
correct, live behavior. Worth remembering as a concrete instance of that
existing note, not a new lesson.

`moduleRegistry.tsx` needed no changes — Pose tracking, like Face
tracking, isn't a module route.

## Phase 11 shipped: Voice + Command Center

No new module route — voice is a fourth input modality dispatched through
the CommandRouter every other modality (keyboard, gesture, the text
palette) already used, exactly as IMPLEMENTATION.md §8 predicted it
would be. `CommandRouter.ts` and `CommandPalette.tsx` were already real,
wired-up Phase 1 scaffolding (not placeholders) — this phase's actual job
was the piece that didn't exist yet: the Web Speech API wrapper and its
UI surface. Composed from:
- `types/speech-recognition.d.ts` — the project's first hand-written
  `.d.ts` file. TypeScript's `lib.dom.d.ts` types the Web Speech API's
  event/result payloads (`SpeechRecognitionEvent`,
  `SpeechRecognitionErrorEvent`, `SpeechRecognitionResult`) but not the
  `SpeechRecognition` interface or constructor itself — the API still
  isn't a finished standard, which is also why Chrome/Edge only expose it
  under the `webkitSpeechRecognition` vendor prefix. Declared here rather
  than reached for `any`, per §12's "no `any` without a justifying
  comment" bar.
- `interaction/voice/VoiceRecognitionController.ts` — a plain class
  owning the recognizer's lifecycle, the voice equivalent of
  `CameraManager`. `continuous: true`, `interimResults: false` (only
  acted-on, complete phrases — matching the "deterministic phrase
  matching, not a partial-word guess" spirit of `dispatchPhrase`).
  Restarts itself with a fresh instance on `onend` while still armed
  (browsers end the recognizer after any pause, even in continuous mode),
  swallows benign errors (`no-speech`, `aborted`) rather than surfacing
  them, and permanently stops retrying on `permission-denied`/
  `no-microphone` rather than looping forever against a failure the user
  has to fix outside the app. **Every state transition is reported from
  the recognizer's own async events (`onstart`/`onresult`/`onerror`/
  `onend`) — never synchronously inside `start()`/`stop()`** — see the
  next bullet for why that specific discipline matters here.
- `interaction/voice/errors.ts` — `VOICE_ERROR_MESSAGES` +
  `classifyVoiceError` + `isBenignVoiceError`, mirroring
  `vision/camera/errors.ts`'s taxonomy pattern exactly (a fixed set of
  actionable causes, each with a message that names the fix).
- `state/appStore.ts` — `voiceState`/`voiceError`/`lastVoiceTranscript`/
  `lastVoiceCommandTitle` added alongside the pre-existing
  `AppSettings.voiceEnabled`. **`setVoiceState` carries an equality
  guard** (skip the write if nothing actually changed) — see bug #12
  below for why this isn't optional defensive style here, it's a real
  fix for a hazard this phase's architecture introduced.
- `hooks/useVoiceCommands.ts` — mounted once at `AppShell`, alongside
  `useNavigationCommands`/`useGlobalKeyboardCommands` (voice isn't scoped
  to one module, same reasoning). Subscribes directly to `appStore` and
  calls the idempotent `controller.start()`/`.stop()` in step with
  `settings.voiceEnabled` — the same "recompute on every appStore change,
  let idempotency make repeats free" pattern `VisionEngine.recompute()`
  and `CameraLandmarkSource.syncWithCameraState()` already use.
  `commandRouter.dispatchPhrase()` gets every final transcript; the
  matched command's title (or `null`) is recorded via `setLastVoiceResult`
  so voice control is never a silent black box.
- `modules/settings/SettingsModule.tsx` — a new "Voice control" panel:
  the `voiceEnabled` toggle, and — while it's on — three Readouts with
  real method tags (`Status`: DERIVED, `Last heard`: **MODEL** — it's raw
  speech-to-text output, `Matched command`: **HEURISTIC** — it's
  `dispatchPhrase`'s substring match), the same provenance discipline
  §1.4 requires everywhere else. When `checkBrowserSupport().speechRecognition`
  is false, the toggle doesn't render at all — just
  `VOICE_ERROR_MESSAGES.unsupported`'s message and a pointer to the
  Command Palette instead. This *is* Phase 11's "graceful degrade" gate,
  literally.
- `app/shell/StatusBar.tsx` — a small always-visible-once-enabled
  `VoiceStatusPill` (mic icon + Off/Listening/Error), the voice
  equivalent of the camera `StatusPill` already there, kept as a separate
  local component rather than generalizing `StatusPill` itself — voice is
  the only other stateful pill this app has, not enough call sites to
  earn a generic abstraction.

Two stale pieces of copy this phase's own addition made inaccurate were
also fixed in passing: `SettingsModule.tsx`'s intro paragraph used to
promise voice settings "as later phases add" them (now here, so reworded),
and its About panel had said "Phase 1: Architecture & Camera" unchanged
since the very first phase.

`moduleRegistry.tsx` needed no changes — same as Phase 9/10, this isn't a
module route.

### A verification limit worth recording (not a code bug)

Voice control's live end-to-end path (an actual spoken word triggering an
actual command) couldn't be manually verified the way every other
phase's feature was — granting microphone permission requires clicking a
native, OS/browser-chrome-level "Allow" button that sits outside the
page's DOM entirely, which no browser-automation tool used in this
project (sandboxed preview pane or the real-Chrome surface alike) can
reach. `navigator.permissions.query({name:'microphone'})` confirmed the
permission genuinely sat at `'prompt'` throughout — the app correctly
kept showing `Status: Off` rather than lying about `Listening` while
nothing was actually listening yet, which is itself the honest behavior
§12 requires. What *was* verified live in a real Chrome tab: the
`voiceEnabled` toggle persisting correctly across reload, the Settings
Readouts and StatusBar pill both reacting correctly to it, and — the
part that actually proves the shared machinery voice depends on — the
Command Palette dispatching `Open 3D Studio` and genuinely navigating,
exercising the exact same `commandRouter.dispatchPhrase()`/`command.run()`
path `VoiceRecognitionController`'s `onResult` callback calls. The
recognizer's own event-driven state machine (listening, final-vs-interim
filtering, benign-error swallowing, restart-on-end, permission-denied
stop-retry, start() idempotency) is covered instead by seven
`VoiceRecognitionController.test.ts` cases against a scripted fake
`SpeechRecognition`, specifically because the live mic path can't be
automated here. Flagged plainly rather than claimed as something it
wasn't, per this file's own quality bar on fabricated confidence.

## Phase 12 shipped: Game Mode

A new module with real gameplay logic, not another capability bolted
onto an existing pipeline — closer in shape to Air Draw/3D Studio (its
own Interaction Engine + module split) than to Face/Pose/Voice's "no new
route" pattern. The concept — a small vertical shooter — was already
staked out by `moduleRegistry.tsx`'s own pre-existing placeholder copy
(written back in Phase 1 scaffolding, before this phase touched
anything): "a spaceship controlled by index-finger position... pinch to
fire, open palm to raise a shield... kept deliberately simple: the
interaction quality is the point, not the game design." That placeholder
text was treated as the real design brief rather than overridden with an
unrelated concept. Composed from:
- `interaction/game/GameEngine.ts` — structurally a copy of
  `DrawEngine.ts` (sticky-hand-selection, reach-boxed, One-Euro-filtered
  fingertip pointer + raw gesture), the same "engine stays generic, the
  module owns the domain logic" split every Interaction Engine in this
  app holds itself to.
- `modules/game/gameSimulation.ts` — the actual game as a pure,
  deterministic function: `stepSimulation(state, dtMs, shieldActive)`
  moves enemies/projectiles, spawns on a score-scaled cadence, resolves
  collisions, and resolves an enemy reaching the bottom (blocked for
  free by an active shield, otherwise a life lost) — the same "pure
  core, thin stateful wrapper" split `presentStore.ts`'s timer math
  uses, chosen for the same reason: 20 unit tests exercise spawn
  cadence, collision, shield-blocking, and the game-over transition with
  plain synchronous assertions, no real clock, no rAF, no randomness
  (an injectable `randomX` makes spawn position deterministic in tests).
- `modules/game/gameState.ts` — the hot-path mutable singleton
  (`drawStrokes.ts`'s pattern) wrapping the pure simulation; `gameStore.ts`
  the cold-path summary (`drawStore.ts`'s pattern) a HUD reads reactively,
  including a `localStorage`-persisted high score.
- `modules/game/GameCanvas.tsx` — `DrawCanvas.tsx`'s pattern again: its
  own self-driven `requestAnimationFrame` loop (not a push subscription —
  the simulation must keep advancing every frame regardless of whether a
  hand is currently tracked, the identical reasoning bug #9 established),
  reading `GameEngine`'s per-frame pointer for steering and an
  edge-detected PINCH for fire, plus full real mouse (`pointermove`/
  `click`) and keyboard (arrow keys, Space, Shift) parity wired directly
  — bypassing `CommandRouter` for the same reason `DrawCanvas`'s mouse
  listeners do: firing and steering are continuous/reflex actions, not
  one-shot commands.
- `modules/game/useGameGestureCommands.ts` — THUMBS_UP starts/resumes,
  FIST pauses, reusing `usePresentGestureCommands.ts`'s held-pose
  edge-detection pattern rather than reinventing it — and a deliberate
  cross-module consistency: the same two gestures mean the same two
  things in both Presentation and Game Mode. Read from the throttled
  `interactionStore.activeGesture` (not `GameEngine`'s per-frame
  channel), since starting/pausing isn't reflex-latency-sensitive the
  way firing is.
- `modules/game/useGameKeyboardCommands.ts` — the same 's'/'p'/'r'
  bindings Presentation uses for its timer, another deliberate
  cross-module consistency, registered through `CommandRouter` for the
  three genuinely discrete actions (Start/Resume, Pause, Restart). Fire
  and shield stay out of this registry on purpose — see `GameCanvas.tsx`'s
  doc comment for why forcing a held/continuous action through a
  one-shot command registry would misrepresent how it actually plays.

`moduleRegistry.tsx`'s `game` entry flipped from `status: 'planned'` to
`'ready'` — the last module besides Analytics to do so.

### A verification limit worth recording (not a code bug)

Confirmed live in a real Chrome tab, extensively: Start/Pause/Resume/
Restart all correctly transitioning `status` and the Game Over/Paused
overlay; mouse steering (the ship visibly tracking the pointer); click-fire
producing a real moving projectile; a spawned enemy actually colliding
with a projectile, destroying both, and awarding the score (+10, matching
`SCORE_PER_KILL`); the high score correctly persisting to `localStorage`
across a Restart (score resets to 0, "Best" stays at the prior high).
**Not** independently confirmed live: Demo Mode's gesture-driven play
(steering/firing/shielding via the synthetic hand specifically, as
opposed to their mouse/keyboard equivalents). Partway through that check
the browser window lost OS-level foreground focus — confirmed via
`document.hidden` staying `true` even across a full page reload and in a
freshly-opened tab, and directly proven inert (not just slow) by
monkey-patching `CanvasRenderingContext2D.prototype.moveTo` and observing
zero calls across 10+ real seconds, meaning `requestAnimationFrame`
callbacks simply were not firing at all — a condition no tool available
in this session could restore focus from. This is the same category of
environment limitation CLAUDE.md already documents for the sandboxed
preview pane, just observed this time on the real-Chrome surface that
had reliably sidestepped it in Phases 10–11. Given that, confidence
instead rests on: the PINCH-fire and OPEN_PALM-shield code paths being
structurally identical to the verified click/Shift-hold paths (the exact
same `gameApi.fire()` call and `shieldActive` boolean, just fed from
`GameEngine`'s gesture field instead of a DOM event), and
`gameSimulation.test.ts`'s 20 cases covering the underlying mechanics
directly. Flagged plainly rather than claimed as verified, per this
file's own quality bar on fabricated confidence.

## Phase 13 shipped: Analytics + Perf

`apps/web/src/modules/analytics/AnalyticsModule.tsx` is the real module
now. Two things happened this phase, not one: a real dashboard on top of
numbers that already existed (`visionStore.fps`/`fpsHistory`), and the
degradation ladder from IMPLEMENTATION.md §9 actually *doing* something
for the first time — every prior phase's FPS readout was a passive
display, never an input to a decision the app made on its own. Composed
from:
- `vision/perf/degradationLadder.ts` — the pure half: `DEGRADATION_STEPS`
  descriptors, `median()` (a rolling median, not a mean, specifically so
  one GC-pause-style outlier frame can't swing the trigger), and
  `getAppliedEffects(level, activeModule)` — the single function that
  decides what a given ladder level actually means for a given active
  module. This is the one piece of this phase most worth understanding:
  both `DegradationController` (to decide what to call) and the Analytics
  dashboard/status-bar pill/banner (to decide what to display) call this
  *same* function, so the UI can never claim a step is active that the
  controller didn't really apply, or vice versa — the same "pure core,
  thin wrapper" split `presentStore.ts`'s timer math and
  `gameSimulation.ts` already established, applied here to keep display
  and enforcement from drifting apart instead of to keep tests simple.
- `vision/perf/DegradationController.ts` — the stateful wrapper.
  Subscribes to `visionStore` (fires on every ~10Hz FPS publish) and
  `appStore` (module/source/camera changes), computes the rolling
  3-second median from `fpsHistory`, and escalates/de-escalates one step
  at a time with a hysteresis gap (20fps triggers escalation, 25fps
  triggers recovery — not the same number, so the ladder can't flap right
  at one boundary). Only ever active while a real camera is the live
  source; switching to Demo Mode or stopping the camera resets it to 0
  immediately, same "reset whenever frames could stop arriving" instinct
  as bugs #2/#8/#9. **Found and fixed a real re-entrancy bug here before
  it shipped — see bug #13 below, it's a genuine addition to the bug
  taxonomy, not a restatement of #12.**
- `CameraManager.restoreDefaultResolution()`, `HandLandmarkerService
  .setHandLandmarkerNumHands()`, `CameraLandmarkSource`'s
  `setFrameSkipEnabled()`, and `VisionEngine.setSuppressSecondaryTasks()`
  — the four real side effects the ladder's steps 1-4 call. Frame skipping
  (step 3) holds the *last real* detection on the skipped tick rather than
  inventing motion — `inferenceMs` correctly reads 0 on a held tick,
  keeping faith with §9's "never estimate" rule even under degradation.
  Step 2 (hands→1) is skipped while 3D Studio is active (its two-hand
  gesture genuinely needs both — `StudioEngine.ts`); step 4 (face/pose
  off) is skipped while Gesture Lab is active (the only module that ever
  requests them) — both gates live in `getAppliedEffects()`, not
  duplicated in the controller.
- `modules/analytics/FpsGraph.tsx` — plots `visionStore.fpsHistory`
  directly (no separate rAF loop; the store's own ~10Hz publish is a fine
  redraw cadence for a graph a human reads). Reference lines are drawn at
  the ladder's own real thresholds (20fps/25fps), not a loosely-converted
  version of §9's ms-based frame-time budget — that budget measures a
  different thing (total per-frame processing time) and converting it to
  an FPS number would misrepresent itself as "the same number."
- `hooks/useRenderRate.ts` — a real, scoped render-count probe (a ref
  incremented in the render body, sampled once a second), not React
  DevTools' Profiler API and not a guess. Deliberately labelled "This
  panel's renders/sec," not an app-wide claim — see its doc comment for
  why a wider claim would be dishonest given what's actually measured.
- Debug Mode reuses Gesture Lab's `LandmarkTable`/`GestureTimeline`
  as-is (both already self-contained, subscribing to `visionEngine`/
  `interactionStore` directly) rather than rebuilding a second copy — the
  same reuse-before-duplicate instinct `CameraStage` was extracted for in
  Phase 5.
- `app/shell/DegradationBanner.tsx` (a full-width banner, level 5 only —
  "surface a banner recommending Demo Mode" per §9) and `StatusBar.tsx`'s
  `PerfPill` (a quieter pill for levels 1-4, "each announced in the status
  bar") — both read `getAppliedEffects()` too, same single-source-of-truth
  reasoning.

`moduleRegistry.tsx`'s `analytics` entry is now `status: 'ready'` — the
last module to leave `ui/ModulePlaceholder.tsx`.

### Bug found and fixed: a re-entrancy hazard one level deeper than #12

`DegradationController.evaluate()` calls `setDegradationLevel(this.level)`
(a write into `visionStore`) and *then* calls `this.applyEffects(...)`.
But `DegradationController` also subscribes to `visionStore` itself — so
`setDegradationLevel`'s write synchronously re-enters `evaluate()` (and
thus a *second*, nested call to `applyEffects`) before the outer call ever
reaches its own `applyEffects` line. Bug #12's equality guard on the
store setter stops this from recursing *infinitely* (the nested call's own
`setDegradationLevel` is a no-op, since the value's already been written),
but it does nothing to stop the outer and the nested call from both acting
on the *same* transition: both read the same stale `this.applied` (neither
has updated it yet) and both independently decide "resolution isn't
downgraded yet," so both called `cameraManager.downgradeResolution()` —
caught immediately by `DegradationController.test.ts`'s
`toHaveBeenCalledTimes(1)` assertions failing with `2`, not found live.
Fixed by committing `this.applied = next` **synchronously, before any
`await`**, inside `applyEffects` — whichever call (inner or outer) reaches
that line first "claims" the transition, so the other sees nothing left to
do and returns immediately. **Lesson**: bug #12's equality-guard pattern
prevents unbounded re-entrant *recursion*, but a synchronous re-entrant
call can still slip in *before* a caller finishes acting on a decision it
already made — anything that (a) writes into a store it also subscribes
to and (b) does asynchronous work as a *result* of that write needs to
commit its own "I'm handling this" bookkeeping before the first `await`,
not after, or a sibling re-entrant call can duplicate the same side
effect. A second, independent guard (`resolutionChangeInFlight`) also
exists in this file, but for a different hazard: it stops `evaluate()`
from reacting to the *camera-state transitions* a resolution restart
itself causes (stopping/off/starting/active), which would otherwise read
"camera not live" mid-restart and immediately reverse the very change in
progress.

## How to resume: Phase 14, Polish

Check IMPLEMENTATION.md §11's phase table (`Motion design, a11y pass,
README, demo fixtures, deploy` / "Lighthouse ≥90; demo mode works") and
§12's quality bar — this is the last phase, and it's cleanup/hardening
rather than new capability: a motion-design pass (respecting
`settings.reduceMotion`, already wired but worth auditing end to end), a
real accessibility pass (keyboard-only navigation, screen-reader labels,
color contrast — nothing in IMPLEMENTATION.md §11's earlier phases
gated on this explicitly), bringing README.md/IMPLEMENTATION.md's
remaining stale spots up to date (the "Working today" prose in README.md
predates Phases 9-12 and is missing Face/Pose/Voice/Game Mode paragraphs
— Phase 13 fixed the Analytics-specific claim there but didn't backfill
the rest, since it wasn't this phase's job), demo fixtures, and a deploy
pass. No open questions parked for this phase in IMPLEMENTATION.md §13.
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
npm run test:run    # vitest run — 222 tests as of end of Phase 13
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

11. **Testing Library components stayed mounted across an entire test
    file** (Phase 8). `apps/web/src/test/setup.ts` never called Testing
    Library's `cleanup()`, because nothing before Phase 8 rendered a
    component or called `renderHook()` more than once in a run — every
    earlier test exercised pure logic or a class singleton directly.
    `usePresentGestureCommands.test.tsx` was the first file to call
    `renderHook()` from multiple `it()` blocks, and every instance from
    every earlier test in the file stayed mounted and subscribed for the
    rest of the run: a single `setActiveGesture(...)` call was picked up
    by *all* of them, each independently calling `nextSlide()`/
    `startTimer()`, so what should have been one event turned into
    several (a swipe test asserting `slideIndex === 1` got `2`). Fixed by
    adding `afterEach(cleanup)` (from `@testing-library/react`) to the
    shared setup file. **Lesson**: this wasn't specific to Presentation —
    it's a property of the test harness itself, invisible until the first
    test file exercised a mounted component more than once per run. Any
    future `render`/`renderHook` usage would have hit it silently. If a
    component/hook test's assertions look like an event fired more times
    than it should have, check for this before assuming the code under
    test is wrong.

12. **A self-write re-entrancy hazard, caught before shipping, not live**
    (Phase 11). `useVoiceCommands.ts`'s sync effect is itself an
    `appStore.subscribe` listener, and `VoiceRecognitionController.start()`
    can call back into `setVoiceState` — which writes to `appStore` —
    synchronously from within that same call chain (e.g. reporting
    `'unsupported'` the instant `start()` runs, before any real async
    browser event has fired). `state/createStore.ts`'s `notify()` has no
    equality check and iterates listeners with a plain `for...of`: a
    listener that writes back into the same store it's subscribed to,
    unconditionally, recurses into `notify()` again on the same call
    stack, which invokes every listener again — including itself —
    without any base case to stop it. Every earlier phase's
    `appStore.subscribe` consumers (`VisionEngine.recompute()`,
    `CameraLandmarkSource.syncWithCameraState()`) happened to avoid this
    by construction, since none of them ever wrote back into `appStore`
    itself — only into `visionStore`/`interactionStore`, or by calling
    inherently-async browser APIs. Voice is the first consumer that both
    subscribes to `appStore` *and* needs to write back into it. Fixed two
    ways at once, deliberately redundant: `setVoiceState` skips the write
    entirely when the new state matches the current one (breaks the
    recursion at its root, protects every call site including future
    ones), and `VoiceRecognitionController` was also designed so no state
    transition is *ever* reported synchronously inside `start()`/`stop()`
    — only from the recognizer's genuine async events. Caught via
    reasoning through `createStore.ts`'s actual `notify()` implementation
    before writing the hook, not found by hitting a real infinite loop in
    the browser — an `appStore.test.ts` regression test (`setVoiceState`'s
    "prevents unbounded re-entrant notification" case) pins the fix.
    **Lesson**: any new `appStore.subscribe` consumer that might need to
    write back into `appStore` itself must either guard the write with an
    equality check or route the write through a genuinely async callback
    — never assume, the way every prior consumer safely could, that
    "nothing writes back into the store it's subscribed to" just because
    that's held true so far.

13. **A re-entrancy hazard one level deeper than #12, caught by a failing
    test, not live** (Phase 13). `DegradationController.evaluate()` writes
    `visionStore.degradationLevel` (via `setDegradationLevel`) and *then*
    calls `this.applyEffects(...)` — but `DegradationController` also
    subscribes to `visionStore` itself, so that write synchronously
    re-enters `evaluate()` (and a *second*, nested `applyEffects` call)
    before the outer call ever reaches its own `applyEffects` line. Bug
    #12's equality guard stops this from recursing *infinitely* (the
    nested call's own `setDegradationLevel` is a no-op, since the value's
    already written) — but it does nothing to stop the outer and the
    nested call from both acting on the *same* transition: both read the
    same stale `this.applied` (neither has updated it yet) and both
    independently decided "resolution isn't downgraded yet," so both
    called `cameraManager.downgradeResolution()`. Caught immediately by
    `DegradationController.test.ts`'s `toHaveBeenCalledTimes(1)`
    assertions failing with `2` — never hit live. Fixed by committing
    `this.applied = next` **synchronously, before any `await`**, inside
    `applyEffects`: whichever call (inner or outer) reaches that line
    first "claims" the transition, so the other sees nothing left to do
    and returns immediately. **Lesson**: an equality-guard setter (#12's
    fix) prevents unbounded re-entrant *recursion*, but doesn't by itself
    stop a synchronous re-entrant call from slipping in *before* the
    original caller finishes acting on a decision it already made —
    anything that (a) writes into a store it also subscribes to and (b)
    does asynchronous work as a *result* of that write needs to commit its
    own "I'm handling this" bookkeeping before the first `await`, not
    after, or a sibling re-entrant call can duplicate the same side
    effect. Don't assume #12's fix is the complete pattern for this class
    of bug — it stops the infinite case, not every duplicate-call case.

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
  visible browser tab instead before concluding anything. Phase 12 hit the
  same symptom on the real-Chrome automation surface too (which had
  reliably sidestepped it in Phases 10–11) — the window had lost OS-level
  foreground focus. To tell "genuinely broken" apart from "just
  backgrounded and throttled to a crawl," monkey-patch a relevant canvas
  method (e.g. `CanvasRenderingContext2D.prototype.moveTo`) via the
  browser tool's JS-eval to count real calls over several seconds: zero
  calls means `requestAnimationFrame` isn't firing at all (a focus/
  visibility problem to fix by refocusing the window, not a code bug to
  chase), while a trickle of calls means it's just severely throttled.
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
- Microphone (and, if a future phase ever needs it, any other
  permission-gated hardware) can't be granted through browser-automation
  tooling the way clicking a page button can — the native "Allow"
  prompt lives in browser chrome, outside the DOM, unreachable by both
  the sandboxed preview pane and the real-Chrome automation surface
  (Phase 11). `navigator.permissions.query({name: '<permission>'})` is
  the reliable way to confirm *why* a feature looks inert (`'prompt'`
  means it's genuinely waiting on a human, not broken) rather than
  guessing from symptoms alone. When live end-to-end verification is
  blocked this way, lean harder on a scripted-fake unit test for the
  state machine (see `VoiceRecognitionController.test.ts`) and verify
  everything live that *doesn't* require the gated permission — the
  settings UI, persistence, and the shared dispatch path the feature
  ultimately calls into.
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
- `IMPLEMENTATION.md` and `README.md` both have a status line near the
  top that should be updated at the end of each phase (both correctly say
  "Phases 1–12 complete" as of this phase — they drifted out of sync for
  several phases in a row before being caught and corrected here). Keep
  them in sync — they're the first thing a reader (or a future session)
  checks.
