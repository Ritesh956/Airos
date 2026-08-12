import type { Landmark } from '@/vision/types';
import type { GestureKind } from '../types';
import { distance2D, handScale } from '../geometry';
import { FINGER_EXTENDED_ANGLE, getFingerCurlAngles, getFingerState, type FingerCurlAngles, type FingerState } from './fingerState';

export interface StaticPoseResult {
  /** One of the static pose kinds, or NONE if nothing matched cleanly.
   *  Never PINCH — pinch needs hysteresis across frames, which belongs to
   *  the stateful GestureEngine (engine.ts), not this pure classifier. */
  gesture: GestureKind;
  confidence: number;
}

// The angle range (radians) over which confidence ramps from 0 (right at
// the decision boundary) to 1 (clearly on one side or the other).
const CONFIDENCE_ANGLE_RANGE = (40 * Math.PI) / 180;
// How far (normalized by hand scale) the thumb tip must sit above/below
// the wrist to call THUMBS_UP/THUMBS_DOWN rather than an ambiguous
// sideways thumb.
const THUMB_ORIENTATION_MARGIN = 0.15;

function angleMargin(angle: number, threshold: number): number {
  return Math.min(1, Math.abs(angle - threshold) / CONFIDENCE_ANGLE_RANGE);
}

/**
 * Thumb-tip↔index-tip distance normalized by hand scale — the raw pinch
 * signal. Just a measurement; whether that counts as "pinching" right now
 * depends on hysteresis state the caller owns (engine.ts's Schmitt
 * trigger), not on a single-frame threshold here.
 */
export function pinchDistance(landmarks: Landmark[]): number {
  return distance2D(landmarks[4]!, landmarks[8]!) / handScale(landmarks);
}

interface PoseTemplate {
  gesture: 'FIST' | 'THUMBS_UP' | 'PEACE' | 'POINT' | 'OPEN_PALM';
  /** Only the fingers listed here are checked; an omitted finger is
   *  "don't care" for this template. */
  fingers: Partial<FingerState>;
}

// Order matters: matching stops at the first template whose specified
// fingers all match, so more constrained templates go first. FIST and the
// thumb-only shape (later resolved to THUMBS_UP/THUMBS_DOWN by
// orientation) both require every other finger curled — they'd be
// ambiguous with each other if thumb were left as "don't care" on either.
const TEMPLATES: PoseTemplate[] = [
  { gesture: 'FIST', fingers: { thumb: false, index: false, middle: false, ring: false, pinky: false } },
  { gesture: 'THUMBS_UP', fingers: { thumb: true, index: false, middle: false, ring: false, pinky: false } },
  { gesture: 'PEACE', fingers: { index: true, middle: true, ring: false, pinky: false } },
  { gesture: 'POINT', fingers: { index: true, middle: false, ring: false, pinky: false } },
  { gesture: 'OPEN_PALM', fingers: { index: true, middle: true, ring: true, pinky: true } },
];

function matchesTemplate(state: FingerState, template: Partial<FingerState>): boolean {
  return (Object.keys(template) as (keyof FingerState)[]).every((key) => state[key] === template[key]);
}

function templateConfidence(angles: FingerCurlAngles, template: Partial<FingerState>): number {
  const keys = Object.keys(template) as (keyof FingerState)[];
  if (keys.length === 0) return 0;
  // The weakest-matching finger sets the overall confidence — a template
  // is only as decisive as its least certain check.
  return Math.min(...keys.map((key) => angleMargin(angles[key], FINGER_EXTENDED_ANGLE)));
}

/** Distinguishes THUMBS_UP from THUMBS_DOWN once the finger-state template
 *  has already matched "thumb extended, everything else curled" — those
 *  two gestures share an identical finger vector and differ only in which
 *  way the thumb points. Returns null when the thumb is roughly
 *  horizontal, which is genuinely ambiguous rather than a coin flip. */
function resolveThumbOrientation(landmarks: Landmark[]): { gesture: GestureKind; confidence: number } | null {
  const scale = handScale(landmarks);
  const wrist = landmarks[0]!;
  const tip = landmarks[4]!;
  // Image-space y grows downward, so a smaller tip.y than wrist.y means
  // the thumb points up.
  const verticalOffset = (wrist.y - tip.y) / scale;

  if (Math.abs(verticalOffset) < THUMB_ORIENTATION_MARGIN) return null;

  return {
    gesture: verticalOffset > 0 ? 'THUMBS_UP' : 'THUMBS_DOWN',
    confidence: Math.min(1, (Math.abs(verticalOffset) - THUMB_ORIENTATION_MARGIN) / THUMB_ORIENTATION_MARGIN),
  };
}

/** Classifies a single frame's static hand pose. Pure: no history, no
 *  DOM, no pinch handling — see the GestureEngine doc comment for why
 *  pinch lives one layer up. */
export function classifyStaticPose(landmarks: Landmark[]): StaticPoseResult {
  const state = getFingerState(landmarks);
  const angles = getFingerCurlAngles(landmarks);

  for (const template of TEMPLATES) {
    if (!matchesTemplate(state, template.fingers)) continue;

    if (template.gesture === 'THUMBS_UP') {
      const orientation = resolveThumbOrientation(landmarks);
      if (!orientation) return { gesture: 'NONE', confidence: 0 };
      const shapeConfidence = templateConfidence(angles, template.fingers);
      return { gesture: orientation.gesture, confidence: Math.min(shapeConfidence, orientation.confidence) };
    }

    return { gesture: template.gesture, confidence: templateConfidence(angles, template.fingers) };
  }

  return { gesture: 'NONE', confidence: 0 };
}
