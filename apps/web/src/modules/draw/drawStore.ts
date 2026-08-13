import { createStore } from '@/state/createStore';
import type { Handedness } from '@/vision/types';

export type DrawTool = 'draw' | 'erase' | 'idle';

/** A small, module-local palette rather than a full color picker — enough
 *  variety to demo, simple enough to render as swatches. */
export const DRAW_COLORS = ['#5eead4', '#f4f6fb', '#fbbf24', '#f87171', '#818cf8', '#34d399'] as const;

/** Human names for each swatch, keyed by hex — a screen reader announcing
 *  "Use colour number f 8 7 1 7 1" told a user nothing (CLAUDE.md UI/UX
 *  audit finding #17); the palette is a fixed six-entry array, so naming
 *  it is a one-time cost, not an ongoing one. */
export const DRAW_COLOR_NAMES: Record<string, string> = {
  '#5eead4': 'Teal',
  '#f4f6fb': 'White',
  '#fbbf24': 'Amber',
  '#f87171': 'Coral',
  '#818cf8': 'Indigo',
  '#34d399': 'Green',
};

export const MIN_BRUSH_SIZE = 2;
export const MAX_BRUSH_SIZE = 32;
const DEFAULT_BRUSH_SIZE = 6;

export interface DrawState {
  color: string;
  /** Device-independent px line width — see DrawCanvas.tsx for how this
   *  becomes an actual canvas lineWidth (scaled by devicePixelRatio). */
  brushSize: number;
  /** Cold-path summary of DrawEngine's current gesture, published
   *  throttled from DrawCanvas's per-frame loop — this module's analogue
   *  of interactionStore.cursor for Air Cursor. */
  tool: DrawTool;
  activeHand: Handedness | null;
  canUndo: boolean;
  canRedo: boolean;
  strokeCount: number;
}

export const drawStore = createStore<DrawState>({
  color: DRAW_COLORS[0],
  brushSize: DEFAULT_BRUSH_SIZE,
  tool: 'idle',
  activeHand: null,
  canUndo: false,
  canRedo: false,
  strokeCount: 0,
});

export function setDrawColor(color: string): void {
  drawStore.update({ color });
}

export function setDrawBrushSize(size: number): void {
  const clamped = Math.min(MAX_BRUSH_SIZE, Math.max(MIN_BRUSH_SIZE, size));
  drawStore.update({ brushSize: clamped });
}

/** Called by drawStrokes.ts after any mutation — the single place stroke
 *  counts and undo/redo availability become React-visible. */
export function setDrawCounts(patch: Pick<DrawState, 'canUndo' | 'canRedo' | 'strokeCount'>): void {
  drawStore.update(patch);
}

export function setDrawToolSummary(tool: DrawTool, hand: Handedness | null): void {
  drawStore.update({ tool, activeHand: hand });
}

export function resetDrawToolSummary(): void {
  drawStore.update({ tool: 'idle', activeHand: null });
}
