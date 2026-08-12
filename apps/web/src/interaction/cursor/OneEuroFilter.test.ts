import { describe, expect, it } from 'vitest';
import { OneEuroFilter, Point2DFilter } from './OneEuroFilter';

describe('OneEuroFilter', () => {
  it('returns the raw value on the very first sample (no history to smooth against)', () => {
    const filter = new OneEuroFilter();
    expect(filter.filter(5, 0)).toBe(5);
  });

  it('holds steady on a constant signal', () => {
    const filter = new OneEuroFilter();
    filter.filter(3, 0);
    const result = filter.filter(3, 1 / 30);
    expect(result).toBeCloseTo(3, 5);
  });

  it('smooths a sudden jump rather than snapping to it immediately', () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0.02 });
    filter.filter(0, 0);
    const result = filter.filter(10, 1 / 30);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });

  it('converges toward a new steady value over repeated samples', () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0.02 });
    filter.filter(0, 0);
    let result = 0;
    for (let i = 1; i <= 60; i++) {
      result = filter.filter(10, i / 30);
    }
    expect(result).toBeCloseTo(10, 1);
  });

  it('a higher beta tracks a moving target more closely (less lag) than a lower one', () => {
    const track = (beta: number) => {
      const filter = new OneEuroFilter({ minCutoff: 1, beta });
      let result = 0;
      // A signal ramping steadily upward — a filter with less lag should
      // sit closer to the current (moving) input at any given sample.
      for (let i = 0; i <= 30; i++) {
        result = filter.filter(i, i / 30);
      }
      return result;
    };

    const lowBeta = track(0.001);
    const highBeta = track(1.5);
    // The input's final value is 30; the less-laggy (higher beta) filter
    // should have ended up closer to it.
    expect(Math.abs(30 - highBeta)).toBeLessThan(Math.abs(30 - lowBeta));
  });

  it('reset() drops history so the next sample is unsmoothed again', () => {
    const filter = new OneEuroFilter();
    filter.filter(0, 0);
    filter.filter(10, 1 / 30);
    filter.reset();
    expect(filter.filter(100, 2 / 30)).toBe(100);
  });

  it('setParams changes behavior without resetting history', () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0.02 });
    filter.filter(0, 0);
    const midway = filter.filter(5, 1 / 30);
    filter.setParams(1, 0.02); // same params, just re-set
    const next = filter.filter(5, 2 / 30);
    // Continuing toward the same steady value, not jumping back to raw
    // input as reset() would cause.
    expect(next).toBeGreaterThanOrEqual(midway);
    expect(next).toBeLessThanOrEqual(5);
  });
});

describe('Point2DFilter', () => {
  it('filters x and y independently', () => {
    const filter = new Point2DFilter();
    const first = filter.filter({ x: 0, y: 10 }, 0);
    expect(first).toEqual({ x: 0, y: 10 });

    const second = filter.filter({ x: 100, y: 10 }, 1 / 30);
    expect(second.y).toBeCloseTo(10, 5);
    expect(second.x).toBeGreaterThan(0);
    expect(second.x).toBeLessThan(100);
  });

  it('reset() clears both axes', () => {
    const filter = new Point2DFilter();
    filter.filter({ x: 0, y: 0 }, 0);
    filter.filter({ x: 50, y: 50 }, 1 / 30);
    filter.reset();
    expect(filter.filter({ x: 200, y: 200 }, 2 / 30)).toEqual({ x: 200, y: 200 });
  });
});
