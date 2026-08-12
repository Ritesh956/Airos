# Gestures

> **Status: implemented (Phase 3).** This describes the actual gesture
> engine in `apps/web/src/gestures/`, with the real thresholds and the
> edge cases found while building it — not a design sketch.

## This is geometry, not a trained classifier

Say this plainly because the project brief insists on it, repeatedly, for
good reason: **the gesture engine is rule-based landmark analysis, not a
neural network.** MediaPipe's Hand Landmarker (a real model) produces 21
landmark positions per hand. Everything from "here are 21 points" to "this
is a PINCH" is arithmetic we write — finger-extension tests, distance
thresholds, angle checks — not a classifier trained on labeled gesture
data. Every `GestureResult` carries `method: 'HEURISTIC'`, never `'MODEL'`,
and the type itself makes that impossible to get wrong (`gestures/types.ts`
doesn't even have a code path that could set `'MODEL'`).

"Confidence" for a gesture means a normalized geometric margin (how far a
measurement sits from the decision threshold, saturating to 1 over a fixed
angular/distance range), not a calibrated probability. It's a useful and
honest signal, just not the same kind of number a softmax output would be.

## Supported gestures

| Gesture | Kind | Detection approach |
|---|---|---|
| `OPEN_PALM` | Static pose | Index/middle/ring/pinky all extended |
| `FIST` | Static pose | All 5 fingers curled |
| `POINT` | Static pose | Index extended, others curled |
| `PEACE` | Static pose | Index + middle extended, others curled |
| `THUMBS_UP` | Static pose | Thumb extended + pointing up, others curled |
| `THUMBS_DOWN` | Static pose | Thumb extended + pointing down, others curled |
| `PINCH` | Static, hysteresis | Thumb-tip↔index-tip distance, Schmitt trigger |
| `SWIPE_LEFT/RIGHT/UP/DOWN` | Temporal | Palm-centroid velocity over a 300ms window |

## Architecture: pure classifiers, stateful engine

```
gestures/
  geometry.ts              pure vector math (jointAngle, handScale, palmCentroid)
  classifiers/
    fingerState.ts          5-bit extended/curled state, per-frame, pure
    staticPose.ts            template matching -> {gesture, confidence}, pure
  temporal/
    swipe.ts                 SwipeDetector — ring buffer + cooldown, stateful
  engine.ts                  GestureEngine — per-hand hysteresis, pure classifiers + its own history
  types.ts                   GestureKind, GestureResult — the entire public surface
```

`classifyStaticPose()` and `pinchDistance()` are pure functions of one
frame's landmarks — no history, no DOM. `GestureEngine` is the stateful
layer that turns per-frame classification into something usable: it owns
per-hand pinch hysteresis, the pose-stability debounce window, and a
`SwipeDetector` instance, keyed by MediaPipe's raw handedness label so both
hands are tracked independently. "Pure" in IMPLEMENTATION.md §1.5's sense
means *this*: a deterministic function of its inputs plus its own
encapsulated history, not "literally no state anywhere."

## Static pose detection

Each of the four non-thumb fingers is tested by the angle at its PIP joint
between the MCP and TIP landmarks (`fingerState.ts`) — MediaPipe's DIP
landmark isn't used at all for this, since MCP-PIP-TIP already captures
whether the finger is straight or folded. A straight finger reads close to
180°; the cutoff is **140°**, chosen with margin from both a naturally
relaxed open hand and a loosely closed fist, since a hand is rarely either
perfectly straight or perfectly curled.

The thumb needs an extra check beyond its own angle threshold (also 140°,
measured at the IP joint): a **splay distance** from the thumb tip to the
index MCP, normalized by hand scale, must exceed **0.4**. Without this, a
thumb held straight but pressed flat against the palm (a common relaxed
fist) would misread as "extended" on angle alone.

The resulting 5-bit state is matched against an ordered template list
(`staticPose.ts`) — `FIST` and the thumb-only shape are checked first,
since they're most specific and would otherwise be ambiguous with each
other. `THUMBS_UP` and `THUMBS_DOWN` share an identical finger-extension
template (only the thumb is out) and are disambiguated afterward by
whether the thumb tip sits above or below the wrist, normalized by hand
scale, with a **0.15** dead zone for a thumb pointing roughly sideways —
genuinely ambiguous, so it reports `NONE` rather than guessing.

Confidence is the *weakest* matching finger's angle margin (in a 40°
window around the threshold) — a template is only as decisive as its least
certain check.

