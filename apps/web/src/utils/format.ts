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

/** Converts a duration in milliseconds to `M:SS` (or `H:MM:SS` past an
 *  hour) for the Presentation timer — a duration, not a point in time, so
 *  formatClockTime's wall-clock framing doesn't apply here. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
