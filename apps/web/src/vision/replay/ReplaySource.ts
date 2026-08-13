import type { VisionFrame, VisionTaskRequest } from '@/vision/types';
import type { LandmarkSource } from '@/vision/engine/LandmarkSource';
import { generateGestureShowcaseFixture } from './fixtures';

/**
 * Plays back a recorded (or, today, synthetic — see fixtures.ts) sequence
 * of VisionFrames at wall-clock rate, looping. Every module downstream
 * consumes this exactly like CameraLandmarkSource's live frames — that's
 * the entire point of the LandmarkSource interface (IMPLEMENTATION.md
 * §1.1): Demo Mode isn't a special UI state scattered through the app, it
 * is just a different LandmarkSource plugged into the same VisionEngine.
 */
export class ReplaySource implements LandmarkSource {
  readonly kind = 'replay' as const;

  /** null until either an explicit fixture is passed in (tests) or the
   *  default is lazily generated on first start() — see start()'s comment. */
  private frames: VisionFrame[] | null;
  /** Caches the in-flight generation promise so two overlapping start()
   *  calls (e.g. a rapid double-toggle) await the same build instead of
   *  generating the fixture twice. */
  private framesPromise: Promise<VisionFrame[]> | null = null;
  private loopDurationMs = 0;
  private tasks: VisionTaskRequest;
  private listeners = new Set<(frame: VisionFrame) => void>();
  private rafId: number | null = null;
  private startedAt = 0;

  constructor(frames?: VisionFrame[]) {
    this.frames = frames ?? null;
    if (frames) this.loopDurationMs = frames.length > 0 ? (frames[frames.length - 1]?.timestamp ?? 0) : 0;
    this.tasks = { hand: false, face: false, pose: false };
  }

  async start(tasks: VisionTaskRequest): Promise<void> {
    this.tasks = tasks;
    if (this.frames === null) {
      // Deferred from construction time: VisionEngine's singleton
      // constructs one ReplaySource unconditionally (it must exist before
      // anyone knows whether Demo Mode will ever be toggled on), so
      // building the default fixture eagerly there meant every single page
      // load paid the CPU cost of generating the full synthetic gesture
      // sequence (including the face/pose mesh construction it pulls in —
      // see fixtures.ts) even for visitors who only ever use the real
      // camera. Lighthouse's "Minimize main-thread work" audit against a
      // real production build is what caught this — see CLAUDE.md's
      // "Post-Phase-14" note. Generating it here means it's only ever built
      // the first time Demo Mode (or a test) actually starts this source.
      if (!this.framesPromise) this.framesPromise = generateGestureShowcaseFixture();
      this.frames = await this.framesPromise;
      this.loopDurationMs = this.frames.length > 0 ? (this.frames[this.frames.length - 1]?.timestamp ?? 0) : 0;
    }
    if (this.rafId !== null) return;
    this.startedAt = performance.now();
    this.scheduleNext();
  }

  updateTasks(tasks: VisionTaskRequest): void {
    this.tasks = tasks;
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  subscribe(callback: (frame: VisionFrame) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Playback has no MediaPipe inference to skip — the degradation ladder
   *  only ever applies to a real camera stream. */
  setFrameSkipEnabled(): void {
    // Intentionally a no-op.
  }

  private scheduleNext(): void {
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    if (!this.frames || this.frames.length === 0 || this.loopDurationMs === 0) {
      this.scheduleNext();
      return;
    }

    const elapsed = (performance.now() - this.startedAt) % this.loopDurationMs;
    const frameIndex = this.frames.findIndex((f) => f.timestamp >= elapsed);
    const source = this.frames[frameIndex === -1 ? this.frames.length - 1 : frameIndex]!;

    const frame: VisionFrame = {
      ...source,
      timestamp: performance.now(),
      hands: this.tasks.hand ? source.hands : [],
      face: this.tasks.face ? source.face : null,
      pose: this.tasks.pose ? source.pose : null,
    };

    for (const listener of this.listeners) listener(frame);
    this.scheduleNext();
  }
}
