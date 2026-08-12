import { describe, expect, it } from 'vitest';
import { GestureEngine } from './engine';
import { handScale } from './geometry';
import { fistHand, openPalmHand, pinchHand, translateHand } from './testUtils/syntheticHand';
import type { HandObservation, Landmark } from '@/vision/types';

function hand(landmarks: Landmark[], handedness: 'Left' | 'Right' = 'Left'): HandObservation {
  return { landmarks, worldLandmarks: landmarks, handedness, handednessScore: 0.99 };
}

/** A hand whose thumb-index tip distance is an exact multiple of hand
 *  scale — for probing the pinch Schmitt trigger's dead zone precisely. */
function handWithPinchRatio(ratio: number): Landmark[] {
  const landmarks = openPalmHand();
  const scale = handScale(landmarks);
  const indexTip = landmarks[8]!;
  landmarks[4] = { x: indexTip.x + ratio * scale, y: indexTip.y, z: 0 };
  return landmarks;
}

describe('GestureEngine — static pose stability', () => {
  it('requires 3 consecutive frames before reporting a new gesture', () => {
    const engine = new GestureEngine();
    const results = [0, 1, 2].map((i) => engine.update(hand(openPalmHand()), i * 33));

    expect(results[0]!.gesture).toBe('NONE');
    expect(results[1]!.gesture).toBe('NONE');
    expect(results[2]!.gesture).toBe('OPEN_PALM');
    expect(results[2]!.confidence).toBeGreaterThan(0);
    expect(results[2]!.method).toBe('HEURISTIC');
  });

  it('keeps reporting the old stable gesture until the new one is confirmed', () => {
    const engine = new GestureEngine();
    [0, 1, 2].forEach((i) => engine.update(hand(openPalmHand()), i * 33));

    const transition = [3, 4, 5].map((i) => engine.update(hand(fistHand()), i * 33));
    expect(transition[0]!.gesture).toBe('OPEN_PALM');
    expect(transition[1]!.gesture).toBe('OPEN_PALM');
    expect(transition[2]!.gesture).toBe('FIST');
  });

  it('does not restart the stability count on a single noisy frame back to the old pose', () => {
    // This documents actual behavior, not an ideal: a single flicker back
    // to the previous pose resets the pending count entirely (it only
    // tracks one candidate at a time), so confirming FIST here takes a
    // fresh run of 3 consecutive frames after the blip.
    const engine = new GestureEngine();
    [0, 1, 2].forEach((i) => engine.update(hand(openPalmHand()), i * 33));

    engine.update(hand(fistHand()), 99);
    engine.update(hand(fistHand()), 132);
    engine.update(hand(openPalmHand()), 165); // one-frame blip back
    const afterBlip = engine.update(hand(fistHand()), 198);
    expect(afterBlip.gesture).toBe('OPEN_PALM'); // blip reset the pending FIST count

    const results = [231, 264, 297].map((t) => engine.update(hand(fistHand()), t));
    expect(results[2]!.gesture).toBe('FIST');
  });
});

describe('GestureEngine — pinch hysteresis', () => {
  it('confirms PINCH after 3 frames once inside the enter threshold', () => {
    const engine = new GestureEngine();
    const results = [0, 1, 2].map((i) => engine.update(hand(pinchHand()), i * 33));
    expect(results[2]!.gesture).toBe('PINCH');
  });

  it('stays PINCH inside the Schmitt-trigger dead zone (between enter and exit ratios)', () => {
    const engine = new GestureEngine();
    // Enter clearly (ratio well under 0.28).
    [0, 1, 2].forEach((i) => engine.update(hand(handWithPinchRatio(0.1)), i * 33));

    // 0.32 is between PINCH_ENTER_RATIO (0.28) and PINCH_EXIT_RATIO (0.38)
    // — a single fixed threshold would already have exited here.
    const deadZoneResults = [3, 4, 5].map((i) => engine.update(hand(handWithPinchRatio(0.32)), i * 33));
    expect(deadZoneResults.every((r) => r.gesture === 'PINCH')).toBe(true);
  });

  it('exits PINCH once distance clears the exit threshold, after restabilizing', () => {
    const engine = new GestureEngine();
    [0, 1, 2].forEach((i) => engine.update(hand(handWithPinchRatio(0.1)), i * 33));

    const afterExit = [3, 4, 5].map((i) => engine.update(hand(handWithPinchRatio(0.6)), i * 33));
    expect(afterExit[2]!.gesture).not.toBe('PINCH');
  });
});

describe('GestureEngine — swipes', () => {
  it('reports a swipe immediately, without the 3-frame stability delay', () => {
    const engine = new GestureEngine();
    const base = openPalmHand();
    let lastGesture: string | null = null;

    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * 250;
      const dx = 0.3 * (i / 12); // raw x rising -> SWIPE_LEFT, per swipe.ts
      const result = engine.update(hand(translateHand(base, dx, 0)), t);
      if (result.gesture === 'SWIPE_LEFT') lastGesture = result.gesture;
    }

    expect(lastGesture).toBe('SWIPE_LEFT');
  });
});

describe('GestureEngine — hand lifecycle', () => {
  it('pruneMissingHands drops history so a hand does not inherit stale state', () => {
    const engine = new GestureEngine();
    [0, 1, 2].forEach((i) => engine.update(hand(openPalmHand()), i * 33));
    // Confirm it actually stabilized first.
    expect(engine.update(hand(openPalmHand()), 99).gesture).toBe('OPEN_PALM');

    engine.pruneMissingHands([]); // 'Left' is no longer present this frame

    // A fresh FIST should need its own 3-frame ramp-up again, not inherit
    // "currently stable at OPEN_PALM" from before the hand disappeared.
    const result = engine.update(hand(fistHand()), 132);
    expect(result.gesture).toBe('NONE');
  });

  it('reset() clears every hand', () => {
    const engine = new GestureEngine();
    [0, 1, 2].forEach((i) => engine.update(hand(openPalmHand()), i * 33));
    engine.reset();
    const result = engine.update(hand(fistHand()), 99);
    expect(result.gesture).toBe('NONE');
  });

  it('tracks two hands independently', () => {
    const engine = new GestureEngine();
    [0, 1, 2].forEach((i) => {
      engine.update(hand(openPalmHand(), 'Left'), i * 33);
      engine.update(hand(fistHand(), 'Right'), i * 33);
    });

    expect(engine.update(hand(openPalmHand(), 'Left'), 99).gesture).toBe('OPEN_PALM');
    expect(engine.update(hand(fistHand(), 'Right'), 99).gesture).toBe('FIST');
  });
});
