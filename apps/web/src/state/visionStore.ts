import { createStore, throttle } from './createStore';
import type { VisionFrame, VisionSourceKind } from '@/vision/types';

/**
 * Cold-path vision summary — the small set of fields the UI actually
 * re-renders on (hand count, FPS, inference time). Raw landmark arrays are
 * deliberately NOT stored here; they live on a ref channel
 * (`visionEngine.latest`) that hot loops read directly. See
 * IMPLEMENTATION.md §3 and §5.
 */
export interface VisionState {
  handsPresent: number;
  faceDetected: boolean;
  poseDetected: boolean;
  fps: number;
  inferenceMs: number;
  totalMs: number;
  source: VisionSourceKind | null;
  /** Ring buffer of recent FPS samples for the performance graph (Phase 13). */
  fpsHistory: number[];
  /** IMPLEMENTATION.md §9's degradation ladder step currently in effect,
   *  0-5 (0 = no degradation). Written only by
   *  vision/perf/DegradationController.ts. What each level actually does is
   *  derived, not stored here — see degradationLadder.ts's
   *  getAppliedEffects(), the single source of truth both the controller
   *  and the Analytics UI read from, so a displayed step can never drift
   *  from what's really running. */
  degradationLevel: number;
}

const FPS_HISTORY_LENGTH = 120;
// ~10Hz cold-path publish rate, per §3. Exported so
// vision/perf/DegradationController.ts can derive how many fpsHistory
// samples span a given real time window (e.g. the ladder's 3s sustain
// check) without hardcoding a second copy of this number.
export const PUBLISH_INTERVAL_MS = 100;
// Smoothing factor for the FPS exponential moving average — low enough
// that a single slow frame doesn't make the readout jump around, high
// enough that a real, sustained frame-rate change (the degradation ladder,
// stopping tracking) shows up within a few frames rather than dragging.
const FPS_EMA_ALPHA = 0.2;

export const visionStore = createStore<VisionState>({
  handsPresent: 0,
  faceDetected: false,
  poseDetected: false,
  fps: 0,
  inferenceMs: 0,
  totalMs: 0,
  source: null,
  fpsHistory: [],
  degradationLevel: 0,
});

let lastFrameTimestamp = 0;
let emaFps = 0;

/**
 * Records real per-frame arrival timing on every call — this is the part
 * that must NOT be throttled, or "FPS" would measure the throttled publish
 * rate (~10Hz) instead of the actual detection rate, which would make the
 * readout a lie rather than a measurement. See docs/PERFORMANCE.md's "the
 * rule: measure, never estimate".
 */
function recordFrameArrival(): void {
  const now = performance.now();
  if (lastFrameTimestamp > 0) {
    const delta = now - lastFrameTimestamp;
    if (delta > 0) {
      const instantFps = 1000 / delta;
      emaFps = emaFps === 0 ? instantFps : emaFps + FPS_EMA_ALPHA * (instantFps - emaFps);
    }
  }
  lastFrameTimestamp = now;
}

const throttledPublish = throttle((frame: VisionFrame) => {
  const prev = visionStore.get();
  const fpsHistory = [...prev.fpsHistory, emaFps].slice(-FPS_HISTORY_LENGTH);

  visionStore.set({
    handsPresent: frame.hands.length,
    faceDetected: frame.face !== null,
    poseDetected: frame.pose !== null,
    fps: emaFps,
    inferenceMs: frame.timings.inferenceMs,
    totalMs: frame.timings.totalMs,
    source: frame.source,
    fpsHistory,
    degradationLevel: prev.degradationLevel,
  });
}, PUBLISH_INTERVAL_MS);

/**
 * Written only by vision/perf/DegradationController.ts. Guarded the same
 * way setVoiceState (appStore.ts) is guarded, and for the identical
 * reason: DegradationController's evaluate() is itself a visionStore
 * subscriber, and calling this unconditionally would re-enter notify()
 * from inside notify() on every single call. Skipping the write when
 * nothing actually changed breaks that cycle at its root — see CLAUDE.md
 * bug #12.
 */
export function setDegradationLevel(level: number): void {
  if (visionStore.get().degradationLevel === level) return;
  visionStore.update({ degradationLevel: level });
}

/** Called from the vision engine's per-frame callback (hot path). The
 *  store update is throttled to PUBLISH_INTERVAL_MS so React never
 *  re-renders faster than that; FPS measurement itself is not. */
export function publishVisionFrame(frame: VisionFrame): void {
  recordFrameArrival();
  throttledPublish(frame);
}

export function resetVisionStore(): void {
  // Without this, a trailing publish already scheduled from a frame just
  // before the reset would fire moments later on its own timer and
  // silently overwrite the zeroed state with stale hand-count/FPS data.
  throttledPublish.cancel();
  lastFrameTimestamp = 0;
  emaFps = 0;
  visionStore.set({
    handsPresent: 0,
    faceDetected: false,
    poseDetected: false,
    fps: 0,
    inferenceMs: 0,
    totalMs: 0,
    source: null,
    fpsHistory: [],
    // Preserved, not zeroed — degradationLevel is exclusively owned by
    // vision/perf/DegradationController.ts's own lifecycle (setDegradationLevel),
    // orthogonal to "hand/face/pose data stopped arriving." Zeroing it here
    // used to flicker the perf pill/banner off and back during the ladder's
    // own self-triggered camera restart (downgradeResolution/
    // restoreDefaultResolution cycle cameraState through 'off', which also
    // runs this reset) even though the ladder's real level hadn't changed —
    // DegradationController.resolutionChangeInFlight already guards its own
    // evaluate() against reacting to that cycle, but this reset is a
    // separate call site that guard doesn't cover.
    degradationLevel: visionStore.get().degradationLevel,
  });
}
