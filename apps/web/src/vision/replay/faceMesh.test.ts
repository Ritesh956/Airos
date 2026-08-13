import { beforeAll, describe, expect, it } from 'vitest';
import { generateSyntheticFace, preloadFaceMeshTopology, walkConnectionsIntoLoops } from './faceMesh';

describe('walkConnectionsIntoLoops', () => {
  it('walks a simple closed loop into one ordered cycle', () => {
    const loops = walkConnectionsIntoLoops([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 0 },
    ]);

    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    expect(new Set(loops[0])).toEqual(new Set([0, 1, 2, 3]));
    // Adjacent walk order: consecutive entries (wrapping) must be an edge
    // that was actually in the input.
    const loop = loops[0]!;
    for (let i = 0; i < loop.length; i += 1) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      const isEdge = Math.abs(a - b) === 1 || (a === 0 && b === 3) || (a === 3 && b === 0);
      expect(isEdge).toBe(true);
    }
  });

  it('walks a simple open chain start-to-end', () => {
    const loops = walkConnectionsIntoLoops([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);

    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([0, 1, 2, 3]);
  });

  it('handles multiple disjoint components (e.g. inner + outer lip loops)', () => {
    const loops = walkConnectionsIntoLoops([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 0 },
      { start: 10, end: 11 },
      { start: 11, end: 12 },
      { start: 12, end: 10 },
    ]);

    expect(loops).toHaveLength(2);
    const allIndices = loops.flat();
    expect(new Set(allIndices)).toEqual(new Set([0, 1, 2, 10, 11, 12]));
  });

  it('returns nothing for an empty connection list', () => {
    expect(walkConnectionsIntoLoops([])).toEqual([]);
  });
});

describe('generateSyntheticFace', () => {
  // generateSyntheticFace() requires the real @mediapipe/tasks-vision
  // connection topology to already be cached — see preloadFaceMeshTopology's
  // doc comment for why that's a dynamic import rather than a static one.
  beforeAll(async () => {
    await preloadFaceMeshTopology();
  });

  it('produces a well-formed, in-bounds landmark array', () => {
    const face = generateSyntheticFace(0);

    expect(face.landmarks.length).toBeGreaterThan(50);
    for (const point of face.landmarks) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it('actually animates over time rather than sitting static', () => {
    // A regression guard in the spirit of bug #6 (CLAUDE.md): a fixture
    // that "looks" alive but never actually changes any point wouldn't be
    // demoing anything. Sample across a full blink+mouth period and assert
    // at least one landmark's position genuinely varies.
    const samples = [0, 400, 800, 1200, 1600, 2000, 2400, 2800, 3200].map((t) => generateSyntheticFace(t));

    let anyDifference = false;
    for (let i = 1; i < samples.length && !anyDifference; i += 1) {
      const a = samples[0]!.landmarks;
      const b = samples[i]!.landmarks;
      for (let p = 0; p < a.length; p += 1) {
        if (Math.abs(a[p]!.x - b[p]!.x) > 1e-6 || Math.abs(a[p]!.y - b[p]!.y) > 1e-6) {
          anyDifference = true;
          break;
        }
      }
    }
    expect(anyDifference).toBe(true);
  });

  it('is deterministic for a given timestamp', () => {
    const a = generateSyntheticFace(1234);
    const b = generateSyntheticFace(1234);
    expect(a).toEqual(b);
  });
});
