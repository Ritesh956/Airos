/**
 * The click-vs-drag decision, isolated from DOM dispatch so it can be
 * unit-tested directly — same reasoning as gestures/temporal/swipe.ts:
 * timing/distance logic is worth testing on its own, without mocking
 * `document.elementFromPoint` and a real pointer-event pipeline just to
 * exercise "did this count as a click or a drag."
 *
 * CursorEngine owns turning these actions into real dispatched events and
 * tracking which DOM element is being dragged; this class only knows
 * about pinch state, time, and position.
 *
 * That position must be in the same *normalized* [0, 1] space the
 * One-Euro filter outputs, not viewport pixels. A fixed pixel threshold
 * would make the click/drag decision resolution-dependent: the same
 * physical hand jitter maps to more raw pixels on a larger or
 * higher-resolution screen, so a fixed-pixel threshold would make
 * accidental drags *more* likely (or clicks harder to land) purely from
 * screen size, nothing to do with what the user actually did. Distance
 * dispatch to the DOM still needs real pixels — CursorEngine converts
 * separately for that.
 */

export type PinchAction =
  | { type: 'start' }
  | { type: 'move' }
  | { type: 'commit-drag' }
  | { type: 'release-click' }
  | { type: 'release-drag' }
  | { type: 'idle' };

// A pinch released within this long, having not moved far, is a click —
// not a drag that just happened to not go anywhere.
export const CLICK_MAX_DURATION_MS = 400;
// A pinch that moves more than this fraction of the calibrated reach
// box's span commits to a drag immediately, regardless of how long it's
// been held. ~3.5% of the reach box — small enough to catch an
// intentional drag, loose enough to tolerate natural hand jitter and the
// cursor filter settling after a pose transition.
export const CLICK_MAX_MOVEMENT_NORMALIZED = 0.035;

export class PinchDragTracker {
  private startTime: number | null = null;
  private startPos: { x: number; y: number } | null = null;
  private dragging = false;

  get isDragging(): boolean {
    return this.dragging;
  }

  update(isPinching: boolean, timestampMs: number, pos: { x: number; y: number }): PinchAction {
    const wasActive = this.startTime !== null;

    if (isPinching && !wasActive) {
      this.startTime = timestampMs;
      this.startPos = pos;
      this.dragging = false;
      return { type: 'start' };
    }

    if (isPinching && wasActive) {
      const start = this.startPos ?? pos;
      const movedDistance = Math.hypot(pos.x - start.x, pos.y - start.y);
      const heldLong = timestampMs - (this.startTime ?? timestampMs) > CLICK_MAX_DURATION_MS;

      if (!this.dragging && (movedDistance > CLICK_MAX_MOVEMENT_NORMALIZED || heldLong)) {
        this.dragging = true;
        return { type: 'commit-drag' };
      }
      return { type: 'move' };
    }

    if (!isPinching && wasActive) {
      const wasDragging = this.dragging;
      this.reset();
      return wasDragging ? { type: 'release-drag' } : { type: 'release-click' };
    }

    return { type: 'idle' };
  }

  reset(): void {
    this.startTime = null;
    this.startPos = null;
    this.dragging = false;
  }
}
