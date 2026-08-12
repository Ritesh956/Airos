import { describe, expect, it } from 'vitest';
import { generateGestureShowcaseFixture } from './fixtures';
import { classifyStaticPose, pinchDistance } from '@/gestures/classifiers/staticPose';
import { SwipeDetector } from '@/gestures/temporal/swipe';
import { GestureEngine } from '@/gestures/engine';
import type { GestureKind } from '@/gestures/types';

describe('generateGestureShowcaseFixture', () => {
  it('produces a non-trivial, evenly-paced sequence', () => {
    const frames = generateGestureShowcaseFixture({ fps: 30 });
    expect(frames.length).toBeGreaterThan(60);
  });

  it('every frame has exactly one hand with 21 well-formed landmarks', () => {
    const frames = generateGestureShowcaseFixture({ fps: 30 });
    for (const frame of frames) {
      expect(frame.hands).toHaveLength(1);
      const hand = frame.hands[0]!;
      expect(hand.landmarks).toHaveLength(21);
      expect(hand.worldLandmarks).toHaveLength(21);
      for (const point of hand.landmarks) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
        expect(Number.isFinite(point.z)).toBe(true);
      }
    }
  });

  it('marks every frame as replay-sourced with no face/pose data', () => {
    const frames = generateGestureShowcaseFixture({ fps: 30 });
    for (const frame of frames) {
      expect(frame.source).toBe('replay');
      expect(frame.face).toBeNull();
      expect(frame.pose).toBeNull();
    }
  });

  it('timestamps are strictly increasing', () => {
    const frames = generateGestureShowcaseFixture({ fps: 30 });
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.timestamp).toBeGreaterThan(frames[i - 1]!.timestamp);
    }
  });

  // This is the regression test for a real bug: the original version of
  // this fixture was a generic continuous open/close wiggle that, when
  // actually run through the gesture engine in the browser, only ever
  // produced OPEN_PALM and THUMBS_UP/DOWN — never FIST, POINT, PEACE,
  // PINCH, or a swipe. Demo Mode is the first thing a camera-less visitor
  // sees, so "the fixture looks like a hand" isn't enough; it has to
  // actually exercise the gesture engine the way a real hand would.
  it('actually classifies as every static gesture at some point in the loop', () => {
    const frames = generateGestureShowcaseFixture({ fps: 30 });
    const seen = new Set(frames.map((f) => classifyStaticPose(f.hands[0]!.landmarks).gesture));

    const expectedGestures: GestureKind[] = ['OPEN_PALM', 'FIST', 'POINT', 'PEACE', 'THUMBS_UP'];
    for (const expected of expectedGestures) {
      expect(seen.has(expected), `expected the fixture to pass through ${expected}`).toBe(true);
    }
  });

  it('drops below the pinch-entry threshold at some point', () => {
    const frames = generateGestureShowcaseFixture({ fps: 30 });
    const minDistance = Math.min(...frames.map((f) => pinchDistance(f.hands[0]!.landmarks)));
    expect(minDistance).toBeLessThan(0.28);
  });

  it('produces at least one leftward and one rightward swipe', () => {
    const frames = generateGestureShowcaseFixture({ fps: 30 });
    const detector = new SwipeDetector();
    const results = frames.map((f) => detector.update(f.hands[0]!.landmarks, f.timestamp));

    expect(results).toContain('SWIPE_LEFT');
    expect(results).toContain('SWIPE_RIGHT');
  });

  it('every showcased gesture survives the full GestureEngine, stability window included', () => {
    // The unit-level checks above call the pure classifiers directly; this
    // drives the actual stateful engine (hysteresis, 3-frame debounce)
    // across the whole sequence, the same way the real pipeline would —
    // proving each pose is held long enough to actually be *reported*, not
    // just technically classifiable for a single frame.
    const frames = generateGestureShowcaseFixture({ fps: 30 });
    const engine = new GestureEngine();
    const reported = new Set(
      frames.map((f) => engine.update(f.hands[0]!, f.timestamp).gesture),
    );

    const expectedGestures: GestureKind[] = ['OPEN_PALM', 'FIST', 'POINT', 'PEACE', 'THUMBS_UP', 'PINCH'];
    for (const expected of expectedGestures) {
      expect(reported.has(expected), `expected GestureEngine to report ${expected}`).toBe(true);
    }
  });
});
