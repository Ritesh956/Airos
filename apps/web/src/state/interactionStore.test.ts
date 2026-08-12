import { describe, expect, it } from 'vitest';
import {
  appendGestureHistory,
  clearGestureHistory,
  interactionStore,
  resetInteractionStore,
  type GestureHistoryEntry,
} from './interactionStore';

function makeEntry(overrides: Partial<GestureHistoryEntry> = {}): GestureHistoryEntry {
  return {
    gesture: 'PINCH',
    confidence: 0.9,
    method: 'HEURISTIC',
    hand: 'Left',
    timestamp: performance.now(),
    ...overrides,
  };
}

describe('interactionStore gesture history', () => {
  it('appends newest-first', () => {
    resetInteractionStore();
    appendGestureHistory(makeEntry({ gesture: 'FIST', timestamp: 1 }));
    appendGestureHistory(makeEntry({ gesture: 'OPEN_PALM', timestamp: 2 }));

    const history = interactionStore.get().gestureHistory;
    expect(history[0]?.gesture).toBe('OPEN_PALM');
    expect(history[1]?.gesture).toBe('FIST');
  });

  it('caps the ring buffer instead of growing unbounded', () => {
    resetInteractionStore();
    for (let i = 0; i < 60; i++) {
      appendGestureHistory(makeEntry({ timestamp: i }));
    }

    const history = interactionStore.get().gestureHistory;
    expect(history.length).toBe(50);
    // Newest-first: the most recently appended entry (timestamp 59) is
    // still present, the oldest ones (0-9) were evicted.
    expect(history[0]?.timestamp).toBe(59);
    expect(history.some((e) => e.timestamp === 0)).toBe(false);
  });

  it('clearGestureHistory empties it without touching other fields', () => {
    resetInteractionStore();
    appendGestureHistory(makeEntry());
    interactionStore.update({ trackingState: 'tracking' });

    clearGestureHistory();

    expect(interactionStore.get().gestureHistory).toEqual([]);
    expect(interactionStore.get().trackingState).toBe('tracking');
  });

  it('resetInteractionStore clears gesture history along with everything else', () => {
    appendGestureHistory(makeEntry());
    resetInteractionStore();
    expect(interactionStore.get().gestureHistory).toEqual([]);
  });
});
