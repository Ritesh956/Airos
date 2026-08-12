/**
 * Dispatches real DOM PointerEvent/MouseEvent sequences so the Air Cursor
 * can actually click, drag, and interact with whatever's on screen — not
 * just render a dot that follows the hand. A browser page can't move the
 * OS-level mouse cursor or control other applications (nor should it);
 * "Air Cursor" is a virtual pointer *within this page*, and this is the
 * one place that bridges gesture state to real DOM interaction. Because
 * these are genuine native events dispatched with `bubbles: true` on the
 * actual element under the cursor, React's root-delegated event listeners
 * pick them up exactly like a real click — no per-component wiring
 * needed anywhere else in the app.
 */

// Negative so it can't collide with a real hardware pointerId (the spec
// guarantees those are non-negative) — lets any code that cares
// distinguish gesture-driven input from a real mouse/touch if it ever
// needs to.
const AIR_CURSOR_POINTER_ID = -42;

function dispatchPointerEvent(target: Element, type: string, x: number, y: number, pressed: boolean): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      pointerId: AIR_CURSOR_POINTER_ID,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: pressed ? 1 : 0,
    }),
  );
}

function dispatchMouseEvent(target: Element, type: string, x: number, y: number, pressed: boolean): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: pressed ? 1 : 0,
    }),
  );
}

export function elementAtPoint(x: number, y: number): Element | null {
  return document.elementFromPoint(x, y);
}

/** A tap: down and up at (nearly) the same point, ending in a `click`.
 *  Returns the element that was clicked, or null if nothing's there. */
export function dispatchSyntheticClick(x: number, y: number): Element | null {
  const target = elementAtPoint(x, y);
  if (!target) return null;
  dispatchPointerEvent(target, 'pointerdown', x, y, true);
  dispatchMouseEvent(target, 'mousedown', x, y, true);
  dispatchPointerEvent(target, 'pointerup', x, y, false);
  dispatchMouseEvent(target, 'mouseup', x, y, false);
  dispatchMouseEvent(target, 'click', x, y, false);
  return target;
}

/** Starts a drag: down at (x, y). Returns the element to keep sending
 *  move/up events to for the rest of the gesture — captured once here
 *  rather than re-querying elementFromPoint every frame, which is what
 *  makes a drag behave like one continuous interaction instead of
 *  wandering onto whatever the cursor happens to pass over. */
export function dispatchSyntheticPointerDown(x: number, y: number): Element | null {
  const target = elementAtPoint(x, y);
  if (!target) return null;
  dispatchPointerEvent(target, 'pointerdown', x, y, true);
  dispatchMouseEvent(target, 'mousedown', x, y, true);
  return target;
}

export function dispatchSyntheticPointerMove(target: Element, x: number, y: number): void {
  dispatchPointerEvent(target, 'pointermove', x, y, true);
  dispatchMouseEvent(target, 'mousemove', x, y, true);
}

/** Ends a drag. `fireClick` should be false for anything that actually
 *  moved — a trailing `click` after a real drag is what makes, e.g., a
 *  dragged slider also register a stray click at the drop point. */
export function dispatchSyntheticPointerUp(target: Element, x: number, y: number, fireClick: boolean): void {
  dispatchPointerEvent(target, 'pointerup', x, y, false);
  dispatchMouseEvent(target, 'mouseup', x, y, false);
  if (fireClick) dispatchMouseEvent(target, 'click', x, y, false);
}
