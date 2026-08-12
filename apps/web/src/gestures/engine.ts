import type { Handedness, HandObservation } from '@/vision/types';
import type { GestureKind, GestureResult } from './types';
import { classifyStaticPose, pinchDistance } from './classifiers/staticPose';
import { SwipeDetector } from './temporal/swipe';

// A pose must hold for this many consecutive frames before it's reported
// as the active gesture — this, not the classifiers' own angle margins, is
// what keeps a hand hovering near a decision boundary from flickering
// between two gestures many times a second.
const STABILITY_FRAMES = 3;

// Pinch uses a Schmitt trigger (two thresholds, not one): entering pinch
// requires the thumb/index tips to get closer than PINCH_ENTER_RATIO,
// exiting requires them to pull apart past the looser PINCH_EXIT_RATIO.
// A single shared threshold would let a hand holding its fingers right at
// that distance flicker in and out of PINCH continuously.
const PINCH_ENTER_RATIO = 0.28;
const PINCH_EXIT_RATIO = 0.38;

interface HandTrack {
  swipeDetector: SwipeDetector;
  pinching: boolean;
  stableGesture: GestureKind;
  pendingGesture: GestureKind | null;
  pendingCount: number;
  lastConfidence: number;
}

function createHandTrack(): HandTrack {
  return {
    swipeDetector: new SwipeDetector(),
    pinching: false,
    stableGesture: 'NONE',
    pendingGesture: null,
    pendingCount: 0,
    lastConfidence: 0,
  };
}

/**
 * Turns per-frame hand landmarks into stable, named gestures. This is the
 * stateful half of the gesture engine described in IMPLEMENTATION.md
 * §1.5 and §7: "pure" in the sense that matters — a deterministic
 * function of its inputs plus its own encapsulated history, no DOM, no
 * React, no timers it doesn't own — but it does hold per-hand history
 * (pinch hysteresis, pose stability, swipe cooldown) across calls, because
 * none of those are expressible as a true single-frame pure function.
 *
 * One instance tracks both hands independently, keyed by MediaPipe's raw
 * (unmirrored) handedness label — see the field doc on
 * HandObservation.handedness in vision/types.ts before assuming that
 * label means what it sounds like.
 */
export class GestureEngine {
  private tracks = new Map<Handedness, HandTrack>();

  /** Classifies one hand's gesture for this frame, updating that hand's
   *  history in the process. Call once per tracked hand, every frame. */
  update(hand: HandObservation, timestamp: number): GestureResult {
    const track = this.tracks.get(hand.handedness) ?? createHandTrack();
    this.tracks.set(hand.handedness, track);

    const swipe = track.swipeDetector.update(hand.landmarks, timestamp);
    if (swipe) {
      // A swipe is a discrete, one-off event layered on top of whatever
      // static pose is currently stable — it doesn't go through the
      // stability window (that's for held poses) and doesn't become the
      // new "stable" gesture once it's reported.
      track.pendingGesture = null;
      track.pendingCount = 0;
      track.lastConfidence = 1;
      return this.toResult(hand, timestamp, swipe, 1);
    }

    const distance = pinchDistance(hand.landmarks);
    if (track.pinching) {
      if (distance > PINCH_EXIT_RATIO) track.pinching = false;
    } else if (distance < PINCH_ENTER_RATIO) {
      track.pinching = true;
    }

    const raw = track.pinching
      ? { gesture: 'PINCH' as const, confidence: Math.min(1, 1 - distance / PINCH_EXIT_RATIO) }
      : classifyStaticPose(hand.landmarks);

    const stabilized = this.applyStability(track, raw);
    track.lastConfidence = stabilized.confidence;

    return this.toResult(hand, timestamp, stabilized.gesture, stabilized.confidence);
  }

  /** Drops history for any hand not present in this frame's observations,
   *  so a hand that leaves and re-enters frame doesn't inherit a stale
   *  pinch state or half-finished stability count from before it
   *  disappeared. Call once per VisionFrame with every currently-visible
   *  hand's handedness. */
  pruneMissingHands(presentHands: Handedness[]): void {
    for (const handedness of this.tracks.keys()) {
      if (!presentHands.includes(handedness)) this.tracks.delete(handedness);
    }
  }

  /** Drops all history — call when tracking is lost entirely. */
  reset(): void {
    this.tracks.clear();
  }

  private applyStability(
    track: HandTrack,
    raw: { gesture: GestureKind; confidence: number },
  ): { gesture: GestureKind; confidence: number } {
    if (raw.gesture === track.stableGesture) {
      track.pendingGesture = null;
      track.pendingCount = 0;
      return raw;
    }

    if (raw.gesture === track.pendingGesture) {
      track.pendingCount += 1;
    } else {
      track.pendingGesture = raw.gesture;
      track.pendingCount = 1;
    }

    if (track.pendingCount >= STABILITY_FRAMES) {
      track.stableGesture = raw.gesture;
      track.pendingGesture = null;
      track.pendingCount = 0;
      return raw;
    }

    // Not confirmed yet — keep reporting the previous stable gesture
    // rather than flickering to a not-yet-confirmed candidate.
    return { gesture: track.stableGesture, confidence: track.lastConfidence };
  }

  private toResult(
    hand: HandObservation,
    timestamp: number,
    gesture: GestureKind,
    confidence: number,
  ): GestureResult {
    return {
      gesture,
      confidence,
      method: 'HEURISTIC',
      hand: hand.handedness,
      timestamp,
      landmarks: hand.landmarks,
    };
  }
}
