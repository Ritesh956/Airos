import { describe, expect, it } from 'vitest';
import { classifyStaticPose, pinchDistance } from './staticPose';
import {
  ambiguousThumbHand,
  fistHand,
  openPalmHand,
  peaceHand,
  pinchHand,
  pointHand,
  thumbsDownHand,
  thumbsUpHand,
} from '../testUtils/syntheticHand';

describe('classifyStaticPose', () => {
  it('classifies each static template correctly, with confidence in (0, 1]', () => {
    const cases: [() => ReturnType<typeof openPalmHand>, string][] = [
      [openPalmHand, 'OPEN_PALM'],
      [fistHand, 'FIST'],
      [pointHand, 'POINT'],
      [peaceHand, 'PEACE'],
      [thumbsUpHand, 'THUMBS_UP'],
      [thumbsDownHand, 'THUMBS_DOWN'],
    ];

    for (const [build, expected] of cases) {
      const result = classifyStaticPose(build());
      expect(result.gesture, `expected ${expected}`).toBe(expected);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('reports NONE for a thumb extended but pointing sideways (genuinely ambiguous)', () => {
    const result = classifyStaticPose(ambiguousThumbHand());
    expect(result.gesture).toBe('NONE');
    expect(result.confidence).toBe(0);
  });

  it('never returns PINCH — that requires hysteresis owned by GestureEngine', () => {
    // A pinch hand still has some other finger template match (or NONE);
    // classifyStaticPose has no concept of pinch at all.
    const result = classifyStaticPose(pinchHand());
    expect(result.gesture).not.toBe('PINCH');
  });
});

describe('pinchDistance', () => {
  it('is small for a pinched hand and larger for an open palm', () => {
    const pinch = pinchDistance(pinchHand());
    const open = pinchDistance(openPalmHand());
    expect(pinch).toBeLessThan(0.1);
    expect(open).toBeGreaterThan(pinch);
  });
});
