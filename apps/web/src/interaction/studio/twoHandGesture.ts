/**
 * The two-hand scale/rotate math for 3D Studio (Phase 6), isolated from
 * StudioEngine/StudioScene the same way pinchDragTracker.ts and
 * calibration.ts are isolated from CursorEngine — geometry worth testing
 * on its own, without mocking a raycaster or a Three.js scene just to
 * exercise "how far apart did the two hands move."
 *
 * Resolves IMPLEMENTATION.md §13's open question ("two-hand rotation
 * mapping — vector angle vs. relative twist") in favor of vector angle:
 * the angle of the line between the two hands' pinch points, relative to
 * where that line pointed when the two-hand gesture started — the same
 * mental model as a two-finger pinch-to-zoom-and-rotate on a touchscreen,
 * which is the closest existing muscle memory most people already have for
 * "two points, moving apart/together and turning."
 */

export interface TwoHandPoints {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface TwoHandDelta {
  /** currentDistance / initialDistance between the two points. 1 = no
   *  change, >1 = hands moved apart, <1 = hands moved together. */
  scaleRatio: number;
  /** Change in the angle of the line a->b, radians, normalized to
   *  (-PI, PI] so a wraparound near +-180deg doesn't read as a near-360deg
   *  jump. */
  deltaAngleRad: number;
}

function distance(p: TwoHandPoints): number {
  return Math.hypot(p.bx - p.ax, p.by - p.ay);
}

function angle(p: TwoHandPoints): number {
  return Math.atan2(p.by - p.ay, p.bx - p.ax);
}

/** Wraps a radian delta into (-PI, PI]. */
function normalizeAngleDelta(delta: number): number {
  let normalized = delta % (2 * Math.PI);
  if (normalized > Math.PI) normalized -= 2 * Math.PI;
  if (normalized <= -Math.PI) normalized += 2 * Math.PI;
  return normalized;
}

/**
 * Compares the two hands' current positions against their positions when
 * the two-hand gesture started (captured once, by the caller, at the
 * rising edge into "both hands pinching"). Degenerate at zero initial
 * distance (both points coincide) — callers should treat `initial`'s
 * distance as validated/non-trivial before starting a gesture from it;
 * this function falls back to `scaleRatio: 1` rather than dividing by
 * (near) zero.
 */
export function computeTwoHandDelta(initial: TwoHandPoints, current: TwoHandPoints): TwoHandDelta {
  const initialDist = distance(initial);
  const currentDist = distance(current);
  const scaleRatio = initialDist > 1e-6 ? currentDist / initialDist : 1;
  const deltaAngleRad = normalizeAngleDelta(angle(current) - angle(initial));
  return { scaleRatio, deltaAngleRad };
}
