import type { GestureKind } from '@/gestures/types';

/** "OPEN_PALM" -> "Open Palm". Display-only formatting — the underscored
 *  form stays canonical everywhere else (types, tests, the command
 *  registry). */
export function formatGestureLabel(gesture: GestureKind): string {
  return gesture
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Converts a `performance.now()`-relative timestamp (what every
 *  VisionFrame/GestureResult carries) to a wall-clock `HH:MM:SS.mmm`
 *  string for the Gesture Lab timeline — `performance.now()` alone is
 *  relative to navigation start, not useful to a human reading a log. */
export function formatClockTime(perfTimestamp: number): string {
  const date = new Date(performance.timeOrigin + perfTimestamp);
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
