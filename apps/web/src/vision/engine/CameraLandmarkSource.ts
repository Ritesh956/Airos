import { cameraManager } from '@/vision/camera/CameraManager';
import { appStore } from '@/state/appStore';
import { detectHands, preloadHandLandmarker } from '@/vision/hand/HandLandmarkerService';
import { detectFace, preloadFaceLandmarker } from '@/vision/face/FaceLandmarkerService';
import { detectPose, preloadPoseLandmarker } from '@/vision/pose/PoseLandmarkerService';
import {
  NO_TASKS,
  type FaceObservation,
  type HandObservation,
  type PoseObservation,
  type VisionFrame,
  type VisionTaskRequest,
} from '@/vision/types';
import type { LandmarkSource } from './LandmarkSource';

type LoopHandle = { kind: 'vfc'; id: number; video: HTMLVideoElement } | { kind: 'raf'; id: number } | null;

/**
 * Defers a preload fetch/compile to a browser idle slot instead of firing it
 * synchronously the instant a task is acquired. The preload itself is still
 * "fire and forget, ready before the user clicks Start" (see start()'s doc
 * comment) — this only changes *when* it's scheduled, so the WASM download
 * and instantiation (both real CPU/network cost — a 10MB+ wasm binary) don't
 * compete with the initial page paint on routes that acquire the hand task
 * on mount (e.g. Home, for Demo Mode). Falls back to setTimeout for browsers
 * without requestIdleCallback (Safari, as of writing).
 */
function scheduleIdlePreload(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn(), { timeout: 2000 });
  } else {
    setTimeout(fn, 200);
  }
}

/**
 * The real thing: runs MediaPipe detection against the live camera feed.
 *
 * Deliberately does NOT call `cameraManager.start()` itself. Requesting
 * camera *permission* only ever happens from an explicit click (see
 * CameraManager's doc comment) — this class instead follows whatever state
 * CameraManager is already in. If a module acquires the hand task before
 * the camera is active, detection simply begins the moment the user starts
 * the camera themselves; if the camera stops, this loop stops with it
 * without touching the MediaStream.
 */
export class CameraLandmarkSource implements LandmarkSource {
  readonly kind = 'camera' as const;

  private tasks: VisionTaskRequest = { ...NO_TASKS };
  private armed = false;
  private loop: LoopHandle = null;
  private listeners = new Set<(frame: VisionFrame) => void>();
  private unsubscribeAppStore: (() => void) | null = null;

  /** Step 3 of the degradation ladder (IMPLEMENTATION.md §9). When enabled,
   *  only every other tick actually calls into MediaPipe; the skipped tick
   *  reuses lastObservations — a real, previously-measured detection held
   *  for one extra frame, not a synthesized guess. */
  private frameSkipEnabled = false;
  private skipCounter = 0;
  private lastObservations: { hands: HandObservation[]; face: FaceObservation | null; pose: PoseObservation | null } =
    { hands: [], face: null, pose: null };

  async start(tasks: VisionTaskRequest): Promise<void> {
    this.tasks = tasks;
    if (this.armed) return;
    this.armed = true;

    // Fire-and-forget: warms the model(s) while we wait on camera state, so
    // the first real frame after the camera comes up isn't also paying for
    // the WASM/model download. Scheduled at idle (see scheduleIdlePreload's
    // doc comment) rather than immediately, so it doesn't compete with
    // initial page paint on a route that acquires a task on mount.
    if (tasks.hand) scheduleIdlePreload(() => void preloadHandLandmarker());
    if (tasks.face) scheduleIdlePreload(() => void preloadFaceLandmarker());
    if (tasks.pose) scheduleIdlePreload(() => void preloadPoseLandmarker());

    this.unsubscribeAppStore = appStore.subscribe(() => this.syncWithCameraState());
    this.syncWithCameraState();
  }

