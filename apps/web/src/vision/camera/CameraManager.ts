import { setCameraState } from '@/state/appStore';
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

  get isActive(): boolean {
    return this.stream !== null;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  async start(override?: CameraConstraintsOverride): Promise<HTMLVideoElement> {
    if (this.starting) return this.starting;
    if (this.stream && this.videoEl) return this.videoEl;

    this.starting = this.doStart(override);
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async doStart(override?: CameraConstraintsOverride): Promise<HTMLVideoElement> {
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

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;
      await video.play();

      this.videoEl = video;
      setCameraState('active');
      return video;
    } catch (error) {
      const reason = classifyCameraError(error);
      setCameraState('error', reason);
      this.teardown();
      throw error;
    }
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
