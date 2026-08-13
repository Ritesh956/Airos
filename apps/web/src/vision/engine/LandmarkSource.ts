import type { VisionFrame, VisionSourceKind, VisionTaskRequest } from '@/vision/types';

/**
 * The abstraction the whole vision pipeline is built on. Everything
 * downstream of this interface — the gesture engine, cursor mapping, every
 * module — consumes `VisionFrame`s without knowing whether they came from
 * a live camera or a recorded fixture. That's what makes Demo Mode
 * possible without a second code path, and what makes the gesture engine
 * unit-testable with a deterministic fixture instead of a live camera.
 * See IMPLEMENTATION.md §1.1.
 */
export interface LandmarkSource {
  readonly kind: VisionSourceKind;
  /** Begin producing frames for the given task set. Idempotent. */
  start(tasks: VisionTaskRequest): Promise<void>;
  /** Stop producing frames and release any underlying resources. */
  stop(): void;
  /** Change which tasks are active without a full stop/start cycle. */
  updateTasks(tasks: VisionTaskRequest): void;
  /** Subscribe to every produced frame. Returns an unsubscribe function. */
  subscribe(callback: (frame: VisionFrame) => void): () => void;
  /** Step 3 of the performance degradation ladder (IMPLEMENTATION.md §9):
   *  halve real inference calls, holding the last real detection on the
   *  skipped ticks in between rather than fabricating motion. A no-op for
   *  sources with no per-frame inference cost to reduce (see
   *  ReplaySource's implementation). */
  setFrameSkipEnabled(enabled: boolean): void;
}
