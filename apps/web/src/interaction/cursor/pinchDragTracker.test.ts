import { describe, expect, it } from 'vitest';
import { CLICK_MAX_DURATION_MS, CLICK_MAX_MOVEMENT_NORMALIZED, PinchDragTracker } from './pinchDragTracker';

const P = (x: number, y: number) => ({ x, y });
const BEYOND_THRESHOLD = CLICK_MAX_MOVEMENT_NORMALIZED + 0.02;
const WITHIN_THRESHOLD = CLICK_MAX_MOVEMENT_NORMALIZED * 0.3;

describe('PinchDragTracker', () => {
  it('reports idle when never pinching', () => {
    const tracker = new PinchDragTracker();
    expect(tracker.update(false, 0, P(0, 0)).type).toBe('idle');
    expect(tracker.update(false, 33, P(0, 0)).type).toBe('idle');
  });

  it('reports start on the first pinching frame, then move while held', () => {
    const tracker = new PinchDragTracker();
    expect(tracker.update(true, 0, P(0.5, 0.5)).type).toBe('start');
    expect(tracker.update(true, 33, P(0.5 + WITHIN_THRESHOLD, 0.5)).type).toBe('move');
    expect(tracker.isDragging).toBe(false);
  });

  it('a quick pinch released with little movement is a click', () => {
    const tracker = new PinchDragTracker();
    tracker.update(true, 0, P(0.5, 0.5));
    tracker.update(true, 100, P(0.5 + WITHIN_THRESHOLD, 0.5 + WITHIN_THRESHOLD)); // small jitter, under the threshold
    const release = tracker.update(false, 200, P(0.5 + WITHIN_THRESHOLD, 0.5 + WITHIN_THRESHOLD));
    expect(release.type).toBe('release-click');
    expect(tracker.isDragging).toBe(false);
  });

  it('moving past the normalized distance threshold while pinching commits to a drag immediately', () => {
    const tracker = new PinchDragTracker();
    tracker.update(true, 0, P(0, 0));
    const moved = tracker.update(true, 33, P(BEYOND_THRESHOLD, 0));
    expect(moved.type).toBe('commit-drag');
    expect(tracker.isDragging).toBe(true);

    // Committing doesn't fire again on subsequent frames.
    const stillMoving = tracker.update(true, 66, P(BEYOND_THRESHOLD + 0.05, 0));
    expect(stillMoving.type).toBe('move');
  });

  it('a released drag reports release-drag, not release-click', () => {
    const tracker = new PinchDragTracker();
    tracker.update(true, 0, P(0, 0));
    tracker.update(true, 33, P(BEYOND_THRESHOLD, 0)); // commits to drag
    const release = tracker.update(false, 66, P(BEYOND_THRESHOLD, 0));
    expect(release.type).toBe('release-drag');
  });

  it('holding a pinch in place past the duration threshold commits to a drag, even without movement', () => {
    const tracker = new PinchDragTracker();
    tracker.update(true, 0, P(0.5, 0.5));
    const held = tracker.update(true, CLICK_MAX_DURATION_MS + 50, P(0.5, 0.5));
    expect(held.type).toBe('commit-drag');
  });

  it('releasing before the duration threshold with no movement is a click', () => {
    const tracker = new PinchDragTracker();
    tracker.update(true, 0, P(0.5, 0.5));
    const release = tracker.update(false, CLICK_MAX_DURATION_MS - 50, P(0.5, 0.5));
    expect(release.type).toBe('release-click');
  });

  it('reset() clears an in-progress pinch so the next start is treated fresh', () => {
    const tracker = new PinchDragTracker();
    tracker.update(true, 0, P(0, 0));
    tracker.update(true, 33, P(BEYOND_THRESHOLD, 0));
    expect(tracker.isDragging).toBe(true);

    tracker.reset();
    expect(tracker.isDragging).toBe(false);
    expect(tracker.update(true, 66, P(0, 0)).type).toBe('start');
  });

  it('supports a second independent click after the first completes', () => {
    const tracker = new PinchDragTracker();
    tracker.update(true, 0, P(0, 0));
    expect(tracker.update(false, 50, P(0, 0)).type).toBe('release-click');

    expect(tracker.update(true, 100, P(0, 0)).type).toBe('start');
    expect(tracker.update(false, 150, P(0, 0)).type).toBe('release-click');
  });
});
