import type { Landmark, PoseObservation } from '@/vision/types';

/**
 * A synthetic standing figure for Demo Mode — same spirit as `fixtures.ts`'s
 * hand generator and `faceMesh.ts`'s face generator: geometrically
 * self-consistent, not a recording, built to exercise the same code paths
 * (a skeleton overlay reading real `PoseLandmarker.POSE_CONNECTIONS`
 * topology, and Phase 10's joint-angle computation) rather than to look
 * indistinguishable from a real detection.
 *
 * Unlike `faceMesh.ts`, this file hand-places all 33 points directly rather
 * than reusing `walkConnectionsIntoLoops` — MediaPipe's pose landmarks are a
 * small, fixed, well-documented BlazePose topology (33 named body-part
 * indices), not ~150 densely-packed face-contour indices, so "which index
 * is the left elbow" is a known constant rather than something worth
 * deriving from the connection graph. See CLAUDE.md's Phase 10 note: this
 * was judged fresh rather than reusing the face fixture's machinery on
 * reflex.
 *
 * The right elbow is the one animated joint, sweeping smoothly between a
 * fully straight arm (180°) and a forearm folded perpendicular to the
 * upper arm (90°) — a small, deliberately verifiable motion. Phase 10's
 * gate is "angles correct vs. manual check," and this fixture's two
 * extremes are exactly the two values a manual check (a protractor against
 * the rendered skeleton, or `poseAngles.test.ts`'s calibration test) can
 * confirm directly, rather than an arbitrary naturalistic gesture that's
 * hard to verify by eye.
 */

// MediaPipe PoseLandmarker's fixed 33-point ordering (BlazePose topology).
const NOSE = 0;
const LEFT_EYE_INNER = 1;
const LEFT_EYE = 2;
const LEFT_EYE_OUTER = 3;
const RIGHT_EYE_INNER = 4;
const RIGHT_EYE = 5;
const RIGHT_EYE_OUTER = 6;
const LEFT_EAR = 7;
const RIGHT_EAR = 8;
const MOUTH_LEFT = 9;
const MOUTH_RIGHT = 10;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_PINKY = 17;
const RIGHT_PINKY = 18;
const LEFT_INDEX = 19;
const RIGHT_INDEX = 20;
const LEFT_THUMB = 21;
const RIGHT_THUMB = 22;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;
const LEFT_HEEL = 29;
const RIGHT_HEEL = 30;
const LEFT_FOOT_INDEX = 31;
const RIGHT_FOOT_INDEX = 32;

const POINT_COUNT = 33;

function point(x: number, y: number): Landmark {
  return { x, y, z: 0 };
}

function polar(origin: Landmark, angle: number, length: number): Landmark {
  return point(origin.x + Math.cos(angle) * length, origin.y + Math.sin(angle) * length);
}

// The static half of the figure — head, torso, left arm at rest, both legs.
// Angle convention: 0 = along +x, increasing clockwise since y grows
// downward (image space), same convention `fixtures.ts`'s finger chains use.
const LEFT_SHOULDER_POS = point(0.42, 0.24);
const RIGHT_SHOULDER_POS = point(0.58, 0.24);
const LEFT_HIP_POS = point(0.44, 0.52);
const RIGHT_HIP_POS = point(0.56, 0.52);

const LEFT_ARM_ANGLE = Math.PI / 2 + 0.2; // hanging down, slightly outward (away from body)
const UPPER_ARM_LENGTH = 0.16;
const FOREARM_LENGTH = 0.14;
const HAND_LENGTH = 0.035;

const RIGHT_UPPER_ARM_ANGLE = Math.PI / 2 - 0.2; // mirror of the left, outward to the right

/** Right-elbow curl period — a full straight->folded->straight cycle. */
const CURL_PERIOD_MS = 3000;

/** 0 at the cycle's start (arm straight), 1 at the cycle's midpoint (arm
 *  folded to 90°), smoothly back to 0 — see the module doc comment for why
 *  these are the two values worth animating between. */
function elbowCurl(timeMs: number): number {
  return (1 - Math.cos((2 * Math.PI * timeMs) / CURL_PERIOD_MS)) / 2;
}

