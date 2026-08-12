import { describe, expect, it } from 'vitest';
import { landmarkToPixels, mirrorHandedness, mirrorLandmark, mirrorX } from './coords';

describe('mirrorX', () => {
  it('reflects across the center line', () => {
    expect(mirrorX(0)).toBe(1);
    expect(mirrorX(1)).toBe(0);
    expect(mirrorX(0.5)).toBe(0.5);
    expect(mirrorX(0.25)).toBeCloseTo(0.75);
  });
});

describe('mirrorLandmark', () => {
  it('flips x only, leaving y and z untouched', () => {
    const result = mirrorLandmark({ x: 0.2, y: 0.6, z: -0.01, visibility: 0.9 });
    expect(result.x).toBeCloseTo(0.8);
    expect(result.y).toBe(0.6);
    expect(result.z).toBe(-0.01);
    expect(result.visibility).toBe(0.9);
  });
});

describe('mirrorHandedness', () => {
  it('flips Left <-> Right', () => {
    expect(mirrorHandedness('Left')).toBe('Right');
    expect(mirrorHandedness('Right')).toBe('Left');
  });

  it('is its own inverse', () => {
    expect(mirrorHandedness(mirrorHandedness('Left'))).toBe('Left');
  });
});

describe('landmarkToPixels', () => {
  it('scales normalized coordinates by the given box size', () => {
    expect(landmarkToPixels({ x: 0.5, y: 0.25 }, 1000, 800)).toEqual({ x: 500, y: 200 });
  });

  it('handles the origin and far corner', () => {
    expect(landmarkToPixels({ x: 0, y: 0 }, 640, 480)).toEqual({ x: 0, y: 0 });
    expect(landmarkToPixels({ x: 1, y: 1 }, 640, 480)).toEqual({ x: 640, y: 480 });
  });
});
