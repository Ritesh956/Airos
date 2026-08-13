import { visionEngine } from '@/vision/engine/VisionEngine';
import { ensureGestureBridgeStarted, getLatestGestureResults } from '@/interaction/gestureBridge';
import type { GestureKind, GestureResult } from '@/gestures/types';
import type { Handedness, HandObservation, VisionFrame } from '@/vision/types';
import { mirrorLandmark } from '@/utils/coords';
import { appStore } from '@/state/appStore';
import { getReachBox, mapThroughReachBox } from '@/interaction/cursor/calibration';
import { Point2DFilter } from '@/interaction/cursor/OneEuroFilter';

/**
 * The Interaction Engine stage for Game Mode (Phase 12) — same role
 * `CursorEngine` plays for Air Cursor, `StudioEngine` for 3D Studio, and
 * `DrawEngine` for Air Draw (see docs/ARCHITECTURE.md's "Interaction
 * Engine" section). Structurally a copy of `DrawEngine.ts`, deliberately:
 * it only answers "where is the hand pointing, normalized, and what
 * gesture is it making" — no idea a ship, an enemy, or a projectile
 * exists. Turning that into gameplay is `modules/game/GameCanvas.tsx`'s
 * job, the same split every prior module holds itself to.
 *
 * Reuses the same calibrated reach-box mapping and One-Euro filter every
 * other pointer-driven module uses (`interaction/cursor/calibration.ts`,
 * `interaction/cursor/OneEuroFilter.ts`) rather than a fourth copy of the
 * same smoothing problem.
 */

export interface GamePointerState {
  /** Normalized [0,1], mirrored + reach-boxed — canvas-space (fraction of
   *  the game canvas's own width), not viewport space, same convention
   *  DrawPointerState uses for the draw canvas. */
  x: number | null;
  y: number | null;
  visible: boolean;
  gesture: GestureKind;
  hand: Handedness | null;
}

class GameEngineImpl {
  private filter = new Point2DFilter();
  private preferredHandedness: Handedness | null = null;
  private wasHandVisible = false;
  private started = false;

  private lastInputSource = appStore.get().inputSource;
  private lastCameraState = appStore.get().cameraState;

  latest: GamePointerState = { x: null, y: null, visible: false, gesture: 'NONE', hand: null };

  /** Idempotent — safe to call from every component that wants Game Mode's
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

    // Same gap CursorEngine/StudioEngine/DrawEngine/gestureBridge all guard
    // against: switching sources (or the camera stopping) can mean no more
    // frames arrive for a while, or ever — without this, the pointer would
    // freeze in place instead of disappearing. See bugs #2/#8 in CLAUDE.md.
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

    // Sticky primary hand — same reasoning as CursorEngine/DrawEngine.
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

    const tip = mirrorLandmark(hand.landmarks[8]!); // index fingertip — same convention as Cursor/Studio/Draw
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

/** Singleton — one Game Mode interaction pipeline for the whole app, same
 *  reasoning as `cursorEngine`/`studioEngine`/`drawEngine`. */
export const gameEngine = new GameEngineImpl();
