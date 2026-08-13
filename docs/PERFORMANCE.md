# Performance

> **Status: implemented (Phase 13).** The state-architecture decisions
> performance depends on (hot path vs. cold path, throttled publishing) were
> built in Phase 1 — see docs/ARCHITECTURE.md's "hot path vs. cold path"
> section. The measurement UI (the Analytics module, the FPS graph) and the
> degradation ladder below are both real and wired to live measurements now,
> not just a target table — see `modules/analytics/AnalyticsModule.tsx` and
> `vision/perf/`.

## The rule: measure, never estimate

Every number this app ever shows for FPS, inference time, or render time
comes from `performance.now()` around the actual work being measured.
Nothing is a hardcoded placeholder, a plausible-looking random value, or an
estimate dressed up as a measurement. If a number can't be measured yet, it
isn't shown at all — the Analytics module's "This panel's renders/sec"
readout, for instance, is scoped and labelled exactly to what it measures
(this one panel's real render count, sampled once a second), not
generalized into an unmeasurable app-wide claim just because the budget
table above talks about "React renders/sec" more broadly.

## Performance budget

Targets, on a 2020-class laptop, Chromium browser (see
IMPLEMENTATION.md §9 for the full table):

| Metric | Target | Ceiling |
|---|---|---|
| End-to-end frame time | ≤ 22ms | 33ms |
| Hand inference | ≤ 12ms | 20ms |
| React renders/sec, steady state | < 12 | 20 |
| Cursor motion-to-photon | ≤ 60ms | 100ms |

## Why React renders are a line item

A camera can deliver frames faster than a human can perceive discrete UI
updates. If a landmark update triggered a React re-render on every frame,
the render count would track the camera's frame rate (30-60/sec) instead
of anything a user needs to see. The architecture keeps this low by
routing anything per-frame (landmarks, cursor position, 3D transforms)
through refs and canvas/WebGL draw calls instead of component state — see
`state/createStore.ts`'s `mutate()` (no-notify writes) and `visionStore`'s
throttled `publishVisionFrame`. "React renders/sec" is measurable directly
in React DevTools' Profiler and is treated as a real regression target,
not an afterthought.

## The degradation ladder

`vision/perf/DegradationController.ts` subscribes to `visionStore`'s
real, throttled FPS publishes (the same ~10Hz `recordFrameArrival()`
measurement this whole document is built on) and computes a rolling
median over the last 3 seconds via `vision/perf/degradationLadder.ts`'s
`median()`. When that median stays under 20fps for 3 straight seconds, it
escalates one step; when it climbs back above 25fps (a deliberate
hysteresis gap, not the same threshold, so the ladder can't flap right at
the boundary) for another 3 seconds, it reverses one step. Only ever
active while a real camera is the live input source — there's no camera
resolution or inference cost to reduce against Demo Mode's synthetic
fixture.

1. Drop camera capture resolution to 640×480
   (`CameraManager.downgradeResolution()` / `.restoreDefaultResolution()`).
2. Reduce `HandLandmarker`'s `numHands` from 2 to 1 — skipped while 3D
   Studio is the active module, since its two-hand scale/rotate gesture
   genuinely needs both.
3. Halve the real inference rate: `CameraLandmarkSource` skips MediaPipe
   inference on every other tick and holds the last *real* detection for
   the skipped one, rather than fabricating a new one — `inferenceMs`
   correctly reads 0 on a held tick, per the "never estimate" rule below.
4. Disable face/pose tracking (`VisionEngine.setSuppressSecondaryTasks()`)
   — skipped while Gesture Lab is the active module, the only module that
   ever requests them.
5. Recommend Demo Mode: a full-width banner (`app/shell/DegradationBanner.tsx`)
   plus a quieter status-bar pill for steps 1-4 (`StatusBar.tsx`'s
   `PerfPill`).

What each step is *actually* doing at any moment is never tracked as a
separate flag — `getAppliedEffects(level, activeModule)` in
`degradationLadder.ts` is the single pure function both the controller
(to decide what to call) and the Analytics dashboard / banner / pill (to
decide what to display) call, so the UI can never claim a step is active
that the controller didn't really apply.

## What's next

Phase 14 (Polish) is what remains — motion design, an accessibility pass,
and deploy fixtures. Performance instrumentation itself is done as of
Phase 13.
