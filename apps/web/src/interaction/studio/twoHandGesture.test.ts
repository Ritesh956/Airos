import { describe, expect, it } from 'vitest';
import { computeTwoHandDelta, type TwoHandPoints } from './twoHandGesture';

describe('computeTwoHandDelta', () => {
  it('reports no change when nothing moved', () => {
    const p: TwoHandPoints = { ax: 0.2, ay: 0.5, bx: 0.8, by: 0.5 };
    const { scaleRatio, deltaAngleRad } = computeTwoHandDelta(p, p);
    expect(scaleRatio).toBeCloseTo(1, 5);
    expect(deltaAngleRad).toBeCloseTo(0, 5);
  });

  it('detects pure scale-up when the hands move symmetrically apart', () => {
    const initial: TwoHandPoints = { ax: 0.4, ay: 0.5, bx: 0.6, by: 0.5 }; // dist 0.2
    const current: TwoHandPoints = { ax: 0.2, ay: 0.5, bx: 0.8, by: 0.5 }; // dist 0.6
    const { scaleRatio, deltaAngleRad } = computeTwoHandDelta(initial, current);
    expect(scaleRatio).toBeCloseTo(3, 5);
    expect(deltaAngleRad).toBeCloseTo(0, 5);
  });

  it('detects pure scale-down when the hands move together', () => {
    const initial: TwoHandPoints = { ax: 0.2, ay: 0.5, bx: 0.8, by: 0.5 };
    const current: TwoHandPoints = { ax: 0.4, ay: 0.5, bx: 0.6, by: 0.5 };
    const { scaleRatio } = computeTwoHandDelta(initial, current);
    expect(scaleRatio).toBeCloseTo(1 / 3, 5);
  });

  it('detects a pure 90 degree rotation with distance unchanged', () => {
    // a->b starts pointing along +x, ends pointing along +y (screen-space
    // down, since y grows downward in this normalized space).
    const initial: TwoHandPoints = { ax: 0, ay: 0, bx: 1, by: 0 };
    const current: TwoHandPoints = { ax: 0, ay: 0, bx: 0, by: 1 };
    const { scaleRatio, deltaAngleRad } = computeTwoHandDelta(initial, current);
    expect(scaleRatio).toBeCloseTo(1, 5);
    expect(deltaAngleRad).toBeCloseTo(Math.PI / 2, 5);
  });

  it('detects a combined scale + rotate', () => {
    const initial: TwoHandPoints = { ax: 0, ay: 0, bx: 1, by: 0 };
    const current: TwoHandPoints = { ax: 0, ay: 0, bx: 0, by: 2 }; // 90deg, 2x distance
    const { scaleRatio, deltaAngleRad } = computeTwoHandDelta(initial, current);
    expect(scaleRatio).toBeCloseTo(2, 5);
    expect(deltaAngleRad).toBeCloseTo(Math.PI / 2, 5);
  });

  it('normalizes the angle delta across the +-180deg wraparound instead of jumping nearly a full turn', () => {
    // a->b at ~179deg, moving to ~-179deg is a 2deg step the short way,
    // not a ~358deg step the long way.
    const initial: TwoHandPoints = { ax: 0, ay: 0, bx: -1, by: 0.017 }; // ~179deg
    const current: TwoHandPoints = { ax: 0, ay: 0, bx: -1, by: -0.017 }; // ~-179deg
    const { deltaAngleRad } = computeTwoHandDelta(initial, current);
    expect(Math.abs(deltaAngleRad)).toBeLessThan(0.1);
  });

  it('falls back to scaleRatio 1 instead of dividing by ~zero when the initial points coincide', () => {
    const initial: TwoHandPoints = { ax: 0.5, ay: 0.5, bx: 0.5, by: 0.5 };
    const current: TwoHandPoints = { ax: 0.2, ay: 0.5, bx: 0.8, by: 0.5 };
    const { scaleRatio } = computeTwoHandDelta(initial, current);
    expect(scaleRatio).toBe(1);
  });
});
