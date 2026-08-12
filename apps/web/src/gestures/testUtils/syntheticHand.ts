import type { Landmark } from '@/vision/types';
import { handScale } from '../geometry';

/**
 * Test-only synthetic hand builder — NOT used by any production code (that's
 * vision/replay/fixtures.ts, which optimizes for a smooth-looking Demo
 * Mode animation, not for precisely controlled classifier inputs).
 *
 * Landmarks here are placed with explicit forward kinematics — given
 * angle/length parameters, not by calling the classifiers' own geometry
 * helpers (gestures/geometry.ts) and working backward. That independence
 * is what makes a test like "175° joint angle classifies as extended"
 * meaningful: it exercises the classifier's actual threshold logic rather
 * than just confirming the geometry module agrees with itself.
 */

const WRIST = { x: 0.5, y: 0.55 };

interface FingerBuild {
  mcp: Landmark;
  pip: Landmark;
  dip: Landmark;
  tip: Landmark;
}

/**
 * Places one non-thumb finger's four landmarks so that the angle at PIP
 * (between MCP and TIP — the exact triple fingerState.ts measures) is
 * `jointAngleDeg`. 180° = dead straight; smaller = more curled. DIP is
 * just interpolated for a plausible shape — nothing reads its position.
 */
function buildFinger(mcp: Landmark, baseAngleRad: number, jointAngleDeg: number, segmentLength = 0.08): FingerBuild {
  const pip: Landmark = {
    x: mcp.x + Math.cos(baseAngleRad) * segmentLength,
    y: mcp.y + Math.sin(baseAngleRad) * segmentLength,
    z: 0,
  };
  const toMcpAngle = baseAngleRad + Math.PI;
  const jointAngleRad = (jointAngleDeg * Math.PI) / 180;
  const tipAngle = toMcpAngle - jointAngleRad;
  const tip: Landmark = {
    x: pip.x + Math.cos(tipAngle) * segmentLength,
    y: pip.y + Math.sin(tipAngle) * segmentLength,
    z: 0,
  };
  const dip: Landmark = { x: (pip.x + tip.x) / 2, y: (pip.y + tip.y) / 2, z: 0 };
  return { mcp, pip, dip, tip };
}

const FINGER_BASE_ANGLES = {
  index: -1.35,
  middle: -1.55,
  ring: -1.75,
  pinky: -1.95,
} as const;

export interface HandPoseOptions {
  /** 180 = fully straight, ~60-90 = clearly curled. One value per finger. */
  fingerAngles?: { index?: number; middle?: number; ring?: number; pinky?: number };
  thumb?: {
    /** Whether the thumb reads as "extended" (needs both a straight-ish
     *  joint angle and enough splay away from the palm — see
     *  fingerState.ts). Ignored if `pinch` is set. */
    extended?: boolean;
    orientation?: 'up' | 'down' | 'neutral';
  };
  /** If set, positions the thumb tip right next to the index tip,
   *  overriding `thumb` and `fingerAngles.index`. */
  pinch?: boolean;
  wrist?: { x: number; y: number };
}

function buildThumb(wrist: Landmark, indexMcp: Landmark, options: HandPoseOptions['thumb']): FingerBuild {
  const extended = options?.extended ?? false;
  const orientation = options?.orientation ?? 'neutral';
  const mcp: Landmark = { x: wrist.x + 0.02, y: wrist.y - 0.01, z: 0 };

  if (!extended) {
    // Curled: short segments folded back in toward the palm, close to the
    // index MCP — fails both the angle check and the splay check.
    const ip: Landmark = { x: mcp.x + (indexMcp.x - mcp.x) * 0.3, y: mcp.y + (indexMcp.y - mcp.y) * 0.3, z: 0 };
    const tip: Landmark = { x: mcp.x + (indexMcp.x - mcp.x) * 0.5, y: mcp.y + (indexMcp.y - mcp.y) * 0.5, z: 0 };
    const dip: Landmark = { x: (ip.x + tip.x) / 2, y: (ip.y + tip.y) / 2, z: 0 };
    return { mcp, pip: ip, dip, tip };
  }

  // 'neutral' is exactly horizontal (zero vertical component) so it's
  // unambiguously inside classifyStaticPose's orientation dead zone —
  // that's the whole point of the "ambiguous thumb" test case.
  const directionAngle = orientation === 'up' ? -Math.PI / 2.1 : orientation === 'down' ? Math.PI / 2.1 : 0;
  return buildFinger(mcp, directionAngle, 175, 0.09);
}

/** Builds a full 21-landmark hand (MediaPipe HandLandmarker ordering)
 *  matching the requested pose. Angles default to "fully open" (180°) so
 *  callers only need to specify what makes their test case distinctive. */
