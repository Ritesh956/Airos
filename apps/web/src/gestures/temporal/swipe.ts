import type { Landmark } from '@/vision/types';
import type { GestureKind } from '../types';
import { palmCentroid } from '../geometry';

interface CentroidSample {
  x: number;
  y: number;
  t: number;
}

const WINDOW_MS = 300;
// Normalized units (fraction of frame width/height) the palm centroid
// must travel within the window before this counts as a swipe rather
// than hand jitter or repositioning.
const MIN_DISPLACEMENT = 0.18;
// The dominant axis's displacement must exceed the other axis's by at
// least this factor, so a diagonal hand motion doesn't register as both
// (or neither) direction.
const MIN_AXIS_DOMINANCE = 1.6;
// After a swipe fires, ignore further motion for this long — otherwise
// one continuous hand movement (and its deceleration) can trigger several
// swipes in a row.
const COOLDOWN_MS = 600;

/**
 * Detects SWIPE_LEFT/RIGHT/UP/DOWN from the palm centroid's motion over a
 * short rolling window. Stateful by design (a ring buffer of recent
 * positions plus a cooldown timer) — this is the "temporal" half of the
 * gesture engine, as opposed to the single-frame static pose classifiers.
 */
export class SwipeDetector {
  private samples: CentroidSample[] = [];
  private lastSwipeAt = -Infinity;

  /** Feed one frame's landmarks in; returns the swipe that just fired, or
   *  null on every other frame (which is most of them — that's expected). */
  update(landmarks: Landmark[], timestamp: number): GestureKind | null {
    const centroid = palmCentroid(landmarks);
    this.samples.push({ x: centroid.x, y: centroid.y, t: timestamp });
    this.samples = this.samples.filter((sample) => timestamp - sample.t <= WINDOW_MS);

    if (timestamp - this.lastSwipeAt < COOLDOWN_MS) return null;
    if (this.samples.length < 2) return null;

    const first = this.samples[0]!;
    const last = this.samples[this.samples.length - 1]!;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let kind: GestureKind | null = null;
    if (absDx > MIN_DISPLACEMENT && absDx > absDy * MIN_AXIS_DOMINANCE) {
      // Landmarks here are the raw, unmirrored MediaPipe frame (see the
      // coordinate-convention note in vision/types.ts) — mirroring only
      // ever happens at the presentation layer. A front-facing camera
      // shows the user a mirror image, so the user moving their hand to
      // their own left is a *rising* raw x, not a falling one. Getting
      // this backwards would make every swipe feel reversed on screen.
      kind = dx > 0 ? 'SWIPE_LEFT' : 'SWIPE_RIGHT';
    } else if (absDy > MIN_DISPLACEMENT && absDy > absDx * MIN_AXIS_DOMINANCE) {
      // y is never mirrored (mirroring is horizontal-only), so this axis
      // is direct: image-space y grows downward.
      kind = dy > 0 ? 'SWIPE_DOWN' : 'SWIPE_UP';
    }

    if (kind) {
      this.lastSwipeAt = timestamp;
      // Clear the buffer so the tail end of this same motion can't also
      // satisfy the displacement check again the moment the cooldown
      // elapses.
      this.samples = [];
    }

    return kind;
  }

  reset(): void {
    this.samples = [];
    this.lastSwipeAt = -Infinity;
  }
}
