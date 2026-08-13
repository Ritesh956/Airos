import { appStore, setCameraState } from '@/state/appStore';
import { classifyCameraError } from './errors';

export interface CameraConstraintsOverride {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
}

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: 'user',
    frameRate: { ideal: 30, max: 30 },
  },
};

/**
 * Owns the camera MediaStream and its lifecycle. UI-agnostic — it publishes
 * state transitions into appStore (OFF/STARTING/ACTIVE/STOPPING/ERROR) so
 * any component can render the current camera state without polling this
 * class directly.
 *
 * Hard rule (IMPLEMENTATION.md §6): permission is requested only inside
 * `start()`, which is only ever called from explicit user action. Nothing
 * in this app calls `start()` on mount.
 *
 * A singleton: the camera is a single OS-wide resource, not a per-module
 * one. Modules that need frames subscribe to the VisionEngine (Phase 2),
 * not to this class directly.
 */
export class CameraManager {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private starting: Promise<HTMLVideoElement> | null = null;
  /** Bumped by every stop() call — see doStart()'s doc comment for why an
   *  in-flight start needs this to detect a stop that raced in mid-await. */
  private generation = 0;
  private lastInputSource = appStore.get().inputSource;

  constructor() {
    // Demo Mode replacing the camera as the tracking source doesn't imply
    // the camera should keep running — without this, toggling Demo Mode on
    // leaves the stream (and the OS camera indicator) live while the UI
    // simultaneously claims "no camera in use", and hides the only control
    // that could stop it (see CameraStage's isDemoMode-gated Stop button).
    appStore.subscribe(() => {
      const { inputSource } = appStore.get();
      if (inputSource === this.lastInputSource) return;
      this.lastInputSource = inputSource;
      if (inputSource === 'replay' && (this.stream || this.starting)) this.stop();
    });
  }

  get isActive(): boolean {
    return this.stream !== null;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  async start(override?: CameraConstraintsOverride): Promise<HTMLVideoElement> {
    if (this.starting) return this.starting;
    if (this.stream && this.videoEl) return this.videoEl;

    this.starting = this.doStart(override, this.generation);
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  /**
   * `startGeneration` is captured once, at the moment this call began — the
   * value `this.generation` held right then. `stop()` bumps `this.generation`
   * unconditionally, including while a start is only awaiting permission
   * (the old early-return in `stop()` skipped teardown in exactly that case,
   * silently doing nothing — the camera would come on anyway the instant
   * `getUserMedia` resolved, moments after the user explicitly told it to
   * stop). Checking `startGeneration !== this.generation` after every await
   * below is how this call notices a `stop()` happened while it was
   * suspended, and tears down whatever it just acquired instead of
   * activating a camera the user no longer wants running.
   */
  private async doStart(override: CameraConstraintsOverride | undefined, startGeneration: number): Promise<HTMLVideoElement> {
    setCameraState('starting');

    const constraints: MediaStreamConstraints = override
      ? {
          audio: false,
          video: {
            ...(DEFAULT_CONSTRAINTS.video as MediaTrackConstraints),
            ...(override.width ? { width: { ideal: override.width } } : {}),
            ...(override.height ? { height: { ideal: override.height } } : {}),
            ...(override.facingMode ? { facingMode: override.facingMode } : {}),
          },
        }
      : DEFAULT_CONSTRAINTS;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      // A stop() that raced in during this await already published 'off' —
      // don't clobber it with 'error' for a request that's moot now.
      if (startGeneration === this.generation) {
        const reason = classifyCameraError(error);
        setCameraState('error', reason);
        this.teardown();
      }
      throw error;
    }

    if (startGeneration !== this.generation) {
      for (const track of stream.getTracks()) track.stop();
      throw new DOMException('Camera start was cancelled by stop().', 'AbortError');
    }

    this.stream = stream;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;

    try {
      await video.play();
    } catch (error) {
      if (startGeneration === this.generation) {
        // Deliberately not classifyCameraError(error) here: that function's
        // DOMException switch is built for getUserMedia's taxonomy, where
        // e.g. NotAllowedError specifically means camera *permission* was
        // denied. A rejection from video.play() with the very same
        // DOMException name means something unrelated — the browser's
        // autoplay policy blocked playback — and reusing the same switch
        // would show "Camera access was denied, allow it in your browser
        // settings" for a failure that has nothing to do with permissions.
        // 'unknown' is honest without misattributing the cause.
        setCameraState('error', 'unknown');
        this.teardown();
      } else {
        // stop() already tore this down while play() was in flight.
        for (const track of stream.getTracks()) track.stop();
      }
      throw error;
    }

    if (startGeneration !== this.generation) {
      for (const track of stream.getTracks()) track.stop();
      video.pause();
      video.srcObject = null;
      throw new DOMException('Camera start was cancelled by stop().', 'AbortError');
    }

    this.videoEl = video;
    setCameraState('active');
    return video;
  }

  /** Reduce active capture resolution — used by the performance degradation
   *  ladder (IMPLEMENTATION.md §9). Restarts the stream at the new size. */
  async downgradeResolution(width: number, height: number): Promise<void> {
    if (!this.stream) return;
    this.stop();
    await this.start({ width, height });
  }

  /** Reverses downgradeResolution() once FPS recovers — restarts the
   *  stream back at DEFAULT_CONSTRAINTS' resolution (no override). */
  async restoreDefaultResolution(): Promise<void> {
    if (!this.stream) return;
    this.stop();
    await this.start();
  }

  stop(): void {
    // Bumped unconditionally, even when there's no stream yet to tear
    // down — this is what lets an in-flight doStart() (still awaiting
    // getUserMedia or video.play()) notice a stop happened and cancel
    // itself instead of activating a camera moments after this call.
    this.generation++;
    if (!this.stream && !this.videoEl) {
      setCameraState('off');
      return;
    }
    setCameraState('stopping');
    this.teardown();
    setCameraState('off');
  }

  private teardown(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
  }
}

/** Singleton — see class doc for why. */
export const cameraManager = new CameraManager();
