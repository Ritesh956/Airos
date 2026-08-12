import type { Landmark } from '@/vision/types';

/**
 * Pure geometry helpers shared by the static-pose and swipe classifiers.
 * No MediaPipe-specific knowledge beyond landmark indices belongs here —
 * this file is just vector math.
 */

export function distance2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The angle at vertex `b`, between rays b->a and b->c, in radians [0, PI].
 * PI (180°) means a-b-c are collinear — a straight line through b. Used to
 * measure finger curl: MCP-PIP-TIP collinear means the finger is
 * straight; a small angle means it's sharply bent.
 */
export function jointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return Math.PI;
  const cos = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

/**
 * Wrist-to-middle-MCP distance, used to normalize every other distance
 * threshold in the gesture engine. Without this, "pinch" or "thumb
 * splayed" thresholds would only work at one specific distance from the
 * camera — normalizing by the hand's own visible size is what makes
 * recognition work the same up close or far away.
 */
export function handScale(landmarks: Landmark[]): number {
  return Math.max(distance2D(landmarks[0]!, landmarks[9]!), 1e-6);
}

/**
 * Average of the wrist and the four MCP knuckles. Used as the tracked
 * point for swipe motion instead of a single fingertip or the wrist alone
 * — it moves with the whole hand's position without being thrown off by
 * individual fingers curling or extending mid-swipe.
 */
export function palmCentroid(landmarks: Landmark[]): { x: number; y: number } {
  const indices = [0, 5, 9, 13, 17] as const;
  let x = 0;
  let y = 0;
  for (const i of indices) {
    x += landmarks[i]!.x;
    y += landmarks[i]!.y;
  }
  return { x: x / indices.length, y: y / indices.length };
}
