import { beforeEach, describe, expect, it } from 'vitest';
import {
  ERASE_RADIUS,
  appendPoint,
  beginStroke,
  canRedo,
  canUndo,
  clear,
  commitStroke,
  discardCurrentStroke,
  eraseNear,
  getCurrentStroke,
  getStrokes,
  redo,
  resetDrawStrokes,
  undo,
} from './drawStrokes';

beforeEach(() => {
  resetDrawStrokes();
});

describe('beginStroke / appendPoint / commitStroke', () => {
  it('has no current stroke until beginStroke is called', () => {
    expect(getCurrentStroke()).toBeNull();
  });

  it('seeds the first point immediately, before any appendPoint call', () => {
    beginStroke(0.1, 0.2, '#fff', 4);
    expect(getCurrentStroke()?.points).toEqual([{ x: 0.1, y: 0.2 }]);
  });

  it('appends points to the in-progress stroke', () => {
    beginStroke(0, 0, '#fff', 4);
    appendPoint(0.5, 0.5);
    expect(getCurrentStroke()?.points).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it('drops points that are too close to the last recorded point', () => {
    beginStroke(0, 0, '#fff', 4);
    appendPoint(0.0001, 0.0001); // well under MIN_APPEND_DISTANCE
    expect(getCurrentStroke()?.points).toHaveLength(1);
  });

  it('appendPoint is a no-op with no in-progress stroke', () => {
    appendPoint(0.5, 0.5);
    expect(getCurrentStroke()).toBeNull();
  });

  it('commitStroke moves the in-progress stroke into strokes and clears it', () => {
    beginStroke(0, 0, '#fff', 4);
    appendPoint(1, 1);
    commitStroke();
    expect(getCurrentStroke()).toBeNull();
    expect(getStrokes()).toHaveLength(1);
    expect(getStrokes()[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('a stroke that never moves still commits as a one-point dot', () => {
    beginStroke(0.3, 0.3, '#fff', 4);
    commitStroke();
    expect(getStrokes()).toHaveLength(1);
    expect(getStrokes()[0]?.points).toEqual([{ x: 0.3, y: 0.3 }]);
  });

  it('commitStroke with nothing in progress is a no-op', () => {
    commitStroke();
    expect(getStrokes()).toHaveLength(0);
  });

  it('discardCurrentStroke drops the stroke without committing it', () => {
    beginStroke(0, 0, '#fff', 4);
    discardCurrentStroke();
    expect(getCurrentStroke()).toBeNull();
    expect(getStrokes()).toHaveLength(0);
  });
});

describe('undo / redo', () => {
  it('canUndo/canRedo reflect empty state', () => {
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it('undo moves the most recent stroke to redo', () => {
    beginStroke(0, 0, '#a', 4);
    commitStroke();
    beginStroke(1, 1, '#b', 4);
    commitStroke();

    undo();
    expect(getStrokes()).toHaveLength(1);
    expect(getStrokes()[0]?.color).toBe('#a');
    expect(canRedo()).toBe(true);
  });

  it('redo restores the most recently undone stroke', () => {
    beginStroke(0, 0, '#a', 4);
    commitStroke();
    undo();
    expect(getStrokes()).toHaveLength(0);

    redo();
    expect(getStrokes()).toHaveLength(1);
    expect(getStrokes()[0]?.color).toBe('#a');
    expect(canRedo()).toBe(false);
  });

  it('a new committed stroke clears the redo stack', () => {
    beginStroke(0, 0, '#a', 4);
    commitStroke();
    undo();
    expect(canRedo()).toBe(true);

    beginStroke(1, 1, '#b', 4);
    commitStroke();
    expect(canRedo()).toBe(false);
  });

  it('undo on an empty canvas is a safe no-op', () => {
    undo();
    expect(getStrokes()).toHaveLength(0);
  });
});

describe('clear', () => {
  it('empties the canvas and drops any in-progress stroke', () => {
    beginStroke(0, 0, '#a', 4);
    commitStroke();
    beginStroke(0.5, 0.5, '#b', 4); // in progress, never committed

    clear();
    expect(getStrokes()).toHaveLength(0);
    expect(getCurrentStroke()).toBeNull();
  });

  it('is fully undoable via repeated redo, most-recent-first', () => {
    beginStroke(0, 0, '#a', 4);
    commitStroke();
    beginStroke(1, 1, '#b', 4);
    commitStroke();

    clear();
    expect(getStrokes()).toHaveLength(0);
    expect(canRedo()).toBe(true);

    redo();
    expect(getStrokes()).toHaveLength(1);
    expect(getStrokes()[0]?.color).toBe('#b');

    redo();
    expect(getStrokes()).toHaveLength(2);
    expect(getStrokes()[1]?.color).toBe('#a');
  });

  it('discards stale redo history rather than merging with it', () => {
    beginStroke(0, 0, '#a', 4);
    commitStroke();
    undo(); // '#a' now sits on the (stale) redo stack

    beginStroke(1, 1, '#b', 4);
    commitStroke();
    clear();

    // Only '#b' (what was actually on the canvas at clear-time) should be
    // recoverable — the older, already-diverged '#a' redo entry is gone.
    redo();
    expect(getStrokes()).toHaveLength(1);
    expect(getStrokes()[0]?.color).toBe('#b');
    expect(canRedo()).toBe(false);
  });
});

describe('eraseNear', () => {
  it('removes a whole stroke with any point inside the radius', () => {
    beginStroke(0.5, 0.5, '#a', 4);
    commitStroke();

    const erased = eraseNear(0.51, 0.5, ERASE_RADIUS);
    expect(erased).toBe(true);
    expect(getStrokes()).toHaveLength(0);
  });

  it('leaves strokes entirely outside the radius untouched', () => {
    beginStroke(0.1, 0.1, '#a', 4);
    commitStroke();

    const erased = eraseNear(0.9, 0.9, ERASE_RADIUS);
    expect(erased).toBe(false);
    expect(getStrokes()).toHaveLength(1);
  });

  it('erasing a multi-point stroke via any single point removes the whole stroke', () => {
    beginStroke(0, 0, '#a', 4);
    appendPoint(0.5, 0.5);
    appendPoint(1, 1);
    commitStroke();

    eraseNear(0, 0, ERASE_RADIUS); // only the first point is near
    expect(getStrokes()).toHaveLength(0);
  });

  it('erasing clears the redo stack', () => {
    beginStroke(0, 0, '#a', 4);
    commitStroke();
    beginStroke(0.9, 0.9, '#b', 4);
    commitStroke();
    undo();
    expect(canRedo()).toBe(true);

    eraseNear(0, 0, ERASE_RADIUS);
    expect(canRedo()).toBe(false);
  });
});
