import { useEffect, useRef } from 'react';
import { visionEngine } from '@/vision/engine/VisionEngine';
import { mirrorLandmark } from '@/utils/coords';

/**
 * A ref (not React state — this updates every frame) holding the first
 * tracked hand's index fingertip, mirrored to display-space normalized
 * [0,1] coordinates. Used by calibration, which needs the *raw* mirrored
 * position — not the reach-box-mapped, One-Euro-filtered output
 * CursorEngine produces, since calibration is what *defines* the reach
 * box in the first place. Reusing CursorEngine's output here would feed
 * the old box's distortion into the new one.
 */
export function useLatestFingertipRef() {
  const ref = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return visionEngine.subscribe((frame) => {
      const hand = frame.hands[0];
      ref.current = hand ? { x: mirrorLandmark(hand.landmarks[8]!).x, y: mirrorLandmark(hand.landmarks[8]!).y } : null;
    });
  }, []);

  return ref;
}
