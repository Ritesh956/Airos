import { visionEngine } from '@/vision/engine/VisionEngine';
import { GestureEngine } from '@/gestures/engine';
import type { GestureKind, GestureResult } from '@/gestures/types';
import type { VisionFrame } from '@/vision/types';
import { appStore } from '@/state/appStore';
import { appendGestureHistory, clearGestureHistory, setActiveGesture } from '@/state/interactionStore';
import { throttle } from '@/state/createStore';

/**
 * The pipeline stage between raw hand landmarks and interaction state —
 * "VisionFrame -> GestureEngine -> InteractionEngine -> application state"
 * in IMPLEMENTATION.md §3. A full InteractionEngine (cursor mapping, drag
 * state, object selection) is Phase 4; for now this bridge's only job is
 * turning tracked hands into a named gesture the UI can read.
 *
 * One GestureEngine instance for the whole app, same reasoning as
 * VisionEngine: there's only one camera/hand-tracking pipeline active at a
 * time, so there's only one gesture history to maintain.
 */
const engine = new GestureEngine();

const PUBLISH_INTERVAL_MS = 100; // matches visionStore's cold-path rate

let latestResults: GestureResult[] = [];

const publishActiveGesture = throttle((results: GestureResult[]) => {
  // "Primary hand" is just "first hand MediaPipe reported" for now — real
  // dominant-hand selection (matching user handedness preference, or
  // preferring whichever hand is mid-gesture) is Air Cursor's job in
  // Phase 4, which needs it for the same reason.
  const primary = results[0] ?? null;
  setActiveGesture(
    primary ? { gesture: primary.gesture, confidence: primary.confidence, method: primary.method } : null,
  );
}, PUBLISH_INTERVAL_MS);

function isSwipe(gesture: GestureResult['gesture']): boolean {
  return gesture.startsWith('SWIPE_');
}

/** Gesture Lab's timeline (Phase 5) wants "what happened, when" — not a
 *  per-frame sample, which would repeat the same held pose 30x/sec. Log
 *  only the moment the primary hand's *stable* gesture changes, same
 *  change-guard principle as why the store publish below is throttled.
 *  NONE resets the tracked "last logged" kind rather than being logged
 *  itself, so a pose that disappears and reappears logs again instead of
 *  being permanently suppressed by a stale comparison. */
let lastLoggedGesture: GestureKind | null = null;

function logGestureTransition(result: GestureResult | null): void {
  const kind = result?.gesture ?? 'NONE';
  if (kind === 'NONE') {
    lastLoggedGesture = null;
    return;
  }
  if (kind === lastLoggedGesture) return;
  lastLoggedGesture = kind;
  appendGestureHistory({
    gesture: result!.gesture,
    confidence: result!.confidence,
    method: result!.method,
    hand: result!.hand,
    timestamp: result!.timestamp,
  });
}

function handleFrame(frame: VisionFrame): void {
  engine.pruneMissingHands(frame.hands.map((hand) => hand.handedness));
  latestResults = frame.hands.map((hand) => engine.update(hand, frame.timestamp));

  const primary = latestResults[0] ?? null;
  logGestureTransition(primary);

  if (primary && isSwipe(primary.gesture)) {
    // Swipes are one-frame discrete events, not sustained state — the
    // throttle below exists so a held pose (OPEN_PALM for seconds at a
    // time) doesn't publish every single frame. Applying it to a swipe
    // would silently lose it: `throttle` only keeps the *last* call's
    // arguments until its window fires, and the very next frame reverts
    // to whatever pose is stable, overwriting the pending swipe before it
    // ever reaches interactionStore. Publish immediately instead.
    setActiveGesture({ gesture: primary.gesture, confidence: primary.confidence, method: primary.method });
  } else {
    publishActiveGesture(latestResults);
  }
}

let started = false;
let lastInputSource = appStore.get().inputSource;
let lastCameraState = appStore.get().cameraState;

/** Idempotent: safe to call from every component that wants gesture data.
 *  Classifying gestures on landmarks that are already being tracked is
 *  cheap enough that, unlike vision tasks, this doesn't need its own
 *  acquire/release lifecycle — it just needs to be running at all. */
export function ensureGestureBridgeStarted(): void {
  if (started) return;
  started = true;
  visionEngine.subscribe(handleFrame);

  appStore.subscribe(() => {
    const { inputSource, cameraState } = appStore.get();
    if (inputSource === lastInputSource && cameraState === lastCameraState) return;
    lastInputSource = inputSource;
    lastCameraState = cameraState;

    // Switching the vision source (or the camera stopping/erroring) can
    // leave a gap where no more frames ever arrive — e.g. switching Demo
    // Mode off while the camera itself is off produces zero frames from
    // either source. Without this, `latestResults`/interactionStore would
    // keep showing whatever gesture was last seen, stale, indefinitely —
    // the same class of bug as visionStore's Phase 2 fix, one layer up.
    // Cancelling the throttle matters just as much as the direct set
    // below: a trailing publish already scheduled from a frame just
    // before this reset would otherwise fire moments later and silently
    // undo it.
    engine.reset();
    latestResults = [];
    publishActiveGesture.cancel();
    setActiveGesture(null);
    lastLoggedGesture = null;
    clearGestureHistory();
  });
}

/** Hot-path accessor: every currently-tracked hand's gesture result, for
 *  consumers that need per-hand detail (Gesture Lab's landmark table,
 *  eventually) rather than just the throttled "primary hand" summary in
 *  interactionStore. */
export function getLatestGestureResults(): GestureResult[] {
  return latestResults;
}
