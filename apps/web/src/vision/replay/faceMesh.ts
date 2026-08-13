import type { FaceObservation, Landmark } from '@/vision/types';

/**
 * A synthetic face for Demo Mode — same spirit as `fixtures.ts`'s hand
 * generator: geometrically self-consistent, not a recording, built to
 * exercise the same code paths (a mesh/eye/eyebrow/lips overlay reading
 * real MediaPipe connection topology) rather than to look
 * indistinguishable from a real detection.
 *
 * The hard part a hand fixture doesn't have: `FaceLandmarker`'s connection
 * constants (`FACE_LANDMARKS_FACE_OVAL`, `_LEFT_EYE`, etc.) reference
 * *specific* canonical landmark indices, and drawing them against
 * synthetic points only looks face-shaped if those specific indices sit in
 * roughly the right place. Rather than hardcoding ~150 canonical index
 * positions from memory (error-prone, and silently wrong is worse than
 * loudly wrong here), `walkConnectionsIntoLoops` reads the *real* constants
 * at build time and walks each into an ordered loop/chain, so placement
 * only has to answer "where does this contour sit on a face" (an ellipse,
 * a chin-shaped chain, etc.), never "which index is the third from the
 * left eye's outer corner."
 */

interface EllipseRegion {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  /** Radians. Defaults to a full closed loop (0..2π). A half-range like
   *  [π, 2π] traces an upper arc instead — see the eyebrow regions below,
   *  which are open chains, not loops. */
  angleStart?: number;
  angleEnd?: number;
}

/**
 * Walks a flat set of `{start, end}` connections into one or more ordered
 * point sequences. Most face-mesh contour groups (an eye, an eyebrow, the
 * oval) are a single simple loop or chain; lips is two disjoint loops
 * (inner + outer) — this handles any number of disjoint components
 * generically via repeated "find an unvisited node, walk until stuck."
 * Exported and unit-tested directly (faceMesh.test.ts) since it's pure
 * graph logic with no MediaPipe/DOM dependency.
 */
export function walkConnectionsIntoLoops(connections: { start: number; end: number }[]): number[][] {
  const adjacency = new Map<number, number[]>();
  for (const { start, end } of connections) {
    if (!adjacency.has(start)) adjacency.set(start, []);
    if (!adjacency.has(end)) adjacency.set(end, []);
    adjacency.get(start)!.push(end);
    adjacency.get(end)!.push(start);
  }

  const visited = new Set<number>();
  const loops: number[][] = [];

  for (const startNode of adjacency.keys()) {
    if (visited.has(startNode)) continue;
    const loop: number[] = [startNode];
    visited.add(startNode);
    let current = startNode;
    for (;;) {
      const neighbors = adjacency.get(current) ?? [];
      const next = neighbors.find((n) => !visited.has(n));
      if (next === undefined) break;
      visited.add(next);
      loop.push(next);
      current = next;
    }
    loops.push(loop);
  }

  return loops;
}

/** Places one or more ordered loops evenly around an ellipse region.
 *  `radiusScales` lets concentric loops (lips' inner/outer ring) share a
 *  center at different radii — indexed by loop order, last value repeats. */
function placeLoops(
  loops: number[][],
  region: EllipseRegion,
  points: Map<number, Landmark>,
  radiusScales: number[] = [1],
): void {
  const angleStart = region.angleStart ?? 0;
  const angleEnd = region.angleEnd ?? Math.PI * 2;
  const angleSpan = angleEnd - angleStart;
  const isClosed = angleSpan >= Math.PI * 2 - 1e-6;

  loops.forEach((loop, loopIndex) => {
    const scale = radiusScales[loopIndex] ?? radiusScales[radiusScales.length - 1] ?? 1;
    // A closed loop's last point shouldn't land back on the first (divide
    // by the count); an open chain's should reach angleEnd exactly.
    const divisor = isClosed ? loop.length : Math.max(1, loop.length - 1);
    loop.forEach((index, i) => {
      const angle = angleStart + (i / divisor) * angleSpan;
      points.set(index, {
        x: region.centerX + Math.cos(angle) * region.radiusX * scale,
        y: region.centerY + Math.sin(angle) * region.radiusY * scale,
        z: 0,
      });
    });
  });
}

const FACE_OVAL_REGION: EllipseRegion = { centerX: 0.5, centerY: 0.46, radiusX: 0.16, radiusY: 0.22 };
const LEFT_EYE_REGION: EllipseRegion = { centerX: 0.435, centerY: 0.42, radiusX: 0.028, radiusY: 0.014 };
const RIGHT_EYE_REGION: EllipseRegion = { centerX: 0.565, centerY: 0.42, radiusX: 0.028, radiusY: 0.014 };
// An arc, not a loop — π..2π traces an upper arc in image coordinates
// (y grows downward), which sits just above the corresponding eye.
const LEFT_EYEBROW_REGION: EllipseRegion = {
  centerX: 0.435,
  centerY: 0.375,
  radiusX: 0.035,
  radiusY: 0.02,
  angleStart: Math.PI,
  angleEnd: Math.PI * 2,
};
const RIGHT_EYEBROW_REGION: EllipseRegion = { ...LEFT_EYEBROW_REGION, centerX: 0.565 };
const LIPS_REGION: EllipseRegion = { centerX: 0.5, centerY: 0.62, radiusX: 0.05, radiusY: 0.018 };

