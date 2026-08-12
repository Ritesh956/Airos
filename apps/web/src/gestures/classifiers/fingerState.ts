import type { Landmark } from '@/vision/types';
import { distance2D, handScale, jointAngle } from '../geometry';

export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export interface FingerCurlAngles {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

// Angle (radians) at a finger's PIP joint, between its MCP and TIP. A
// fully straight finger sits near PI (180°); thresholds are picked with
// margin from both a relaxed-straight hand and a tightly curled fist so
// a hand held naturally (fingers rarely perfectly straight or perfectly
// curled) still classifies cleanly. The GestureStateMachine's frame-count
// stability window (engine.ts) is the primary defense against flicker —
// this threshold doesn't need to be surgically precise on its own.
export const FINGER_EXTENDED_ANGLE = (140 * Math.PI) / 180;
// The thumb only has two segments (MCP-IP-TIP) and moves differently from
// the other fingers, so it gets its own angle threshold and an additional
// splay check below.
export const THUMB_EXTENDED_ANGLE = (140 * Math.PI) / 180;
// Thumb-tip distance from the index MCP, normalized by hand scale. Catches
// a thumb that's geometrically "straight" but tucked flat against the
// palm (as in a relaxed fist) rather than actually splayed out and away
// from the hand.
export const THUMB_SPLAY_RATIO = 0.4;

const INDEX_JOINTS = [5, 6, 8] as const;
const MIDDLE_JOINTS = [9, 10, 12] as const;
const RING_JOINTS = [13, 14, 16] as const;
const PINKY_JOINTS = [17, 18, 20] as const;

function fingerCurlAngle(landmarks: Landmark[], [mcp, pip, tip]: readonly [number, number, number]): number {
  return jointAngle(landmarks[mcp]!, landmarks[pip]!, landmarks[tip]!);
}

export function getFingerCurlAngles(landmarks: Landmark[]): FingerCurlAngles {
  return {
    thumb: jointAngle(landmarks[2]!, landmarks[3]!, landmarks[4]!),
    index: fingerCurlAngle(landmarks, INDEX_JOINTS),
    middle: fingerCurlAngle(landmarks, MIDDLE_JOINTS),
    ring: fingerCurlAngle(landmarks, RING_JOINTS),
    pinky: fingerCurlAngle(landmarks, PINKY_JOINTS),
  };
}

/** The 5-bit extended/curled state every static pose template is matched
 *  against. Pure function of one frame's landmarks — no history. */
export function getFingerState(landmarks: Landmark[]): FingerState {
  const angles = getFingerCurlAngles(landmarks);
  const scale = handScale(landmarks);
  const thumbSplay = distance2D(landmarks[4]!, landmarks[5]!) / scale;

  return {
    thumb: angles.thumb > THUMB_EXTENDED_ANGLE && thumbSplay > THUMB_SPLAY_RATIO,
    index: angles.index > FINGER_EXTENDED_ANGLE,
    middle: angles.middle > FINGER_EXTENDED_ANGLE,
    ring: angles.ring > FINGER_EXTENDED_ANGLE,
    pinky: angles.pinky > FINGER_EXTENDED_ANGLE,
  };
}
