import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandObservation, Landmark } from '@/vision/types';

const WASM_BASE_PATH = '/models/wasm';
const MODEL_ASSET_PATH = '/models/hand_landmarker.task';

let landmarkerPromise: Promise<HandLandmarker> | null = null;

/**
 * Lazily creates a single shared HandLandmarker instance (loading it twice
 * would double the WASM/model download and GPU context setup for no
 * benefit — every module that wants hands shares this one). Assets are
 * loaded from public/models/, vendored by scripts/fetch-models.mjs, not
 * from a third-party CDN — see docs/COMPUTER_VISION.md.
 *
 * `@mediapipe/tasks-vision` itself is dynamically imported here rather than
 * at module scope: this file is reachable from every route that acquires
 * the hand task, including Home on first paint, so a static import would
 * bundle the whole package's JS wrapper into the eagerly-loaded chunk
 * regardless of whether this function ever runs. See CLAUDE.md's
 * "Post-Phase-14" note.
 */
function getHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })().catch((error) => {
      // Let the next caller retry instead of caching a permanent failure —
      // a transient network blip fetching the model shouldn't wedge the
      // app for the rest of the session.
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

/** Warms up the model so the first real detection isn't the one paying the
 *  load cost. Safe to call multiple times. */
export function preloadHandLandmarker(): Promise<void> {
  return getHandLandmarker().then(() => undefined);
}

/** Step 2 of the performance degradation ladder (IMPLEMENTATION.md §9):
 *  drop from 2 tracked hands to 1. `setOptions()` reconfigures the existing
 *  landmarker in place — no reload, no dropped frames. */
export async function setHandLandmarkerNumHands(numHands: 1 | 2): Promise<void> {
  const landmarker = await getHandLandmarker();
  await landmarker.setOptions({ numHands });
}

function toLandmarks(points: { x: number; y: number; z: number; visibility?: number }[]): Landmark[] {
  return points.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
}

/**
 * Runs hand detection on a single video frame. `timestampMs` must be
 * monotonically increasing across calls for the same HandLandmarker
 * instance (MediaPipe's VIDEO running mode uses it for internal tracking
 * continuity) — callers should pass the same clock as CameraLandmarkSource
 * does, not wall-clock Date.now() mixed with performance.now().
 */
export async function detectHands(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<{ hands: HandObservation[]; inferenceMs: number }> {
  const landmarker = await getHandLandmarker();
  const before = performance.now();
  const result = landmarker.detectForVideo(video, timestampMs);
  const inferenceMs = performance.now() - before;

  const hands: HandObservation[] = result.landmarks.map((landmarks, i) => {
    const handednessCategory = result.handedness[i]?.[0];
    return {
      landmarks: toLandmarks(landmarks),
      worldLandmarks: toLandmarks(result.worldLandmarks[i] ?? []),
      handedness: handednessCategory?.categoryName === 'Left' ? 'Left' : 'Right',
      handednessScore: handednessCategory?.score ?? 0,
    };
  });

  return { hands, inferenceMs };
}