  updateTasks(tasks: VisionTaskRequest): void {
    this.tasks = tasks;
    if (tasks.hand) scheduleIdlePreload(() => void preloadHandLandmarker());
    if (tasks.face) scheduleIdlePreload(() => void preloadFaceLandmarker());
    if (tasks.pose) scheduleIdlePreload(() => void preloadPoseLandmarker());
  }

  stop(): void {
    this.armed = false;
    this.cancelLoop();
    this.unsubscribeAppStore?.();
    this.unsubscribeAppStore = null;
  }

  subscribe(callback: (frame: VisionFrame) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  setFrameSkipEnabled(enabled: boolean): void {
    this.frameSkipEnabled = enabled;
    this.skipCounter = 0;
  }

  private syncWithCameraState(): void {
    if (!this.armed) return;
    const cameraActive = appStore.get().cameraState === 'active';
    const video = cameraManager.getVideoElement();

    if (cameraActive && video && this.loop === null) {
      this.scheduleNext(video);
    } else if (!cameraActive) {
      this.cancelLoop();
    }
  }

  private scheduleNext(video: HTMLVideoElement): void {
    if ('requestVideoFrameCallback' in video) {
      const id = video.requestVideoFrameCallback(() => this.tick(video));
      this.loop = { kind: 'vfc', id, video };
    } else {
      const id = requestAnimationFrame(() => this.tick(video));
      this.loop = { kind: 'raf', id };
    }
  }

  private cancelLoop(): void {
    if (this.loop?.kind === 'vfc') {
      this.loop.video.cancelVideoFrameCallback(this.loop.id);
    } else if (this.loop?.kind === 'raf') {
      cancelAnimationFrame(this.loop.id);
    }
    this.loop = null;
  }

  private async tick(video: HTMLVideoElement): Promise<void> {
    const frameStart = performance.now();
    let hands: HandObservation[] = [];
    let face: FaceObservation | null = null;
    let pose: PoseObservation | null = null;
    let inferenceMs = 0;

    // Frame skipping (degradation ladder step 3) only ever holds a
    // *previous real* detection — it never fabricates a new one. Skipping
    // is decided per tick, before any detect* call, so a skipped tick costs
    // nothing beyond reading lastObservations.
    const shouldInfer = !this.frameSkipEnabled || this.skipCounter % 2 === 0;
    if (this.frameSkipEnabled) this.skipCounter++;

    if (shouldInfer) {
      if (this.tasks.hand) {
        const result = await detectHands(video, Math.round(frameStart));
        hands = result.hands;
        inferenceMs += result.inferenceMs;
      }
      if (this.tasks.face) {
        const result = await detectFace(video, Math.round(frameStart));
        face = result.face;
        inferenceMs += result.inferenceMs;
      }
      if (this.tasks.pose) {
        const result = await detectPose(video, Math.round(frameStart));
        pose = result.pose;
        inferenceMs += result.inferenceMs;
      }
      this.lastObservations = { hands, face, pose };
    } else {
      // Held, not re-inferred — inferenceMs stays 0 because no inference
      // ran on this tick, per the "never estimate" rule (IMPLEMENTATION.md
      // §9). Only replay tasks currently active, so a task acquired after
      // the last real detection correctly shows nothing until the next
      // real tick rather than a stale value from before it was requested.
      hands = this.tasks.hand ? this.lastObservations.hands : [];
      face = this.tasks.face ? this.lastObservations.face : null;
      pose = this.tasks.pose ? this.lastObservations.pose : null;
    }

    const frame: VisionFrame = {
      timestamp: frameStart,
      hands,
      face,
      pose,
      timings: { inferenceMs, totalMs: performance.now() - frameStart },
      source: 'camera',
    };

    for (const listener of this.listeners) listener(frame);

    // Re-check armed/camera state after the await above — stop() or a
    // camera state change could have happened mid-detection.
    if (this.armed && appStore.get().cameraState === 'active') {
      this.scheduleNext(video);
    } else {
      this.loop = null;
    }
  }
}
