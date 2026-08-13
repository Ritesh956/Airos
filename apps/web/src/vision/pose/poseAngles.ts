import { jointAngle } from '@/gestures/geometry';
import type { Landmark, PoseObservation } from '@/vision/types';

/**
 * MediaPipe PoseLandmarker's fixed 33-point ordering (BlazePose topology).
 * Only the indices this file's angle computations actually use are named
 * here — the rest are drawn by PoseSkeletonOverlay.tsx via
 * `PoseLandmarker.POSE_CONNECTIONS` without needing individual names.
 */
const POSE_LANDMARK = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export interface PoseAngles {
  leftElbowDeg: number | null;
  rightElbowDeg: number | null;
  leftKneeDeg: number | null;
  rightKneeDeg: number | null;
}

export const NO_POSE_ANGLES: PoseAngles = {
  leftElbowDeg: null,
  rightElbowDeg: null,
  leftKneeDeg: null,
  rightKneeDeg: null,
};

function angleDeg(landmarks: Landmark[], a: number, b: number, c: number): number | null {
  const pa = landmarks[a];
  const pb = landmarks[b];
  const pc = landmarks[c];
  if (!pa || !pb || !pc) return null;
  return (jointAngle(pa, pb, pc) * 180) / Math.PI;
}

/**
 * Elbow and knee angles in degrees — DERIVED arithmetic on MODEL landmark
 * positions, the exact same angle-between-three-points math the gesture
 * engine already uses for finger curl (`jointAngle` in
 * gestures/geometry.ts), applied to the shoulder-elbow-wrist and
 * hip-knee-ankle triples instead of finger joints. Phase 10's gate is
 * literally "angles correct vs. manual check" — this is the computation
 * that check verifies. 180° means the joint is fully straight (all three
 * points collinear); smaller values mean more bend.
 */
export function computePoseAngles(pose: PoseObservation): PoseAngles {
  const { landmarks } = pose;
  return {
    leftElbowDeg: angleDeg(landmarks, POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.LEFT_ELBOW, POSE_LANDMARK.LEFT_WRIST),
    rightElbowDeg: angleDeg(
      landmarks,
      POSE_LANDMARK.RIGHT_SHOULDER,
      POSE_LANDMARK.RIGHT_ELBOW,
      POSE_LANDMARK.RIGHT_WRIST,
    ),
    leftKneeDeg: angleDeg(landmarks, POSE_LANDMARK.LEFT_HIP, POSE_LANDMARK.LEFT_KNEE, POSE_LANDMARK.LEFT_ANKLE),
    rightKneeDeg: angleDeg(landmarks, POSE_LANDMARK.RIGHT_HIP, POSE_LANDMARK.RIGHT_KNEE, POSE_LANDMARK.RIGHT_ANKLE),
  };
}
