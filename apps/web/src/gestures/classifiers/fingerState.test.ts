import { describe, expect, it } from 'vitest';
import { getFingerState } from './fingerState';
import { fistHand, openPalmHand, peaceHand, pointHand } from '../testUtils/syntheticHand';

describe('getFingerState', () => {
  it('reads every finger as extended for an open palm', () => {
    const state = getFingerState(openPalmHand());
    expect(state).toEqual({ thumb: true, index: true, middle: true, ring: true, pinky: true });
  });

  it('reads every finger as curled for a fist', () => {
    const state = getFingerState(fistHand());
    expect(state).toEqual({ thumb: false, index: false, middle: false, ring: false, pinky: false });
  });

  it('reads only the index finger as extended for a point', () => {
    const state = getFingerState(pointHand());
    expect(state).toEqual({ thumb: false, index: true, middle: false, ring: false, pinky: false });
  });

  it('reads index and middle as extended for a peace sign', () => {
    const state = getFingerState(peaceHand());
    expect(state).toEqual({ thumb: false, index: true, middle: true, ring: false, pinky: false });
  });
});
