import type { Handedness, Landmark } from '@/vision/types';

/**
 * The one place mirroring happens. MediaPipe's landmarks and handedness
 * are computed on the raw, unmirrored camera frame — nothing in vision/ or
 * gestures/ may flip them. But a front-facing camera shows the user a
 * mirror image of themselves, and "my hand moves right, the cursor moves
 * right" only feels correct if the on-screen representation is mirrored
 * too. So every consumer that draws or maps landmarks to screen space goes
 * through these functions instead of flipping coordinates inline.
 */

/** Mirrors a normalized x coordinate across the vertical center line. */
export function mirrorX(x: number): number {
  return 1 - x;
}

/** Mirrors a landmark's x coordinate; y and z are untouched (mirroring is
 *  a left-right flip, not a full reflection). */
export function mirrorLandmark(landmark: Landmark): Landmark {
  return { ...landmark, x: mirrorX(landmark.x) };
}

/** See the handedness field doc in vision/types.ts: MediaPipe's label is
 *  relative to the unmirrored image, i.e. backwards from the user's own
 *  sense of "my left hand". Flip it once, here, for anything that needs
 *  to talk about the user's actual dominant hand. */
export function mirrorHandedness(handedness: Handedness): Handedness {
  return handedness === 'Left' ? 'Right' : 'Left';
}

/**
 * Maps a normalized landmark (already mirrored if the caller wants a
 * mirrored view) to pixel coordinates within a box of the given size.
 * Cursor mapping (Phase 4) adds a calibrated reach-box on top of this; this
 * is the plain linear version used for overlays and previews.
 */
export function landmarkToPixels(
  landmark: Pick<Landmark, 'x' | 'y'>,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: landmark.x * width, y: landmark.y * height };
}
