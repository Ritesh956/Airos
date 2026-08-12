import { visionEngine } from '@/vision/engine/VisionEngine';
import { ensureGestureBridgeStarted, getLatestGestureResults } from '@/interaction/gestureBridge';
import type { GestureKind, GestureResult } from '@/gestures/types';
import type { Handedness, HandObservation, VisionFrame } from '@/vision/types';
import { mirrorLandmark } from '@/utils/coords';
import { appStore } from '@/state/appStore';
import { getReachBox, mapThroughReachBox } from '@/interaction/cursor/calibration';
import { Point2DFilter } from '@/interaction/cursor/OneEuroFilter';

/**
 * The Interaction Engine stage for Air Draw (Phase 7) — same role
 * `CursorEngine` plays for Air Cursor and `StudioEngine` plays for 3D
 * Studio (see docs/ARCHITECTURE.md's "Interaction Engine" section), and
 * deliberately following `StudioEngine`'s split rather than
 * `CursorEngine`'s: this engine only answers "where is the hand pointing,
 * normalized, and what gesture is it making" — it has no idea a stroke, a
 * canvas, or an eraser radius exists. Turning that into paint is
 * `modules/draw/DrawCanvas.tsx`'s job, the same way raycasting/dragging is
 * `StudioScene.tsx`'s job rather than `StudioEngine`'s. Keeping the engine
 * generic here means it stays trivially reusable if a future module also
 * just wants "a calibrated, filtered fingertip pointer."
 *
 * Reuses the same calibrated reach-box mapping and One-Euro filter Air
 * Cursor uses (`interaction/cursor/calibration.ts`,
 * `interaction/cursor/OneEuroFilter.ts`) rather than inventing a second
 * calibration flow or smoothing scheme — one calibration a user does once
 * benefits every module that needs a pointed fingertip, and the jitter
 * problem is identical to the cursor's (see IMPLEMENTATION.md §1.3).
 */

export interface DrawPointerState {
  /** Normalized [0,1], mirrored + reach-boxed — the same convention
   *  CursorEngine maps to viewport pixels and StudioEngine maps to NDC.
   *  Null when no hand is tracked. The draw canvas treats this as
   *  canvas-space (fraction of its own width/height), not viewport space —
   *  a hand's calibrated reach maps onto the drawing surface, not the
   *  whole page. */
  x: number | null;
  y: number | null;
  visible: boolean;
  gesture: GestureKind;
  hand: Handedness | null;
}

class DrawEngineImpl {
  private filter = new Point2DFilter();
  private preferredHandedness: Handedness | null = null;
  private wasHandVisible = false;
  private started = false;

  private lastInputSource = appStore.get().inputSource;
  private lastCameraState = appStore.get().cameraState;

  latest: DrawPointerState = { x: null, y: null, visible: false, gesture: 'NONE', hand: null };

  /** Idempotent — safe to call from every component that wants Air Draw's
   *  gesture pointer. */
  start(): void {
    if (this.started) return;
    this.started = true;
    ensureGestureBridgeStarted();
    this.syncFilterParams();
    appStore.subscribe(() => this.handleAppStoreChange());
    visionEngine.subscribe((frame) => this.handleFrame(frame));
  }

  private syncFilterParams(): void {
    const { cursorMinCutoff, cursorBeta } = appStore.get().settings;
    this.filter.setParams(cursorMinCutoff, cursorBeta);
  }

  private handleAppStoreChange(): void {
    this.syncFilterParams();

    const { inputSource, cameraState } = appStore.get();
    if (inputSource === this.lastInputSource && cameraState === this.lastCameraState) return;
    this.lastInputSource = inputSource;
    this.lastCameraState = cameraState;

    // Same gap CursorEngine/StudioEngine/gestureBridge all guard against:
    // switching sources (or the camera stopping) can mean no more frames
    // arrive for a while, or ever — without this, the pointer would freeze
    // in place instead of disappearing, and DrawCanvas would keep painting
    // from a stale position. See bugs #2/#8 in CLAUDE.md.
    this.handleHandLost();
  }

  private pickPrimaryHand(
    frame: VisionFrame,
    results: GestureResult[],
  ): { hand: HandObservation; gesture: GestureResult } | null {
    if (frame.hands.length === 0) return null;

    const pairs = frame.hands
      .map((hand) => ({ hand, gesture: results.find((r) => r.hand === hand.handedness) }))
      .filter((p): p is { hand: HandObservation; gesture: GestureResult } => p.gesture !== undefined);
    if (pairs.length === 0) return null;

    // Sticky primary hand — same reasoning as CursorEngine.pickPrimaryHand:
    // keep using the same hand across frames rather than flopping between
    // two hands whenever both are in view.
    if (this.preferredHandedness) {
      const sticky = pairs.find((p) => p.hand.handedness === this.preferredHandedness);
      if (sticky) return sticky;
    }

    const active = pairs.find((p) => p.gesture.gesture !== 'NONE');
    const chosen = active ?? pairs[0]!;
    this.preferredHandedness = chosen.hand.handedness;
    return chosen;
  }

  private handleFrame(frame: VisionFrame): void {
    const primary = this.pickPrimaryHand(frame, getLatestGestureResults());
    if (!primary) {
      this.handleHandLost();
      return;
    }

    this.wasHandVisible = true;
    const { hand, gesture } = primary;

    const tip = mirrorLandmark(hand.landmarks[8]!); // index fingertip — same convention as Cursor/Studio
    const mapped = mapThroughReachBox(tip, getReachBox());
    const filtered = this.filter.filter(mapped, frame.timestamp / 1000);

    this.latest = {
      x: filtered.x,
      y: filtered.y,
      visible: true,
      gesture: gesture.gesture,
      hand: hand.handedness,
    };
  }

  private handleHandLost(): void {
    if (this.wasHandVisible) {
      this.filter.reset();
      this.preferredHandedness = null;
    }
    this.wasHandVisible = false;
    this.latest = { x: null, y: null, visible: false, gesture: 'NONE', hand: null };
  }
}

/** Singleton — one Draw interaction pipeline for the whole app, same
 *  reasoning as `cursorEngine`/`studioEngine`. */
export const drawEngine = new DrawEngineImpl();