export function buildHand(options: HandPoseOptions = {}): Landmark[] {
  const wrist: Landmark = { x: options.wrist?.x ?? WRIST.x, y: options.wrist?.y ?? WRIST.y, z: 0 };
  const angles = { index: 180, middle: 180, ring: 180, pinky: 180, ...options.fingerAngles };

  const fingerMcp = (base: number): Landmark => ({
    x: wrist.x + Math.cos(base) * 0.03,
    y: wrist.y + Math.sin(base) * 0.03,
    z: 0,
  });

  const index = buildFinger(fingerMcp(FINGER_BASE_ANGLES.index), FINGER_BASE_ANGLES.index, angles.index);
  const middle = buildFinger(fingerMcp(FINGER_BASE_ANGLES.middle), FINGER_BASE_ANGLES.middle, angles.middle);
  const ring = buildFinger(fingerMcp(FINGER_BASE_ANGLES.ring), FINGER_BASE_ANGLES.ring, angles.ring);
  const pinky = buildFinger(fingerMcp(FINGER_BASE_ANGLES.pinky), FINGER_BASE_ANGLES.pinky, angles.pinky);
  const thumb = buildThumb(wrist, index.mcp, options.thumb);

  const landmarks: Landmark[] = [
    wrist,
    thumb.mcp,
    thumb.pip,
    thumb.dip,
    thumb.tip,
    index.mcp,
    index.pip,
    index.dip,
    index.tip,
    middle.mcp,
    middle.pip,
    middle.dip,
    middle.tip,
    ring.mcp,
    ring.pip,
    ring.dip,
    ring.tip,
    pinky.mcp,
    pinky.pip,
    pinky.dip,
    pinky.tip,
  ];

  if (options.pinch) {
    // Nudge the thumb tip to sit right next to the (curled) index tip,
    // regardless of whatever finger/thumb options were also passed —
    // pinch is a deliberate override for tests that only care about the
    // thumb-index distance signal. The offset must be scaled by hand size
    // (pinchDistance() normalizes by handScale, same as everything else
    // here) rather than a fixed absolute epsilon — a fixed epsilon would
    // read as "pinching" or not depending on how large this synthetic
    // hand happens to be, which is exactly the bug the normalization
    // exists to prevent.
    const scale = handScale(landmarks);
    landmarks[4] = { x: landmarks[8]!.x + 0.05 * scale, y: landmarks[8]!.y + 0.05 * scale, z: 0 };
  }

  return landmarks;
}

export const openPalmHand = (): Landmark[] => buildHand({ thumb: { extended: true, orientation: 'neutral' } });
export const fistHand = (): Landmark[] =>
  buildHand({ fingerAngles: { index: 70, middle: 65, ring: 65, pinky: 70 }, thumb: { extended: false } });
export const pointHand = (): Landmark[] =>
  buildHand({ fingerAngles: { middle: 65, ring: 65, pinky: 70 }, thumb: { extended: false } });
export const peaceHand = (): Landmark[] =>
  buildHand({ fingerAngles: { ring: 65, pinky: 70 }, thumb: { extended: false } });
export const thumbsUpHand = (): Landmark[] =>
  buildHand({
    fingerAngles: { index: 65, middle: 65, ring: 65, pinky: 70 },
    thumb: { extended: true, orientation: 'up' },
  });
export const thumbsDownHand = (): Landmark[] =>
  buildHand({
    fingerAngles: { index: 65, middle: 65, ring: 65, pinky: 70 },
    thumb: { extended: true, orientation: 'down' },
  });
export const ambiguousThumbHand = (): Landmark[] =>
  buildHand({
    fingerAngles: { index: 65, middle: 65, ring: 65, pinky: 70 },
    thumb: { extended: true, orientation: 'neutral' },
  });
export const pinchHand = (): Landmark[] =>
  buildHand({ fingerAngles: { middle: 65, ring: 65, pinky: 70 }, pinch: true });

/** Shifts every landmark in a hand by a fixed offset — used to build a
 *  moving-hand sequence for swipe/engine tests out of an otherwise
 *  ordinary, non-degenerate hand shape. */
export function translateHand(landmarks: Landmark[], dx: number, dy: number): Landmark[] {
  return landmarks.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }));
}

/** A minimal 21-point array with every point at the same location — valid
 *  input for SwipeDetector (which only reads the centroid indices), too
 *  degenerate for the static-pose/pinch classifiers. Use `translateHand`
 *  with a real pose for anything that also exercises GestureEngine. */
export function centroidOnlyLandmarks(x: number, y: number): Landmark[] {
  return Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
}
