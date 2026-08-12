import { describe, expect, it } from 'vitest';
import { SwipeDetector } from './swipe';
import { centroidOnlyLandmarks } from '../testUtils/syntheticHand';
import type { GestureKind } from '../types';

/** Feeds a linear motion from `from` to `to` along one axis across `steps`
 *  frames spanning `durationMs`, starting at `startTime`. Returns every
 *  non-null result the detector produced along the way. SwipeDetector
 *  takes timestamps as a plain number parameter (no real timers involved),
 *  so this is fully deterministic and synchronous. */
function feedMotion(
  detector: SwipeDetector,
  axis: 'x' | 'y',
  from: number,
  to: number,
  steps: number,
  durationMs: number,
  startTime = 0,
): GestureKind[] {
  const results: GestureKind[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = startTime + (i / steps) * durationMs;
    const value = from + ((to - from) * i) / steps;
    const landmarks =
      axis === 'x' ? centroidOnlyLandmarks(value, 0.5) : centroidOnlyLandmarks(0.5, value);
    const result = detector.update(landmarks, t);
    if (result) results.push(result);
  }
  return results;
}

describe('SwipeDetector', () => {
  it('does not fire for small motion under the displacement threshold', () => {
    const detector = new SwipeDetector();
    const results = feedMotion(detector, 'x', 0.5, 0.55, 10, 250);
    expect(results).toEqual([]);
  });

  it('fires SWIPE_LEFT for a rising raw x (see the mirroring note in swipe.ts)', () => {
    const detector = new SwipeDetector();
    const results = feedMotion(detector, 'x', 0.3, 0.6, 12, 250);
    expect(results).toContain('SWIPE_LEFT');
  });

  it('fires SWIPE_RIGHT for a falling raw x', () => {
    const detector = new SwipeDetector();
    const results = feedMotion(detector, 'x', 0.7, 0.4, 12, 250);
    expect(results).toContain('SWIPE_RIGHT');
  });

  it('fires SWIPE_DOWN for increasing y (image space grows downward)', () => {
    const detector = new SwipeDetector();
    const results = feedMotion(detector, 'y', 0.2, 0.5, 12, 250);
    expect(results).toContain('SWIPE_DOWN');
  });

  it('fires SWIPE_UP for decreasing y', () => {
    const detector = new SwipeDetector();
    const results = feedMotion(detector, 'y', 0.6, 0.3, 12, 250);
    expect(results).toContain('SWIPE_UP');
  });

  it('does not fire for a roughly diagonal motion (no dominant axis)', () => {
    const detector = new SwipeDetector();
    const results: GestureKind[] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 250;
      const x = 0.3 + (0.3 * i) / steps;
      const y = 0.3 + (0.28 * i) / steps;
      const result = detector.update(centroidOnlyLandmarks(x, y), t);
      if (result) results.push(result);
    }
    expect(results).toEqual([]);
  });

  it('respects the cooldown: a second swipe right after the first does not fire', () => {
    const detector = new SwipeDetector();
    const first = feedMotion(detector, 'x', 0.3, 0.6, 12, 250);
    expect(first).toContain('SWIPE_LEFT');

    // Immediately try to swipe again, starting right where the first left off.
    const second = feedMotion(detector, 'x', 0.6, 0.3, 12, 250, 260);
    expect(second).toEqual([]);
  });

  it('fires again once the cooldown window has elapsed', () => {
    const detector = new SwipeDetector();
    const first = feedMotion(detector, 'x', 0.3, 0.6, 12, 250);
    expect(first).toContain('SWIPE_LEFT');

    // Well past COOLDOWN_MS (600ms) after the first swipe fired.
    const second = feedMotion(detector, 'x', 0.6, 0.3, 12, 250, 1200);
    expect(second).toContain('SWIPE_RIGHT');
  });

  it('reset() clears history and cooldown', () => {
    const detector = new SwipeDetector();
    feedMotion(detector, 'x', 0.3, 0.6, 12, 250);
    detector.reset();

    // Without a reset this would still be inside the cooldown window.
    const results = feedMotion(detector, 'x', 0.3, 0.6, 12, 250, 50);
    expect(results).toContain('SWIPE_LEFT');
  });
});
