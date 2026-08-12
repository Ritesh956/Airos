import { appStore } from '@/state/appStore';
import { publishVisionFrame, resetVisionStore } from '@/state/visionStore';
import { setTrackingState } from '@/state/interactionStore';
import { NO_TASKS, type VisionFrame, type VisionSourceKind, type VisionTaskRequest } from '@/vision/types';
import { CameraLandmarkSource } from './CameraLandmarkSource';
import { ReplaySource } from '@/vision/replay/ReplaySource';
import type { LandmarkSource } from './LandmarkSource';

/**
 * The task-subscription engine described in IMPLEMENTATION.md §1.2 and the
 * real-time loop diagram in §3. Modules don't talk to a camera or a
 * LandmarkSource directly — they `acquire()` the tasks they need (hand,
 * face, pose) and the engine runs the union of everything currently
 * requested, against whichever source (`camera` or `replay`) is active in
 * `appStore.inputSource`. Two modules both wanting hands share one running
 * detector; nobody pays for a task nobody asked for.
 *
 * Frames reach the rest of the app on two paths, deliberately:
 *  - `publishVisionFrame` (throttled, into visionStore) for anything React
 *    renders as text.
 *  - `subscribe()` here, direct and per-frame, for hot-path consumers like
 *    a skeleton-overlay canvas that must redraw every frame and cannot
 *    afford to wait on a throttled store update. See ARCHITECTURE.md's
 *    "hot path vs. cold path".
 */
class VisionEngineImpl {
  private sources: Record<VisionSourceKind, LandmarkSource> = {
    camera: new CameraLandmarkSource(),
    replay: new ReplaySource(),
  };

  private requests = new Map<string, VisionTaskRequest>();
  private frameListeners = new Set<(frame: VisionFrame) => void>();
  private sourceUnsubscribe: (() => void) | null = null;
  private currentSourceKind: VisionSourceKind | null = null;
  /** Tracks cameraState so recompute() can detect "camera stopped, source
   *  stayed 'camera'" — see the comment below. */
  private lastCameraActive = false;

  /** Hot-path ref channel: the latest frame, updated outside React state. */
  latest: VisionFrame | null = null;

  constructor() {
    appStore.subscribe(() => this.recompute());
  }

  /** Request a set of tasks under a unique consumer id. Returns a release
   *  function — call it on unmount (see hooks/useVisionTask.ts). */
  acquire(consumerId: string, tasks: VisionTaskRequest): () => void {
    this.requests.set(consumerId, tasks);
    this.recompute();
    return () => {
      this.requests.delete(consumerId);
      this.recompute();
    };
  }

  /** Direct per-frame subscription, bypassing the throttled store. */
  subscribe(callback: (frame: VisionFrame) => void): () => void {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }

  private unionTasks(): VisionTaskRequest {
    const union = { ...NO_TASKS };
    for (const request of this.requests.values()) {
      union.hand = union.hand || request.hand;
      union.face = union.face || request.face;
      union.pose = union.pose || request.pose;
    }
    return union;
  }

  private recompute(): void {
    const union = this.unionTasks();
    const anyActive = union.hand || union.face || union.pose;
    const { inputSource: desiredKind, cameraState } = appStore.get();
    const cameraActive = cameraState === 'active';
    const wasCameraActive = this.lastCameraActive;
    this.lastCameraActive = cameraActive;

    if (!anyActive) {
      this.teardownSource();
      setTrackingState('idle');
      resetVisionStore();
      return;
    }

    if (this.currentSourceKind !== desiredKind) {
      this.teardownSource();
      // Without this, switching sources (e.g. turning Demo Mode off) would
      // leave the previous source's last-published hand count/FPS sitting
      // in visionStore until the new source produces its own first frame —
      // stale numbers displayed as if they were current. Camera in
      // particular may never tick at all (denied permission), so nothing
      // would ever overwrite them.
      resetVisionStore();
      setTrackingState('idle');
      const source = this.sources[desiredKind];
      this.sourceUnsubscribe = source.subscribe((frame) => this.handleFrame(frame));
      this.currentSourceKind = desiredKind;
      void source.start(union);
      return;
    }

    this.sources[desiredKind].updateTasks(union);

    // CameraLandmarkSource stops ticking the instant cameraState leaves
    // 'active' (see its syncWithCameraState), but a consumer can still hold
    // the hand task acquired (e.g. Gesture Lab stays mounted), so the
    // source-switch branch above never runs and never resets anything. Same
    // staleness bug the comment above already fixed for switching sources,
    // just a second trigger it didn't cover: without this, stopping the
    // camera leaves the last live hand-count/FPS/gesture numbers frozen on
    // screen indefinitely instead of reflecting that nothing is tracking.
    if (desiredKind === 'camera' && wasCameraActive && !cameraActive) {
      resetVisionStore();
      setTrackingState('idle');
    }
  }

  private teardownSource(): void {
    if (this.currentSourceKind) {
      this.sources[this.currentSourceKind].stop();
    }
    this.sourceUnsubscribe?.();
    this.sourceUnsubscribe = null;
    this.currentSourceKind = null;
  }

  private handleFrame(frame: VisionFrame): void {
    this.latest = frame;
    publishVisionFrame(frame);

    const detected = frame.hands.length > 0 || frame.face !== null || frame.pose !== null;
    setTrackingState(detected ? 'tracking' : 'lost');

    for (const listener of this.frameListeners) listener(frame);
  }
}

/** Singleton — one vision pipeline for the whole app, shared across modules. */
export const visionEngine = new VisionEngineImpl();
