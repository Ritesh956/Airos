import { cameraManager } from '@/vision/camera/CameraManager';
import { appStore, setCameraState } from '@/state/appStore';
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

/** Resolves once after the visitor shows any sign of engaging with the
 *  page — cached module-wide so every caller shares one listener set. */
let firstInteractionPromise: Promise<void> | null = null;
function waitForFirstInteraction(): Promise<void> {
  if (!firstInteractionPromise) {
    firstInteractionPromise = new Promise((resolve) => {
      const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
      const onInteract = () => {
        for (const event of events) window.removeEventListener(event, onInteract);
        resolve();
      };
      for (const event of events) window.addEventListener(event, onInteract, { once: true, passive: true });
    });
  }
  return firstInteractionPromise;
}

/**
 * Defers a preload fetch/compile until the browser is idle *and* the
 * visitor has shown some sign of engaging with the page (a click, a key
 * press, a scroll — anything), instead of firing it the instant a task is
 * acquired. The preload itself is still "fire and forget, ready before the
 * user clicks Start" (see start()'s doc comment) — in virtually every real
 * visit, some interaction happens well before Start Camera/Demo Mode is
 * actually clicked, so this doesn't meaningfully delay readiness.
 *
 * The interaction gate specifically matters for a *non-interactive* page
 * load — a Lighthouse/bot audit that never touches the page. Home acquires
 * the hand task unconditionally on mount (for Demo Mode), so without this
 * gate every automated page-load measurement paid for an ~11MB WASM
 * download plus its compile, even though nothing was ever going to consume
 * it. See CLAUDE.md's "Post-Phase-14" note. Falls back to setTimeout for
 * browsers without requestIdleCallback (Safari, as of writing).
 */
function scheduleIdlePreload(fn: () => void): void {
  void waitForFirstInteraction().then(() => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => fn(), { timeout: 2000 });
    } else {
      setTimeout(fn, 200);
    }
  });
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
  /** Bumped every time `cancelLoop()` runs — see `tick()`'s doc comment for
   *  the race this closes. */
  private loopGeneration = 0;
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
    const generation = this.loopGeneration;
    if ('requestVideoFrameCallback' in video) {
      const id = video.requestVideoFrameCallback(() => this.tick(video, generation));
      this.loop = { kind: 'vfc', id, video };
    } else {
      const id = requestAnimationFrame(() => this.tick(video, generation));
      this.loop = { kind: 'raf', id };
    }
  }

  private cancelLoop(): void {
    // Bumped even when `this.loop` is already null — this is what lets a
    // `tick()` still in flight (awaiting inference) notice, once it
    // resumes, that its loop lifecycle has been superseded. Without it: if
    // `cameraState` cycles inactive-then-active-again while a tick is
    // still awaiting (e.g. the degradation ladder's own
    // downgradeResolution()/restoreDefaultResolution() stop+start restart),
    // `syncWithCameraState()` calls `cancelLoop()` (nulling `this.loop`)
    // and then, on the resumed 'active' state, `scheduleNext()` again —
    // starting a fresh loop A. The original in-flight tick then *also*
    // finishes and calls `scheduleNext()` at the bottom of its own
    // execution, starting loop B and silently overwriting `this.loop`
    // (which pointed at A) with B's handle. Loop A is now orphaned: still
    // running, calling tick() on its own cadence, but no longer referenced
    // by anything `cancelLoop()` can find — a future stop() only cancels
    // B, and inference silently runs twice per frame forever. The
    // generation check in `tick()` is what stops the stale tick from
    // scheduling that second, duplicate loop.
    this.loopGeneration++;
    if (this.loop?.kind === 'vfc') {
      this.loop.video.cancelVideoFrameCallback(this.loop.id);
    } else if (this.loop?.kind === 'raf') {
      cancelAnimationFrame(this.loop.id);
    }
    this.loop = null;
  }

  private async tick(video: HTMLVideoElement, generation: number): Promise<void> {
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
      try {
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
      } catch (error) {
        // A model failed to load or run — a failed WASM/model fetch, a GPU
        // delegate failure, anything detect*() can throw. Without this
        // catch, the rejection propagates out of tick() (invoked as a
        // discarded promise from requestVideoFrameCallback/
        // requestAnimationFrame — nothing awaits it), which skips the
        // scheduleNext() call at the bottom of this method entirely: the
        // loop silently stops forever, cameraState stays 'active', the
        // preview keeps showing live video, and every readout freezes with
        // no error anywhere. Stopping the camera outright (rather than just
        // this loop) surfaces it through the same error taxonomy a
        // getUserMedia failure uses — CAMERA_ERROR_MESSAGES has carried a
        // 'model-load-failed' entry since Phase 1, but nothing ever
        // assigned it before this. Retrying is then just Start Camera
        // again, the same recovery path any other camera error uses.
        console.error('[AIR OS] Vision inference failed — stopping the camera.', error);
        cameraManager.stop();
        setCameraState('error', 'model-load-failed');
        // cameraManager.stop() already synchronously drove cameraState to
        // 'off', which syncWithCameraState() (an appStore subscriber) has
        // already reacted to via cancelLoop() by the time this line runs —
        // this.loop is already null and loopGeneration already bumped.
        // Only touch it directly in the (defensive) case that didn't
        // happen, and only if this tick's own loop is still current.
        if (generation === this.loopGeneration) this.loop = null;
        return;
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

    // A cancelLoop() (and therefore a fresh scheduleNext() from
    // syncWithCameraState) may already have happened while the awaits
    // above were in flight — see cancelLoop()'s doc comment for the
    // duplicate-loop race this specifically prevents. When that's
    // happened, `this.loop` belongs to whichever newer loop is current
    // now, not to this stale tick — leave it alone entirely rather than
    // rescheduling a second, redundant loop or nulling out the real one.
    if (generation !== this.loopGeneration) return;

    // Re-check armed/camera state after the awaits above — stop() or a
    // camera state change could have happened mid-detection.
    if (this.armed && appStore.get().cameraState === 'active') {
      this.scheduleNext(video);
    } else {
      this.loop = null;
    }
  }
}
