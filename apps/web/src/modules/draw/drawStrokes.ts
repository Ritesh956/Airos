import { setDrawCounts } from './drawStore';

/**
 * Air Draw's stroke data — a module-level singleton, not React state or a
 * `createStore`, for the same reason `studioTransforms.ts` isn't: it's
 * hot-path data (points are appended every frame while a pinch is held)
 * that a rAF loop (`DrawCanvas.tsx`) reads and paints directly. Nothing
 * here gains from `useSyncExternalStore` — see ARCHITECTURE.md's hot-path/
 * cold-path split.
 *
 * `drawStore.ts` holds the React-visible *summary* (canUndo/canRedo/
 * strokeCount) this module keeps in sync after every mutation, the same
 * relationship `interactionStore.cursor` has to `CursorEngine`'s hot state.
 */

export interface StrokePoint {
  /** Normalized [0,1] canvas-space — see DrawEngine's DrawPointerState doc. */
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  color: string;
  /** Device-independent px line width. */
  size: number;
  points: StrokePoint[];
}

/** Normalized distance a fingertip must move before a new point is
 *  recorded — the One-Euro filter already smooths jitter, but a nearly
 *  still hand at 30-60fps would still append many near-duplicate points
 *  without this, bloating stroke arrays (and PNG/gallery export size) for
 *  no visible benefit. */
const MIN_APPEND_DISTANCE = 0.0015;

/** Normalized distance a stroke point must fall within of the eraser
 *  position to erase the whole stroke. Whole-stroke erasing, not a pixel
 *  eraser: simple, predictable, and matches what a hand-tracked "make a
 *  fist" gesture can actually target with any precision. */
export const ERASE_RADIUS = 0.045;

let strokes: Stroke[] = [];
let redoStack: Stroke[] = [];
let currentStroke: Stroke | null = null;
let nextId = 0;

function makeId(): string {
  nextId += 1;
  return `stroke-${nextId}`;
}

function syncCounts(): void {
  setDrawCounts({ canUndo: strokes.length > 0, canRedo: redoStack.length > 0, strokeCount: strokes.length });
}

/** Starts a new in-progress stroke, seeded with its first point — even a
 *  pinch that never moves before releasing still yields a one-point stroke
 *  (rendered as a dot by DrawCanvas), not nothing. */
export function beginStroke(x: number, y: number, color: string, size: number): void {
  currentStroke = { id: makeId(), color, size, points: [{ x, y }] };
}

export function appendPoint(x: number, y: number): void {
  if (!currentStroke) return;
  const last = currentStroke.points[currentStroke.points.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) < MIN_APPEND_DISTANCE) return;
  currentStroke.points.push({ x, y });
}

/** Commits the in-progress stroke (if any) and clears the redo stack — the
 *  standard "a new action invalidates redo" rule. A no-op if nothing was
 *  in progress (e.g. a gesture transition fired with no prior beginStroke). */
export function commitStroke(): void {
  if (!currentStroke) return;
  strokes.push(currentStroke);
  currentStroke = null;
  redoStack = [];
  syncCounts();
}

/** Drops the in-progress stroke without committing it — used when a stroke
 *  should never have started (not currently called, kept for symmetry with
 *  commitStroke and future use, e.g. an explicit "cancel" gesture). */
export function discardCurrentStroke(): void {
  currentStroke = null;
}

export function getCurrentStroke(): Stroke | null {
  return currentStroke;
}

export function getStrokes(): readonly Stroke[] {
  return strokes;
}

export function undo(): void {
  const last = strokes.pop();
  if (last) redoStack.push(last);
  syncCounts();
}

export function redo(): void {
  const last = redoStack.pop();
  if (last) strokes.push(last);
  syncCounts();
}

/** Clears the canvas — but treats it as "undo every stroke at once" rather
 *  than a destructive dead end: every current stroke moves onto the redo
 *  stack (in original order, so repeated `redo()` brings them back
 *  most-recent-first, same feel as undoing one at a time), discarding
 *  whatever redo history existed before since we've diverged from it. A
 *  keyboard-bound "Clear" shortcut is safe to trigger accidentally this way. */
export function clear(): void {
  redoStack = [...strokes];
  strokes = [];
  currentStroke = null;
  syncCounts();
}

/** Removes every stroke with at least one point within `radius` (normalized
 *  distance) of (x, y). Returns whether anything was erased, so callers can
 *  skip redundant work. Erasing invalidates redo, like any destructive edit. */
export function eraseNear(x: number, y: number, radius: number): boolean {
  const before = strokes.length;
  strokes = strokes.filter((stroke) => !stroke.points.some((p) => Math.hypot(p.x - x, p.y - y) <= radius));
  const erased = strokes.length !== before;
  if (erased) {
    redoStack = [];
    syncCounts();
  }
  return erased;
}

export function canUndo(): boolean {
  return strokes.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

/** A full reset — strokes, redo history, and any in-progress stroke all
 *  gone, no way back via redo(). Unlike `clear()`, this is not a user-facing
 *  action (it's not reachable from any button or gesture); it exists for
 *  test isolation, mirroring `studioTransforms.ts`'s `initStudioTransforms`. */
export function resetDrawStrokes(): void {
  strokes = [];
  redoStack = [];
  currentStroke = null;
  syncCounts();
}
