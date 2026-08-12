# Performance

> **Status: partially implemented.** The state-architecture decisions that
> performance depends on (hot path vs. cold path, throttled publishing) are
> built in Phase 1 — see docs/ARCHITECTURE.md's "hot path vs. cold path"
> section. The measurement UI (the Analytics module, the FPS graph, the
> degradation ladder) is Phase 13. This document will gain real, measured
> numbers once that phase lands; the budget below is the target it will be
> measured against.

## The rule: measure, never estimate

Every number this app ever shows for FPS, inference time, or render time
comes from `performance.now()` around the actual work being measured.
Nothing is a hardcoded placeholder, a plausible-looking random value, or an
estimate dressed up as a measurement. If a number can't be measured yet, it
isn't shown yet — that's why the Analytics module is currently a
placeholder rather than a chart with fake data in it.

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

## The degradation ladder (planned, Phase 13)

If measured FPS stays under 20 for 3 seconds, the app is meant to degrade
in this order, each step reversible once FPS recovers:

1. Drop camera capture resolution to 640×480.
2. Reduce `numHands` from 2 to 1, if the active module allows it.
3. Halve inference rate (infer every other frame, interpolate the cursor
   between real detections).
4. Disable secondary tracking tasks (face/pose) if the active module
   doesn't need them.
5. Surface a banner recommending Demo Mode.

None of this exists yet. `vision/camera/CameraManager.ts` already exposes
a `downgradeResolution()` method as a building block for step 1, but
nothing calls it automatically yet — that wiring is Phase 13's job, once
there's a real FPS signal to trigger on.

## What's next

Phase 13 (Analytics + performance) implements the actual instrumentation:
FPS history, an inference-time readout, a render-time readout, and the
degradation ladder above wired to real measured thresholds instead of this
document's target table.
