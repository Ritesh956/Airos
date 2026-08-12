import { beforeEach, describe, expect, it } from 'vitest';
import { getReachBox, mapThroughReachBox, resetReachBox, sanitizeReachBox, setReachBox } from './calibration';
import { DEFAULT_REACH_BOX } from '@/state/appStore';

beforeEach(() => {
  resetReachBox();
});

describe('sanitizeReachBox', () => {
  it('normalizes corners given in any order into min < max', () => {
    const box = sanitizeReachBox({ minX: 0.8, maxX: 0.2, minY: 0.7, maxY: 0.1 });
    expect(box.minX).toBeLessThan(box.maxX);
    expect(box.minY).toBeLessThan(box.maxY);
    expect(box.minX).toBeCloseTo(0.2);
    expect(box.maxX).toBeCloseTo(0.8);
  });

  it('expands a degenerate box (both corners nearly the same point) to a minimum span', () => {
    const box = sanitizeReachBox({ minX: 0.5, maxX: 0.501, minY: 0.5, maxY: 0.502 });
    expect(box.maxX - box.minX).toBeGreaterThan(0.05);
    expect(box.maxY - box.minY).toBeGreaterThan(0.05);
  });

  it('clamps to [0, 1]', () => {
    const box = sanitizeReachBox({ minX: -0.5, maxX: 1.5, minY: -0.2, maxY: 1.2 });
    expect(box.minX).toBeGreaterThanOrEqual(0);
    expect(box.maxX).toBeLessThanOrEqual(1);
    expect(box.minY).toBeGreaterThanOrEqual(0);
    expect(box.maxY).toBeLessThanOrEqual(1);
  });
});

describe('mapThroughReachBox', () => {
  const box = { minX: 0.2, maxX: 0.8, minY: 0.3, maxY: 0.7 };

  it('maps the box corners to 0 and 1', () => {
    expect(mapThroughReachBox({ x: 0.2, y: 0.3 }, box)).toEqual({ x: 0, y: 0 });
    expect(mapThroughReachBox({ x: 0.8, y: 0.7 }, box)).toEqual({ x: 1, y: 1 });
  });

  it('maps the box center to 0.5, 0.5', () => {
    const result = mapThroughReachBox({ x: 0.5, y: 0.5 }, box);
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBeCloseTo(0.5);
  });

  it('clamps points outside the box rather than producing values outside [0, 1]', () => {
    const result = mapThroughReachBox({ x: -1, y: 2 }, box);
    expect(result.x).toBe(0);
    expect(result.y).toBe(1);
  });
});

describe('reach box persistence', () => {
  it('defaults to the center 60% x 60% box', () => {
    expect(getReachBox()).toEqual(DEFAULT_REACH_BOX);
  });

  it('setReachBox is readable back via getReachBox, sanitized', () => {
    setReachBox({ minX: 0.9, maxX: 0.1, minY: 0.9, maxY: 0.1 });
    const box = getReachBox();
    expect(box.minX).toBeCloseTo(0.1);
    expect(box.maxX).toBeCloseTo(0.9);
  });

  it('resetReachBox restores the default', () => {
    setReachBox({ minX: 0, maxX: 0.3, minY: 0, maxY: 0.3 });
    resetReachBox();
    expect(getReachBox()).toEqual(DEFAULT_REACH_BOX);
  });
});
