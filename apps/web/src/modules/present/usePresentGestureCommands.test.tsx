import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setActiveGesture } from '@/state/interactionStore';
import { usePresentGestureCommands } from './usePresentGestureCommands';
import { presentStore } from './presentStore';
import { SLIDES } from './slides';

const INITIAL_STATE = { ...presentStore.get() };

beforeEach(() => {
  presentStore.set({ ...INITIAL_STATE });
  setActiveGesture(null);
});

describe('usePresentGestureCommands', () => {
  it('does not act on whatever gesture is already stale in the store at mount', () => {
    setActiveGesture({ gesture: 'THUMBS_UP', confidence: 1, method: 'HEURISTIC' });

    renderHook(() => usePresentGestureCommands());

    expect(presentStore.get().isTimerRunning).toBe(false);
  });

  it('SWIPE_LEFT advances to the next slide', () => {
    renderHook(() => usePresentGestureCommands());

    act(() => setActiveGesture({ gesture: 'SWIPE_LEFT', confidence: 1, method: 'HEURISTIC' }));

    expect(presentStore.get().slideIndex).toBe(1);
  });

  it('SWIPE_RIGHT moves to the previous slide, clamped at zero', () => {
    renderHook(() => usePresentGestureCommands());

    act(() => setActiveGesture({ gesture: 'SWIPE_RIGHT', confidence: 1, method: 'HEURISTIC' }));

    expect(presentStore.get().slideIndex).toBe(0);
  });

  it('two consecutive SWIPE_LEFT publishes both advance the slide — no missed fires', () => {
    renderHook(() => usePresentGestureCommands());

    act(() => setActiveGesture({ gesture: 'SWIPE_LEFT', confidence: 1, method: 'HEURISTIC' }));
    act(() => setActiveGesture({ gesture: 'SWIPE_LEFT', confidence: 1, method: 'HEURISTIC' }));

    expect(presentStore.get().slideIndex).toBe(2);
  });

  it('a held pose republished every throttle tick only fires once — no double-fires', () => {
    renderHook(() => usePresentGestureCommands());

    // Simulates gestureBridge's throttled republish of a still-held THUMBS_UP:
    // a fresh object each call, identical value, several times in a row.
    for (let i = 0; i < 5; i += 1) {
      act(() => setActiveGesture({ gesture: 'THUMBS_UP', confidence: 0.9 + i * 0.01, method: 'HEURISTIC' }));
    }

    // startTimer() is itself idempotent (applyStartTimer no-ops once
    // running), so this assertion alone wouldn't catch a double-fire bug —
    // the real proof is accumulatedMs staying untouched by the repeats.
    expect(presentStore.get().isTimerRunning).toBe(true);
    expect(presentStore.get().accumulatedMs).toBe(0);
  });

  it('THUMBS_UP starts the timer, FIST pauses it', () => {
    renderHook(() => usePresentGestureCommands());

    act(() => setActiveGesture({ gesture: 'THUMBS_UP', confidence: 1, method: 'HEURISTIC' }));
    expect(presentStore.get().isTimerRunning).toBe(true);

    act(() => setActiveGesture({ gesture: 'FIST', confidence: 1, method: 'HEURISTIC' }));
    expect(presentStore.get().isTimerRunning).toBe(false);
  });

  it('OPEN_PALM toggles the legend on the transition, not on every repeat', () => {
    renderHook(() => usePresentGestureCommands());

    act(() => setActiveGesture({ gesture: 'OPEN_PALM', confidence: 1, method: 'HEURISTIC' }));
    expect(presentStore.get().showLegend).toBe(true);

    // Held pose republished again (fresh object, same kind) — must not
    // toggle back off while still held.
    act(() => setActiveGesture({ gesture: 'OPEN_PALM', confidence: 0.95, method: 'HEURISTIC' }));
    expect(presentStore.get().showLegend).toBe(true);

    // Releasing (kind changes away) then re-entering OPEN_PALM toggles again.
    act(() => setActiveGesture(null));
    act(() => setActiveGesture({ gesture: 'OPEN_PALM', confidence: 1, method: 'HEURISTIC' }));
    expect(presentStore.get().showLegend).toBe(false);
  });

  it('slide navigation stays within the deck bounds', () => {
    presentStore.update({ slideIndex: SLIDES.length - 1 });
    renderHook(() => usePresentGestureCommands());

    act(() => setActiveGesture({ gesture: 'SWIPE_LEFT', confidence: 1, method: 'HEURISTIC' }));

    expect(presentStore.get().slideIndex).toBe(SLIDES.length - 1);
  });
});
