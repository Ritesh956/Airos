import { describe, expect, it } from 'vitest';
import {
  applyPauseTimer,
  applyResetTimer,
  applyStartTimer,
  clampSlideIndex,
  computeElapsedMs,
  type TimerState,
} from './presentStore';

describe('clampSlideIndex', () => {
  it('leaves an in-range index untouched', () => {
    expect(clampSlideIndex(3, 8)).toBe(3);
  });

  it('clamps below zero to the first slide', () => {
    expect(clampSlideIndex(-5, 8)).toBe(0);
  });

  it('clamps past the end to the last slide', () => {
    expect(clampSlideIndex(99, 8)).toBe(7);
  });
});

describe('computeElapsedMs', () => {
  it('reports banked time while paused', () => {
    const state = { isTimerRunning: false, runStartedAt: null, accumulatedMs: 4000 };
    expect(computeElapsedMs(state, 999999)).toBe(4000);
  });

  it('adds the current run segment on top of banked time while running', () => {
    const state = { isTimerRunning: true, runStartedAt: 1000, accumulatedMs: 4000 };
    expect(computeElapsedMs(state, 1500)).toBe(4500);
  });
});

describe('applyStartTimer', () => {
  it('starts the run segment from a paused state', () => {
    const state = { isTimerRunning: false, runStartedAt: null, accumulatedMs: 2000 };
    expect(applyStartTimer(state, 5000)).toEqual({ isTimerRunning: true, runStartedAt: 5000 });
  });

  it('is a no-op if already running — starting twice does not reset the run segment', () => {
    const state = { isTimerRunning: true, runStartedAt: 1000, accumulatedMs: 0 };
    expect(applyStartTimer(state, 9999)).toEqual({});
  });
});

describe('applyPauseTimer', () => {
  it('banks the current run segment and clears runStartedAt', () => {
    const state = { isTimerRunning: true, runStartedAt: 1000, accumulatedMs: 4000 };
    expect(applyPauseTimer(state, 1500)).toEqual({
      isTimerRunning: false,
      runStartedAt: null,
      accumulatedMs: 4500,
    });
  });

  it('is a no-op if already paused — pausing twice does not double-bank time', () => {
    const state = { isTimerRunning: false, runStartedAt: null, accumulatedMs: 4500 };
    expect(applyPauseTimer(state, 9999)).toEqual({});
  });

  it('a start/pause/start/pause sequence accumulates correctly across gaps', () => {
    let state: TimerState = { isTimerRunning: false, runStartedAt: null, accumulatedMs: 0 };
    state = { ...state, ...applyStartTimer(state, 0) };
    state = { ...state, ...applyPauseTimer(state, 1000) }; // +1000ms
    state = { ...state, ...applyStartTimer(state, 5000) }; // gap while paused doesn't count
    state = { ...state, ...applyPauseTimer(state, 6200) }; // +1200ms
    expect(state.accumulatedMs).toBe(2200);
    expect(state.isTimerRunning).toBe(false);
  });
});

describe('applyResetTimer', () => {
  it('zeroes accumulated time and stops the run segment', () => {
    expect(applyResetTimer()).toEqual({ isTimerRunning: false, runStartedAt: null, accumulatedMs: 0 });
  });
});