function buildStaticPoints(): Map<number, Landmark> {
  const points = new Map<number, Landmark>();

  points.set(NOSE, point(0.5, 0.1));
  points.set(LEFT_EYE_INNER, point(0.485, 0.095));
  points.set(LEFT_EYE, point(0.478, 0.095));
  points.set(LEFT_EYE_OUTER, point(0.47, 0.096));
  points.set(RIGHT_EYE_INNER, point(0.515, 0.095));
  points.set(RIGHT_EYE, point(0.522, 0.095));
  points.set(RIGHT_EYE_OUTER, point(0.53, 0.096));
  points.set(LEFT_EAR, point(0.455, 0.1));
  points.set(RIGHT_EAR, point(0.545, 0.1));
  points.set(MOUTH_LEFT, point(0.49, 0.125));
  points.set(MOUTH_RIGHT, point(0.51, 0.125));

  points.set(LEFT_SHOULDER, LEFT_SHOULDER_POS);
  points.set(RIGHT_SHOULDER, RIGHT_SHOULDER_POS);

  const leftElbow = polar(LEFT_SHOULDER_POS, LEFT_ARM_ANGLE, UPPER_ARM_LENGTH);
  const leftWrist = polar(leftElbow, LEFT_ARM_ANGLE, FOREARM_LENGTH);
  const leftHand = polar(leftWrist, LEFT_ARM_ANGLE, HAND_LENGTH);
  points.set(LEFT_ELBOW, leftElbow);
  points.set(LEFT_WRIST, leftWrist);
  points.set(LEFT_PINKY, leftHand);
  points.set(LEFT_INDEX, point(leftHand.x - 0.006, leftHand.y));
  points.set(LEFT_THUMB, point(leftHand.x + 0.006, leftHand.y - 0.01));

  points.set(LEFT_HIP, LEFT_HIP_POS);
  points.set(RIGHT_HIP, RIGHT_HIP_POS);

  const kneeAngle = Math.PI / 2 + 0.05;
  const leftKnee = polar(LEFT_HIP_POS, kneeAngle, 0.22);
  const leftAnkle = polar(leftKnee, Math.PI / 2, 0.2);
  points.set(LEFT_KNEE, leftKnee);
  points.set(LEFT_ANKLE, leftAnkle);
  points.set(LEFT_HEEL, point(leftAnkle.x - 0.005, leftAnkle.y + 0.025));
  points.set(LEFT_FOOT_INDEX, point(leftAnkle.x + 0.02, leftAnkle.y + 0.015));

  const rightKneeAngle = Math.PI / 2 - 0.05;
  const rightKnee = polar(RIGHT_HIP_POS, rightKneeAngle, 0.22);
  const rightAnkle = polar(rightKnee, Math.PI / 2, 0.2);
  points.set(RIGHT_KNEE, rightKnee);
  points.set(RIGHT_ANKLE, rightAnkle);
  points.set(RIGHT_HEEL, point(rightAnkle.x + 0.005, rightAnkle.y + 0.025));
  points.set(RIGHT_FOOT_INDEX, point(rightAnkle.x - 0.02, rightAnkle.y + 0.015));

  return points;
}

const STATIC_POINTS = buildStaticPoints();

/**
 * Builds one synthetic `PoseObservation` for the given point in the demo
 * timeline. `timeMs` drives the right-elbow curl animation independently
 * of whatever the synthetic hand/face are doing at the same moment — a
 * real body's joints move independently too.
 */
export function generateSyntheticPose(timeMs: number): PoseObservation {
  const points = new Map(STATIC_POINTS);

  const rightElbow = polar(RIGHT_SHOULDER_POS, RIGHT_UPPER_ARM_ANGLE, UPPER_ARM_LENGTH);
  const curl = elbowCurl(timeMs);
  const forearmAngle = RIGHT_UPPER_ARM_ANGLE - curl * (Math.PI / 2);
  const rightWrist = polar(rightElbow, forearmAngle, FOREARM_LENGTH);
  const rightHand = polar(rightWrist, forearmAngle, HAND_LENGTH);

  points.set(RIGHT_ELBOW, rightElbow);
  points.set(RIGHT_WRIST, rightWrist);
  points.set(RIGHT_PINKY, rightHand);
  points.set(RIGHT_INDEX, point(rightHand.x + 0.006, rightHand.y));
  points.set(RIGHT_THUMB, point(rightHand.x - 0.006, rightHand.y - 0.01));

  const landmarks: Landmark[] = [];
  for (let i = 0; i < POINT_COUNT; i += 1) {
    landmarks.push(points.get(i) ?? point(0.5, 0.5));
  }

  const pelvisMidpoint = point((LEFT_HIP_POS.x + RIGHT_HIP_POS.x) / 2, (LEFT_HIP_POS.y + RIGHT_HIP_POS.y) / 2);
  const worldLandmarks: Landmark[] = landmarks.map((l) =>
    point((l.x - pelvisMidpoint.x) * 0.3, (l.y - pelvisMidpoint.y) * 0.3),
  );

  return { landmarks, worldLandmarks };
}