## Pinch, specifically

Pinch is deliberately **not** part of the static pose classifier — it
needs hysteresis across frames, which the pure classifiers don't have.
`pinchDistance()` reports the raw, normalized thumb-tip↔index-tip
distance; `GestureEngine` applies a Schmitt trigger on top: entering pinch
requires the distance to drop below **0.28**, exiting requires it to rise
back above **0.38**. A hand hovering exactly at one fixed threshold would
flicker between PINCH and not-PINCH many times a second; the gap between
the two thresholds makes it sticky in both directions.

## Temporal gestures (swipes)

`SwipeDetector` tracks the palm centroid (the average of the wrist and
four MCP knuckles — stable under individual fingers moving, unlike a
single fingertip) over a **300ms** rolling window. A swipe requires:

- at least **0.18** normalized displacement along one axis,
- that axis's displacement at least **1.6×** the other axis's (so a
  diagonal motion registers as neither, not both),
- a **600ms** cooldown after firing, so one continuous motion and its
  deceleration doesn't trigger several swipes in a row.

**The direction mapping has a subtlety worth getting right, because it's
easy to get backwards and only obvious once you're testing live**: swipe
detection runs on raw, unmirrored landmarks (per the coordinate convention
in `vision/types.ts`). A front-facing camera shows the user a mirror
image, so the user moving their hand to their own left is a *rising* raw
x, not falling. `SWIPE_LEFT`/`SWIPE_RIGHT` are defined from the user's own
point of view — get the sign backwards here and every swipe feels reversed
on screen despite the code "looking right" in isolation. `y` is never
mirrored, so the vertical mapping is direct: increasing y is downward.

Unlike static poses, a swipe is reported for exactly one frame — it
doesn't go through the stability debounce (that mechanism is for held
poses) and firing one doesn't change whatever pose is currently "stable."

## Stability, or: why gestures don't flicker

Two independent mechanisms, for two different kinds of noise:

1. **Pose debounce** (`GestureEngine`'s `applyStability`): a newly-detected
   pose must be the raw classification result for **3 consecutive frames**
   before it's reported — a hand transitioning between poses doesn't
   flicker through every geometrically-ambiguous intermediate shape. One
   frame back to the *previous* stable pose resets the pending count
   entirely (there's only one candidate tracked at a time); this is a
   documented, tested tradeoff, not an oversight.
2. **Pinch's Schmitt trigger**, described above — a different mechanism
   because it's a different problem (a boundary that gets crossed
   repeatedly, not a classification that's briefly ambiguous).

A real bug this caught: pinch's own hysteresis was originally the *only*
anti-flicker mechanism for it, but `PINCH` still goes through the same
3-frame pose debounce as everything else once it's the raw result — so
entering pinch takes "time to cross the distance threshold" *plus* 3
frames, not just the threshold crossing alone. This is intentional (a
false-positive click is worse than a few extra milliseconds of latency),
not a bug, but it was surprising enough during testing to write down here
before Phase 4 (Air Cursor) has to reason about click latency.

## Demo Mode actually exercises this

`vision/replay/fixtures.ts`'s synthetic hand cycles through every static
template plus a swipe — not a generic open/close wiggle. This isn't
cosmetic: an earlier version of that fixture *looked* like a moving hand
but, when actually run through the gesture engine, only ever produced
`OPEN_PALM` and `THUMBS_UP`/`THUMBS_DOWN` — the finger-curl parameters
happened to never cross the FIST/POINT/PEACE/PINCH thresholds, and the
wrist never moved far enough to trigger a swipe. `fixtures.test.ts` now
asserts every gesture is actually reachable, specifically so this can't
silently regress again.

## What's next

Phase 4 (Air Cursor) is the first real *consumer* of this: mapping
`PINCH` to click/drag, `POINT`'s index fingertip to cursor position, and
`OPEN_PALM` to release — plus real dominant-hand selection, which this
phase's `interaction/gestureBridge.ts` currently punts on (it just uses
"whichever hand MediaPipe reports first").
