import type { HandObservation, Landmark, VisionFrame } from '@/vision/types';

/**
 * Synthetic landmark fixtures for Demo Mode and testing.
 *
 * IMPORTANT: these are procedurally generated, not a recording of a real
 * hand. Real MediaPipe output has small tracking noise, occlusion
 * artifacts, and biomechanical detail this generator doesn't attempt to
 * reproduce — it's built to be *geometrically self-consistent* (correct
 * MediaPipe landmark ordering, plausible joint angles) so it exercises the
 * same code paths a camera frame would, not to be indistinguishable from
 * one. Demo Mode's UI labels its source `replay`/"Demo (Recorded)" rather
 * than claiming this is live tracking — see IMPLEMENTATION.md §1.1.
 *
 * The sequence below cycles through named, recognizable poses (not just a
 * generic open/close wiggle) specifically so Demo Mode exercises the
 * Phase 3 gesture engine end to end — a visitor without a camera should
 * still see AIR OS actually recognize OPEN_PALM, FIST, POINT, PEACE,
 * THUMBS_UP, PINCH, and a swipe, not just a moving skeleton.
 */

// MediaPipe HandLandmarker landmark indices, for reference:
// 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20.
// Each non-thumb finger is 4 joints: MCP, PIP, DIP, TIP.

interface FingerSpec {
  /** Direction from the wrist, in radians (0 = along +x). */
  baseAngle: number;
  /** Segment lengths (MCP->PIP->DIP->TIP), normalized units. */
  segmentLengths: [number, number, number];
  /** How much this finger's segments bend per unit of "curl", in radians. */
  curlPerSegment: number;
}

const FINGER_SPECS = {
  index: { baseAngle: -1.35, segmentLengths: [0.09, 0.055, 0.04], curlPerSegment: 1.7 },
  middle: { baseAngle: -1.55, segmentLengths: [0.1, 0.06, 0.045], curlPerSegment: 1.7 },
  ring: { baseAngle: -1.75, segmentLengths: [0.09, 0.055, 0.04], curlPerSegment: 1.7 },
  pinky: { baseAngle: -1.95, segmentLengths: [0.075, 0.045, 0.035], curlPerSegment: 1.7 },
} satisfies Record<string, FingerSpec>;

type FingerName = keyof typeof FINGER_SPECS;

const THUMB_SPEC = {
  segmentLengths: [0.05, 0.045, 0.04] as [number, number, number],
  curlPerSegment: 1.1,
};

/**
 * Builds one finger's chain of landmarks. `curl` in [0, 1]: 0 = fully
 * extended (straight line from the base angle), 1 = fully curled toward
 * the palm. Each successive joint accumulates additional bend, which is
 * what makes a curled finger fold rather than just shrink.
 */
function buildFingerChain(
  origin: { x: number; y: number },
  baseAngle: number,
  spec: Pick<FingerSpec, 'segmentLengths' | 'curlPerSegment'>,
  curl: number,
  z: number,
): Landmark[] {
  const points: Landmark[] = [];
  let x = origin.x;
  let y = origin.y;
  let angle = baseAngle;

  spec.segmentLengths.forEach((length, i) => {
    angle += curl * spec.curlPerSegment * (i === 0 ? 0.4 : 0.85);
    x += Math.cos(angle) * length;
    y += Math.sin(angle) * length;
    points.push({ x, y, z: z - i * 0.005 });
  });
  return points;
}

/** One named hand shape: how curled each finger is, and how the thumb is
 *  posed. `wrist` lets a keyframe also reposition the whole hand (used for
 *  the swipe segment at the end of the sequence). */
interface PoseKeyframe {
  name: string;
  fingerCurl: Record<FingerName, number>;
  thumbCurl: number;
  /** Direction the thumb points when extended, radians. Ignored when
   *  thumbCurl is high enough that the thumb reads as curled regardless. */
  thumbAngle: number;
  /** Held before transitioning to the next keyframe. */
  holdMs: number;
  /** Time to interpolate from the *previous* keyframe into this one. */
  transitionMs: number;
  wrist?: { x: number; y: number };
}

