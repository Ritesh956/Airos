import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseObservation, Landmark } from '@/vision/types';

const WASM_BASE_PATH = '/models/wasm';
const MODEL_ASSET_PATH = '/models/pose_landmarker.task';

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

/**
 * Lazily creates a single shared PoseLandmarker instance — same singleton
 * reasoning as Hand/FaceLandmarkerService. `outputSegmentationMasks` stays
 * unset (defaults to false): nothing in this phase renders a segmentation
 * mask (no background removal / body-cutout feature exists anywhere in the
 * app), so requesting it would be pure inference cost with no consumer —
 * same "unset, not requested-and-ignored" reasoning Phase 9 used for face
 * blendshapes (see FaceLandmarkerService.ts).
 *
 * Uses the `lite` model variant, not `full`/`heavy` — this is the third
 * MediaPipe task that can run in the same frame alongside hand (and
 * optionally face) detection, and IMPLEMENTATION.md §9's performance budget
 * has no headroom to spend on pose accuracy beyond what's needed for the
 * joint angles this phase actually displays.
 */
function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
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
export function preloadPoseLandmarker(): Promise<void> {
  return getPoseLandmarker().then(() => undefined);
}

function toLandmarks(points: { x: number; y: number; z: number; visibility?: number }[]): Landmark[] {
  return points.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
}

/**
 * Runs pose detection on a single video frame. `timestampMs` must be
 * monotonically increasing across calls for the same PoseLandmarker
 * instance — same requirement `detectHands`/`detectFace` document; callers
 * should pass the same clock `CameraLandmarkSource` uses for the other
 * task calls in the same tick.
 *
 * `numPoses: 1` means at most one person's pose is ever returned — this is
 * a single-user tool throughout the app (matches the hand/face framing).
 */
export async function detectPose(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<{ pose: PoseObservation | null; inferenceMs: number }> {
  const landmarker = await getPoseLandmarker();
  const before = performance.now();
  const result = landmarker.detectForVideo(video, timestampMs);
  const inferenceMs = performance.now() - before;

  const landmarks = result.landmarks[0];
  const worldLandmarks = result.worldLandmarks[0];
  const pose: PoseObservation | null = landmarks
    ? { landmarks: toLandmarks(landmarks), worldLandmarks: worldLandmarks ? toLandmarks(worldLandmarks) : [] }
    : null;

  return { pose, inferenceMs };
}
