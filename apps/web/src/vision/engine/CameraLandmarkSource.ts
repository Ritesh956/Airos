import { cameraManager } from '@/vision/camera/CameraManager';
import { appStore } from '@/state/appStore';
import { detectHands, preloadHandLandmarker } from '@/vision/hand/HandLandmarkerService';
import { detectFace, preloadFaceLandmarker } from '@/vision/face/FaceLandmarkerService';
import { NO_TASKS, type FaceObservation, type HandObservation, type VisionFrame, type VisionTaskRequest } from '@/vision/types';
import type { LandmarkSource } from './LandmarkSource';

type LoopHandle = { kind: 'vfc'; id: number; video: HTMLVideoElement } | { kind: 'raf'; id: number } | null;

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

  async start(tasks: VisionTaskRequest): Promise<void> {
    this.tasks = tasks;
    if (this.armed) return;
    this.armed = true;

    if (tasks.hand) {
      // Fire-and-forget: warms the model while we wait on camera state, so
      // the first real frame after the camera comes up isn't also paying
      // for the WASM/model download.
      void preloadHandLandmarker();
    }
    if (tasks.face) void preloadFaceLandmarker();

    this.unsubscribeAppStore = appStore.subscribe(() => this.syncWithCameraState());
    this.syncWithCameraState();
  }

  updateTasks(tasks: VisionTaskRequest): void {
    this.tasks = tasks;
    if (tasks.hand) void preloadHandLandmarker();
    if (tasks.face) void preloadFaceLandmarker();
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
    let inferenceMs = 0;

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

    const frame: VisionFrame = {
      timestamp: frameStart,
      hands,
      face,
      pose: null,
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
