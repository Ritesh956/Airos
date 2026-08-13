import { describe, expect, it } from 'vitest';
import { computePoseAngles, NO_POSE_ANGLES } from './poseAngles';
import type { Landmark, PoseObservation } from '@/vision/types';

const ORIGIN: Landmark = { x: 0, y: 0, z: 0 };

/** Builds a 33-point landmark array (MediaPipe pose ordering) with every
 *  index defaulted to the origin except the ones explicitly overridden —
 *  only the handful of joints each test cares about need real positions. */
function buildLandmarks(overrides: Record<number, Landmark>): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ ...ORIGIN }));
  for (const [index, point] of Object.entries(overrides)) {
    landmarks[Number(index)] = point;
  }
  return landmarks;
}

function pose(overrides: Record<number, Landmark>): PoseObservation {
  return { landmarks: buildLandmarks(overrides), worldLandmarks: [] };
}

describe('computePoseAngles', () => {
  it('reads ~180 degrees for a fully straight arm (collinear shoulder-elbow-wrist)', () => {
    const angles = computePoseAngles(
      pose({
        11: { x: 0.5, y: 0.2, z: 0 }, // LEFT_SHOULDER
        13: { x: 0.5, y: 0.4, z: 0 }, // LEFT_ELBOW
        15: { x: 0.5, y: 0.6, z: 0 }, // LEFT_WRIST — directly below the elbow, same line as shoulder->elbow
      }),
    );
    expect(angles.leftElbowDeg).not.toBeNull();
    expect(angles.leftElbowDeg!).toBeCloseTo(180, 1);
  });

  it('reads ~90 degrees for a forearm folded perpendicular to the upper arm', () => {
    const angles = computePoseAngles(
      pose({
        12: { x: 0.5, y: 0.2, z: 0 }, // RIGHT_SHOULDER
        14: { x: 0.5, y: 0.4, z: 0 }, // RIGHT_ELBOW — straight down from shoulder
        16: { x: 0.3, y: 0.4, z: 0 }, // RIGHT_WRIST — straight sideways from elbow, 90 degrees off
      }),
    );
    expect(angles.rightElbowDeg).not.toBeNull();
    expect(angles.rightElbowDeg!).toBeCloseTo(90, 1);
  });

  it('reads ~90 degrees for a bent knee the same way', () => {
    const angles = computePoseAngles(
      pose({
        23: { x: 0.5, y: 0.5, z: 0 }, // LEFT_HIP
        25: { x: 0.5, y: 0.7, z: 0 }, // LEFT_KNEE
        27: { x: 0.3, y: 0.7, z: 0 }, // LEFT_ANKLE — perpendicular fold
      }),
    );
    expect(angles.leftKneeDeg).not.toBeNull();
    expect(angles.leftKneeDeg!).toBeCloseTo(90, 1);
  });

  it('is symmetric: left and right sides are computed independently', () => {
    const angles = computePoseAngles(
      pose({
        11: { x: 0.5, y: 0.2, z: 0 },
        13: { x: 0.5, y: 0.4, z: 0 },
        15: { x: 0.5, y: 0.6, z: 0 }, // left arm: straight, ~180
        12: { x: 0.5, y: 0.2, z: 0 },
        14: { x: 0.5, y: 0.4, z: 0 },
        16: { x: 0.3, y: 0.4, z: 0 }, // right arm: bent, ~90
      }),
    );
    expect(angles.leftElbowDeg!).toBeCloseTo(180, 1);
    expect(angles.rightElbowDeg!).toBeCloseTo(90, 1);
  });

  it('matches NO_POSE_ANGLES shape when nothing has been overridden but landmarks are all coincident', () => {
    // All-origin landmarks means shoulder/elbow/wrist coincide, which
    // jointAngle() defines as PI (180deg) rather than null — angles are
    // only null when a required index is missing from the array entirely.
    const angles = computePoseAngles(pose({}));
    expect(Object.keys(angles)).toEqual(Object.keys(NO_POSE_ANGLES));
  });

  it('returns null for a joint whose landmarks array is too short to contain it', () => {
    const shortPose: PoseObservation = { landmarks: [ORIGIN, ORIGIN], worldLandmarks: [] };
    const angles = computePoseAngles(shortPose);
    expect(angles).toEqual(NO_POSE_ANGLES);
  });
});