interface FaceMeshTopology {
  ovalLoops: number[][];
  leftEyeLoops: number[][];
  rightEyeLoops: number[][];
  leftEyebrowLoops: number[][];
  rightEyebrowLoops: number[][];
  lipsLoops: number[][];
}

let cachedTopology: FaceMeshTopology | null = null;
let topologyPromise: Promise<FaceMeshTopology> | null = null;

/**
 * Loads @mediapipe/tasks-vision's real face connection constants and walks
 * them into loops (see walkConnectionsIntoLoops's doc comment above) once,
 * caching the result — same "cached once, connection constants never
 * change" reasoning this file always had, just resolved lazily now instead
 * of at module-import time.
 *
 * Dynamically imported rather than a static top-level import deliberately:
 * this file is reachable from Demo Mode's fixture builder
 * (`fixtures.ts`), which is itself reachable from `VisionEngine`'s eager
 * singleton construction (`ReplaySource` is constructed unconditionally,
 * see its own doc comment) — a static import here would drag
 * `@mediapipe/tasks-vision` back into the eagerly-loaded bundle through
 * this one remaining path, undoing every other "dynamically import
 * @mediapipe/tasks-vision" fix in this codebase (HandLandmarkerService.ts
 * and friends). Callers must await this once before calling
 * `generateSyntheticFace` — see `fixtures.ts`'s
 * `generateGestureShowcaseFixture`.
 */
export function preloadFaceMeshTopology(): Promise<FaceMeshTopology> {
  if (!topologyPromise) {
    topologyPromise = import('@mediapipe/tasks-vision').then((m) => {
      const topology: FaceMeshTopology = {
        ovalLoops: walkConnectionsIntoLoops(m.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL),
        leftEyeLoops: walkConnectionsIntoLoops(m.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE),
        rightEyeLoops: walkConnectionsIntoLoops(m.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE),
        leftEyebrowLoops: walkConnectionsIntoLoops(m.FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW),
        rightEyebrowLoops: walkConnectionsIntoLoops(m.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW),
        lipsLoops: walkConnectionsIntoLoops(m.FaceLandmarker.FACE_LANDMARKS_LIPS),
      };
      cachedTopology = topology;
      return topology;
    });
  }
  return topologyPromise;
}

/** A brief blink roughly every 2.4s — mostly open, a quick eased
 *  close-and-reopen, not a sustained "eyes closed" state. Purely a demo
 *  animation over synthetic landmark positions; nothing classifies or
 *  displays this as "blinking," which would be exactly the kind of
 *  attribute claim this phase's gate forbids. */
function blinkFactor(timeMs: number): number {
  const BLINK_PERIOD_MS = 2400;
  const BLINK_WINDOW = 0.08;
  const cyclePos = (timeMs % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
  if (cyclePos > BLINK_WINDOW) return 0;
  return Math.sin((cyclePos / BLINK_WINDOW) * Math.PI);
}

/** A slow, gentle mouth open/close pulse — not tied to speech or any
 *  recognizable expression, same "just movement, not a claim" reasoning
 *  as the blink above. */
function mouthOpenFactor(timeMs: number): number {
  const MOUTH_PERIOD_MS = 3200;
  return ((Math.sin((timeMs / MOUTH_PERIOD_MS) * Math.PI * 2) + 1) / 2) * 0.6;
}

/**
 * Builds one synthetic `FaceObservation` for the given point in the demo
 * timeline. `timeMs` drives the blink/mouth animation independently of
 * whatever the synthetic hand is doing at the same moment — a real face
 * and hand move independently too.
 *
 * Requires `preloadFaceMeshTopology()` to have already resolved (see its
 * doc comment) — every caller in this codebase goes through
 * `fixtures.ts`'s `generateGestureShowcaseFixture`, which awaits it once
 * before calling this in a loop, so the topology is always cached by the
 * time real per-frame calls happen.
 */
export function generateSyntheticFace(timeMs: number): FaceObservation {
  if (!cachedTopology) {
    throw new Error('generateSyntheticFace() called before preloadFaceMeshTopology() resolved');
  }
  const topology = cachedTopology;
  const points = new Map<number, Landmark>();

  placeLoops(topology.ovalLoops, FACE_OVAL_REGION, points);

  const eyeOpenness = 1 - blinkFactor(timeMs) * 0.85; // never fully flattens to a line
  placeLoops(topology.leftEyeLoops, { ...LEFT_EYE_REGION, radiusY: LEFT_EYE_REGION.radiusY * eyeOpenness }, points);
  placeLoops(topology.rightEyeLoops, { ...RIGHT_EYE_REGION, radiusY: RIGHT_EYE_REGION.radiusY * eyeOpenness }, points);

  placeLoops(topology.leftEyebrowLoops, LEFT_EYEBROW_REGION, points);
  placeLoops(topology.rightEyebrowLoops, RIGHT_EYEBROW_REGION, points);

  const mouthOpen = mouthOpenFactor(timeMs);
  placeLoops(
    topology.lipsLoops,
    { ...LIPS_REGION, radiusY: LIPS_REGION.radiusY * (0.5 + mouthOpen) },
    points,
    [1, 0.4],
  );

  const maxIndex = Math.max(...points.keys());
  const landmarks: Landmark[] = [];
  for (let i = 0; i <= maxIndex; i += 1) {
    landmarks.push(points.get(i) ?? { x: FACE_OVAL_REGION.centerX, y: FACE_OVAL_REGION.centerY, z: 0 });
  }

  return { landmarks };
}
