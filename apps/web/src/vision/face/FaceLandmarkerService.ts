import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { FaceObservation, Landmark } from '@/vision/types';

const WASM_BASE_PATH = '/models/wasm';
const MODEL_ASSET_PATH = '/models/face_landmarker.task';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

/**
 * Lazily creates a single shared FaceLandmarker instance — same singleton
 * reasoning as `HandLandmarkerService.ts`. Two options are deliberately
 * left off, not just left at their default:
 *
 * - `outputFaceBlendshapes` — MediaPipe's blendshape output is a per-frame
 *   classification score for things like "smiling," "eyebrow raised," or
 *   "jaw open." That's exactly the kind of attribute/expression inference
 *   this phase's gate forbids ("Tracking only — no attribute claims," see
 *   CLAUDE.md). Requesting it would put the capability one Readout away
 *   from someone adding it later without re-deriving why not to.
 * - `outputFacialTransformationMatrixes` — a 3D pose/orientation matrix
 *   meant for driving avatar/AR face effects. Nothing in this phase draws
 *   a 3D face model, so it'd just be inference cost with nothing consuming
 *   it.
 *
 * Both stay unset (MediaPipe defaults to `false`) rather than requested-
 * and-ignored, so a future reader can't mistake "we don't render it yet"
 * for "we don't have it."
 */
function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })().catch((error) => {
      // Let the next caller retry instead of caching a permanent failure —
      // see HandLandmarkerService.ts's identical reasoning.
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

/** Warms up the model so the first real detection isn't the one paying the
 *  load cost. Safe to call multiple times. */
export function preloadFaceLandmarker(): Promise<void> {
  return getFaceLandmarker().then(() => undefined);
}

function toLandmarks(points: { x: number; y: number; z: number; visibility?: number }[]): Landmark[] {
  return points.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
}

/**
 * Runs face detection on a single video frame. `timestampMs` must be
 * monotonically increasing across calls for the same FaceLandmarker
 * instance, same requirement `detectHands` documents — callers should pass
 * the same clock `CameraLandmarkSource` uses for the hand call in the same
 * tick, not a separately-sourced timestamp.
 *
 * `numFaces: 1` means at most one face is ever returned — this is a
 * single-user tool (matches the project's framing throughout), not a
 * room-scanning one.
 */
export async function detectFace(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<{ face: FaceObservation | null; inferenceMs: number }> {
  const landmarker = await getFaceLandmarker();
  const before = performance.now();
  const result = landmarker.detectForVideo(video, timestampMs);
  const inferenceMs = performance.now() - before;

  const landmarks = result.faceLandmarks[0];
  const face: FaceObservation | null = landmarks ? { landmarks: toLandmarks(landmarks) } : null;

  return { face, inferenceMs };
}
