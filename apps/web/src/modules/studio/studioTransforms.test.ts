import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  getStudioTransform,
  initStudioTransforms,
  nudgeStudioPosition,
  nudgeStudioRotationY,
  nudgeStudioScale,
  setStudioPosition,
  setStudioRotationY,
  setStudioScale,
} from './studioTransforms';
import type { StudioObjectSpec } from './studioObjects';

const TEST_OBJECTS: StudioObjectSpec[] = [
  { id: 'a', type: 'cube', label: 'A', position: [1, 2, 3], color: '#fff' },
];

beforeEach(() => {
  initStudioTransforms(TEST_OBJECTS);
});

describe('studioTransforms', () => {
  it('initializes from the object spec with identity rotation/scale', () => {
    expect(getStudioTransform('a')).toEqual({ x: 1, y: 2, z: 3, rotationY: 0, scale: 1 });
  });

  it('is a no-op for an unknown id rather than throwing', () => {
    expect(() => setStudioPosition('missing', 0, 0, 0)).not.toThrow();
    expect(() => nudgeStudioScale('missing', 2)).not.toThrow();
    expect(getStudioTransform('missing')).toBeUndefined();
  });

  it('setStudioPosition clamps to the position bounds', () => {
    setStudioPosition('a', 999, 999, -999);
    const t = getStudioTransform('a')!;
    expect(t.x).toBeLessThanOrEqual(4);
    expect(t.y).toBeLessThanOrEqual(3);
    expect(t.z).toBeGreaterThanOrEqual(-4);
  });

  it('nudgeStudioPosition adds a relative delta', () => {
    nudgeStudioPosition('a', 0.5, -0.5);
    const t = getStudioTransform('a')!;
    expect(t.x).toBeCloseTo(1.5);
    expect(t.y).toBeCloseTo(1.5);
    expect(t.z).toBeCloseTo(3);
  });

  it('setStudioScale clamps to [MIN_SCALE, MAX_SCALE]', () => {
    setStudioScale('a', 999);
    expect(getStudioTransform('a')!.scale).toBe(MAX_SCALE);
    setStudioScale('a', -5);
    expect(getStudioTransform('a')!.scale).toBe(MIN_SCALE);
  });

  it('nudgeStudioScale multiplies the current scale, clamped', () => {
    setStudioScale('a', 1);
    nudgeStudioScale('a', 1.1);
    expect(getStudioTransform('a')!.scale).toBeCloseTo(1.1);
    nudgeStudioScale('a', 100);
    expect(getStudioTransform('a')!.scale).toBe(MAX_SCALE);
  });

  it('setStudioRotationY and nudgeStudioRotationY are unclamped (rotation wraps visually, not numerically bounded)', () => {
    setStudioRotationY('a', Math.PI);
    nudgeStudioRotationY('a', Math.PI);
    expect(getStudioTransform('a')!.rotationY).toBeCloseTo(2 * Math.PI);
  });
});
