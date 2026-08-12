import { DEFAULT_REACH_BOX, appStore, updateSettings, type ReachBox } from '@/state/appStore';

/** Minimum reach-box span (normalized units) in either axis — guards
 *  against a degenerate box from a calibration gone wrong (e.g. both
 *  corners confirmed at nearly the same point) turning into a divide that
 *  amplifies tiny hand movements into wild cursor jumps. */
const MIN_SPAN = 0.1;

export function getReachBox(): ReachBox {
  return appStore.get().settings.cursorReachBox;
}

export function setReachBox(box: ReachBox): void {
  updateSettings({ cursorReachBox: sanitizeReachBox(box) });
}

export function resetReachBox(): void {
  updateSettings({ cursorReachBox: DEFAULT_REACH_BOX });
}

/** Builds a valid, min-sized box from two opposite corners in either
 *  order — the calibration flow just needs "top-left-ish" and
 *  "bottom-right-ish" points, not a specific click order. */
export function sanitizeReachBox(box: ReachBox): ReachBox {
  let minX = Math.min(box.minX, box.maxX);
  let maxX = Math.max(box.minX, box.maxX);
  let minY = Math.min(box.minY, box.maxY);
  let maxY = Math.max(box.minY, box.maxY);

  if (maxX - minX < MIN_SPAN) {
    const center = (minX + maxX) / 2;
    minX = center - MIN_SPAN / 2;
    maxX = center + MIN_SPAN / 2;
  }
  if (maxY - minY < MIN_SPAN) {
    const center = (minY + maxY) / 2;
    minY = center - MIN_SPAN / 2;
    maxY = center + MIN_SPAN / 2;
  }

  return {
    minX: clamp01(minX),
    maxX: clamp01(maxX),
    minY: clamp01(minY),
    maxY: clamp01(maxY),
  };
}

/**
 * Maps a mirrored-normalized point (see utils/coords.ts — this expects
 * mirroring already applied, so "top-left of the box" matches what the
 * user actually sees on screen) through the reach box into [0,1]
 * screen-normalized space, clamped to stay on-screen once the hand moves
 * past the calibrated edges rather than letting the cursor run off the
 * viewport.
 */
export function mapThroughReachBox(point: { x: number; y: number }, box: ReachBox): { x: number; y: number } {
  const width = Math.max(1e-6, box.maxX - box.minX);
  const height = Math.max(1e-6, box.maxY - box.minY);
  return {
    x: clamp01((point.x - box.minX) / width),
    y: clamp01((point.y - box.minY) / height),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