const OPEN: Record<FingerName, number> = { index: 0, middle: 0, ring: 0, pinky: 0 };
const CURLED: Record<FingerName, number> = { index: 1, middle: 1, ring: 1, pinky: 1 };

const BASE_WRIST = { x: 0.5, y: 0.55 };
// 0.32 clears SwipeDetector's MIN_DISPLACEMENT (0.18) with real margin —
// an earlier version of this used a 0.12 offset, which looked like a
// swipe motion but never actually crossed the detector's threshold.
const SWIPE_LEFT_WRIST = { x: 0.82, y: 0.55 };

// The showcase loop. Ordered so every static template the gesture engine
// supports (docs/GESTURES.md) appears at least once, plus a swipe.
const KEYFRAMES: PoseKeyframe[] = [
  { name: 'OPEN_PALM', fingerCurl: OPEN, thumbCurl: 0, thumbAngle: -0.2, holdMs: 700, transitionMs: 0 },
  { name: 'FIST', fingerCurl: CURLED, thumbCurl: 1, thumbAngle: -0.2, holdMs: 550, transitionMs: 320 },
  {
    name: 'POINT',
    fingerCurl: { ...CURLED, index: 0 },
    thumbCurl: 1,
    thumbAngle: -0.2,
    holdMs: 650,
    transitionMs: 320,
  },
  {
    name: 'PEACE',
    fingerCurl: { ...CURLED, index: 0, middle: 0 },
    thumbCurl: 1,
    thumbAngle: -0.2,
    holdMs: 650,
    transitionMs: 320,
  },
  { name: 'THUMBS_UP', fingerCurl: CURLED, thumbCurl: 0, thumbAngle: -1.7, holdMs: 650, transitionMs: 320 },
  { name: 'PINCH', fingerCurl: { ...CURLED, index: 0.55 }, thumbCurl: 0.15, thumbAngle: -1.05, holdMs: 650, transitionMs: 320 },
  { name: 'OPEN_PALM_PRE_SWIPE', fingerCurl: OPEN, thumbCurl: 0, thumbAngle: -0.2, holdMs: 350, transitionMs: 320 },
  {
    name: 'SWIPE_OUT',
    fingerCurl: OPEN,
    thumbCurl: 0,
    thumbAngle: -0.2,
    holdMs: 0,
    transitionMs: 260,
    wrist: SWIPE_LEFT_WRIST,
  },
  { name: 'SWIPE_HOLD', fingerCurl: OPEN, thumbCurl: 0, thumbAngle: -0.2, holdMs: 500, transitionMs: 0, wrist: SWIPE_LEFT_WRIST },
  {
    name: 'SWIPE_BACK',
    fingerCurl: OPEN,
    thumbCurl: 0,
    thumbAngle: -0.2,
    holdMs: 500,
    transitionMs: 260,
  },
];

/** The PINCH keyframe deliberately overrides the thumb tip afterward (see
 *  below) rather than relying on curl alone — thumb curl + index curl
 *  don't reliably land the tips close enough together on their own, and a
 *  demo fixture whose "pinch" doesn't actually read as PINCH would defeat
 *  the point of this file. */
const PINCH_KEYFRAME_NAME = 'PINCH';

function buildHandLandmarks(pose: PoseKeyframe): Landmark[] {
  const wrist = pose.wrist ?? BASE_WRIST;
  const landmarks: Landmark[] = [{ x: wrist.x, y: wrist.y, z: 0 }];

  const thumbOrigin = { x: wrist.x + 0.02, y: wrist.y - 0.01, z: 0 };
  landmarks.push({ x: thumbOrigin.x, y: thumbOrigin.y, z: -0.005 }); // CMC
  landmarks.push(...buildFingerChain(thumbOrigin, pose.thumbAngle, THUMB_SPEC, pose.thumbCurl, -0.01));

  for (const name of Object.keys(FINGER_SPECS) as FingerName[]) {
    const spec = FINGER_SPECS[name];
    const mcp: Landmark = {
      x: wrist.x + Math.cos(spec.baseAngle) * 0.03,
      y: wrist.y + Math.sin(spec.baseAngle) * 0.03,
      z: -0.005,
    };
    landmarks.push(mcp, ...buildFingerChain(mcp, spec.baseAngle, spec, pose.fingerCurl[name], -0.01));
  }

  if (pose.name === PINCH_KEYFRAME_NAME) {
    // Nudge the thumb tip to sit right next to the index tip — the same
    // "override, don't rely on curl alone" approach the gesture engine's
    // own test fixtures use (gestures/testUtils/syntheticHand.ts), for the
    // same reason: pinch is a precise, deliberate hand shape that generic
    // per-finger curl parameters don't land reliably on their own.
    const indexTip = landmarks[8]!;
    landmarks[4] = { x: indexTip.x + 0.006, y: indexTip.y + 0.006, z: indexTip.z };
  }

  return landmarks;
}

