/**
 * Core vision-layer type contracts. Defined in Phase 1, stable thereafter —
 * every later phase (hand tracking, gesture engine, face/pose) builds on
 * these without changing their shape. See IMPLEMENTATION.md §4.
 *
 * Coordinate convention (read this before touching landmark math anywhere
 * in the app): MediaPipe emits *unmirrored* normalized coordinates in
 * [0, 1]. Nothing in this file, `vision/`, or `gestures/` may mirror them.
 * Mirroring is a presentation concern applied exactly once, in
 * `utils/coords.ts`, when mapping to screen/canvas space.
 */
import type { Method } from '@airos/shared';

export type { Method };

/** A single normalized landmark. z is relative depth, not metric. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type Handedness = 'Left' | 'Right';

export interface HandObservation {
  /** 21 points, MediaPipe HandLandmarker ordering, normalized [0,1]. */
  landmarks: Landmark[];
  /** 21 points in metric hand-relative space, origin at the wrist. */
  worldLandmarks: Landmark[];
  /**
   * MediaPipe's handedness label, computed on the *unmirrored* frame this
   * type's landmarks convention requires (see the coordinate-convention
   * note at the top of this file). Because a front-facing camera shows a
   * mirror image of the user, this label is the opposite of the user's own
   * left/right hand — MediaPipe reports which hand it looks like in the
   * image, not which hand the person in front of the camera thinks they
   * raised. Anything that needs "the user's dominant hand" must flip this,
   * exactly once, in the same presentation layer that handles mirroring
   * (utils/coords.ts) — not silently in the gesture engine.
   */
  handedness: Handedness;
  /** MODEL — MediaPipe's own handedness classification score. */
  handednessScore: number;
}

export interface FaceObservation {
  /** Up to 478 points depending on model config. */
  landmarks: Landmark[];
}

export interface PoseObservation {
  landmarks: Landmark[];
  worldLandmarks: Landmark[];
}

export type VisionSourceKind = 'camera' | 'replay';

export interface VisionFrame {
  /** performance.now() at capture, not at publish. */
  timestamp: number;
  hands: HandObservation[];
  face: FaceObservation | null;
  pose: PoseObservation | null;
  timings: {
    /** Time spent inside the MediaPipe detectForVideo call(s). */
    inferenceMs: number;
    /** Time spent in the full frame handler, inference included. */
    totalMs: number;
  };
  source: VisionSourceKind;
}

/** Which MediaPipe tasks a module needs. The engine runs the union of all
 *  active requests across mounted modules — see IMPLEMENTATION.md §1.2. */
export interface VisionTaskRequest {
  hand: boolean;
  face: boolean;
  pose: boolean;
}

export const NO_TASKS: VisionTaskRequest = { hand: false, face: false, pose: false };
