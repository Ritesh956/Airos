/**
 * Gesture engine types. The engine implemented in Phase 3 is a pure
 * function `(landmarks, history) -> GestureResult`. These types are its
 * entire public surface — nothing downstream should reach past them into
 * classifier internals.
 */
import type { Handedness, Landmark, Method } from '@/vision/types';

export type GestureKind =
  | 'NONE'
  | 'OPEN_PALM'
  | 'FIST'
  | 'POINT'
  | 'PINCH'
  | 'THUMBS_UP'
  | 'THUMBS_DOWN'
  | 'PEACE'
  | 'SWIPE_LEFT'
  | 'SWIPE_RIGHT'
  | 'SWIPE_UP'
  | 'SWIPE_DOWN';

export interface GestureResult {
  gesture: GestureKind;
  /** Normalized geometric margin in [0, 1]. A rule-based confidence, not a
   *  model probability — always reported with method: 'HEURISTIC'. */
  confidence: number;
  method: Method;
  hand: Handedness;
  timestamp: number;
  landmarks: Landmark[];
}