function lerpLandmarks(a: Landmark[], b: Landmark[], t: number): Landmark[] {
  return a.map((point, i) => {
    const target = b[i]!;
    return {
      x: point.x + (target.x - point.x) * t,
      y: point.y + (target.y - point.y) * t,
      z: point.z + (target.z - point.z) * t,
    };
  });
}

function worldFrom(landmarks: Landmark[], wrist: { x: number; y: number }): Landmark[] {
  // A trivial "world" variant: same shape, centered at the origin instead
  // of screen position — good enough for a synthetic fixture, since Demo
  // Mode doesn't currently drive anything that depends on true metric scale.
  return landmarks.map((l) => ({ x: (l.x - wrist.x) * 0.3, y: (l.y - wrist.y) * 0.3, z: l.z * 0.3 }));
}

export interface SyntheticFixtureOptions {
  fps?: number;
}

/**
 * A single synthetic hand cycling through every static gesture template
 * plus a swipe, holding each pose long enough for the stability window
 * (GestureEngine's 3-frame debounce) to actually confirm it — see the
 * module doc comment for why this exists instead of a generic wiggle.
 */
export function generateGestureShowcaseFixture(options: SyntheticFixtureOptions = {}): VisionFrame[] {
  const fps = options.fps ?? 30;
  const frameIntervalMs = 1000 / fps;
  const frames: VisionFrame[] = [];

  let clockMs = 0;
  let previousLandmarks = buildHandLandmarks(KEYFRAMES[0]!);
  let previousWrist = KEYFRAMES[0]!.wrist ?? BASE_WRIST;

  for (const pose of KEYFRAMES) {
    const targetLandmarks = buildHandLandmarks(pose);
    const targetWrist = pose.wrist ?? BASE_WRIST;

    if (pose.transitionMs > 0) {
      const steps = Math.max(1, Math.round(pose.transitionMs / frameIntervalMs));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        frames.push(
          buildFrame(lerpLandmarks(previousLandmarks, targetLandmarks, t), previousWrist, targetWrist, t, clockMs),
        );
        clockMs += frameIntervalMs;
      }
    }

    const holdSteps = Math.max(0, Math.round(pose.holdMs / frameIntervalMs));
    for (let s = 0; s < holdSteps; s++) {
      frames.push(buildFrame(targetLandmarks, targetWrist, targetWrist, 1, clockMs));
      clockMs += frameIntervalMs;
    }

    previousLandmarks = targetLandmarks;
    previousWrist = targetWrist;
  }

  return frames;
}

function buildFrame(
  landmarks: Landmark[],
  fromWrist: { x: number; y: number },
  toWrist: { x: number; y: number },
  t: number,
  timestamp: number,
): VisionFrame {
  const wrist = { x: fromWrist.x + (toWrist.x - fromWrist.x) * t, y: fromWrist.y + (toWrist.y - fromWrist.y) * t };
  const hand: HandObservation = {
    landmarks,
    worldLandmarks: worldFrom(landmarks, wrist),
    // Fixed for this fixture. Recall handedness is relative to the
    // unmirrored frame — see the field doc in vision/types.ts.
    handedness: 'Left',
    handednessScore: 0.98,
  };

  return {
    timestamp,
    hands: [hand],
    face: null,
    pose: null,
    timings: { inferenceMs: 0, totalMs: 0 },
    source: 'replay',
  };
}
