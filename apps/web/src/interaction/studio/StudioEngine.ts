import { visionEngine } from '@/vision/engine/VisionEngine';
import { ensureGestureBridgeStarted, getLatestGestureResults } from '@/interaction/gestureBridge';
import type { GestureResult } from '@/gestures/types';
import type { Handedness, HandObservation, VisionFrame } from '@/vision/types';
import { mirrorLandmark } from '@/utils/coords';
import { appStore } from '@/state/appStore';
import { interactionStore, type TrackingState } from '@/state/interactionStore';
import { getReachBox, mapThroughReachBox } from '@/interaction/cursor/calibration';

/**
 * Turns tracked hands into the raycasting pointer(s) 3D Studio needs — the
 * Interaction Engine stage for Phase 6, same role `CursorEngine` plays for
 * Air Cursor (see docs/ARCHITECTURE.md's "Interaction Engine" section), but
 * deliberately lighter and framework-agnostic: it has no idea a `<Canvas>`
 * or a `THREE.Raycaster` exists. Raycasting needs `camera`/`scene`, which
 * only exist inside the R3F render tree, so that half of the work belongs
 * in `modules/studio/StudioScene.tsx`'s own per-frame loop — this engine's
 * only job is "where is each hand pointing, in normalized device
 * coordinates, and is it pinching."
 *
 * Reuses the same calibrated reach-box mapping Air Cursor uses
 * (`interaction/cursor/calibration.ts`) rather than inventing a second
 * calibration flow — one calibration a user does once benefits both
 * modules.
 *
 * Unlike `CursorEngine`, this has no `subscribe()`/listener list: R3F's
 * own `useFrame` already ticks every rendered frame, so `StudioScene` just
 * reads `studioEngine.latest` directly each frame rather than needing a
 * push notification.
 */

export interface HandPointer {
  /** Normalized device coordinates, Three.js convention: [-1, 1], +y up. */
  ndcX: number;
  ndcY: number;
  /** The same point pre-NDC, reach-boxed normalized [0,1] — what the
   *  two-hand scale/rotate math (twoHandGesture.ts) operates on, since it
   *  just needs a consistent 2D point, not specifically NDC. */
  x: number;
  y: number;
  pinching: boolean;
  hand: Handedness;
}

export interface StudioPointerState {
  primary: HandPointer | null;
  secondary: HandPointer | null;
}

type HandPair = { hand: HandObservation; gesture: GestureResult };

class StudioEngineImpl {
  private preferredPrimary: Handedness | null = null;
  private preferredSecondary: Handedness | null = null;

  latest: StudioPointerState = { primary: null, secondary: null };

  private started = false;
  private lastInputSource = appStore.get().inputSource;
  private lastCameraState = appStore.get().cameraState;
  private lastTrackingState: TrackingState = interactionStore.get().trackingState;

  /** Idempotent — safe to call from every component that wants Studio's
   *  gesture pointers. */
  start(): void {
    if (this.started) return;
    this.started = true;
    ensureGestureBridgeStarted();
    appStore.subscribe(() => this.handleAppStoreChange());
    interactionStore.subscribe(() => this.handleInteractionStoreChange());
    visionEngine.subscribe((frame) => this.handleFrame(frame));
  }

  private handleAppStoreChange(): void {
    const { inputSource, cameraState } = appStore.get();
    if (inputSource === this.lastInputSource && cameraState === this.lastCameraState) return;
    this.lastInputSource = inputSource;
    this.lastCameraState = cameraState;
    // Same gap CursorEngine/gestureBridge guard against: switching sources
    // (or the camera stopping) can mean no more frames arrive for a while,
    // or ever — without this, a pointer/pinch state would freeze in place
    // instead of disappearing, and a scene object could be left mid-drag
    // forever. See bugs #2/#8 in CLAUDE.md.
    this.resetTracking();
  }

  /**
   * A second, distinct reset trigger from `handleAppStoreChange` — this
   * engine can outlive the hand task it depends on the same way
   * `CursorEngine` can (see that class's identically-named method for the
   * full explanation): navigating away from 3D Studio releases the hand
   * task without necessarily changing `inputSource`/`cameraState`, so
   * `VisionEngine.recompute()` tears its source down and stops calling
   * `handleFrame` forever with nothing for `handleAppStoreChange` to
   * notice. Without this, returning to Studio resumes with `latest` exactly
   * as it was mid-pinch when the task was released —
   * `StudioScene.tsx`'s `useFrame` loop reads that stale pinching pointer
   * on its very first tick back and can grab whatever object it's still
   * hovering, mid-air, with no gesture behind it.
   * `interactionStore.trackingState` becomes `'idle'` at exactly the moment
   * recompute() tears the source down, so watching it here catches the gap
   * `handleAppStoreChange` can't — CLAUDE.md bug #8's lesson, applied here.
   */
  private handleInteractionStoreChange(): void {
    const { trackingState } = interactionStore.get();
    if (trackingState === this.lastTrackingState) return;
    this.lastTrackingState = trackingState;
    if (trackingState === 'idle') this.resetTracking();
  }

  private resetTracking(): void {
    this.preferredPrimary = null;
    this.preferredSecondary = null;
    this.latest = { primary: null, secondary: null };
  }

  private pickHands(frame: VisionFrame, results: GestureResult[]): { primary: HandPair | null; secondary: HandPair | null } {
    const pairs = frame.hands
      .map((hand) => ({ hand, gesture: results.find((r) => r.hand === hand.handedness) }))
      .filter((p): p is HandPair => p.gesture !== undefined);

    if (pairs.length === 0) {
      this.preferredPrimary = null;
      this.preferredSecondary = null;
      return { primary: null, secondary: null };
    }

    // Sticky primary, same reasoning as CursorEngine.pickPrimaryHand: keep
    // using the same hand across frames rather than flopping between two
    // hands whenever both are in view.
    let primary = this.preferredPrimary ? pairs.find((p) => p.hand.handedness === this.preferredPrimary) : undefined;
    if (!primary) {
      const active = pairs.find((p) => p.gesture.gesture !== 'NONE');
      primary = active ?? pairs[0]!;
      this.preferredPrimary = primary.hand.handedness;
    }

    // Sticky secondary: whichever other hand is present, once assigned,
    // keeps that identity too — stability matters here more than for the
    // cursor's single hand, since the two-hand gesture's rotation sign
    // depends on which hand is "a" and which is "b" staying consistent
    // frame to frame.
    const rest = pairs.filter((p) => p.hand.handedness !== primary!.hand.handedness);
    let secondary = this.preferredSecondary ? rest.find((p) => p.hand.handedness === this.preferredSecondary) : undefined;
    if (!secondary) secondary = rest[0];
    this.preferredSecondary = secondary ? secondary.hand.handedness : null;

    return { primary, secondary: secondary ?? null };
  }

  private toPointer(pair: HandPair): HandPointer {
    // Index fingertip — same landmark Air Cursor uses, for a consistent
    // "where is this hand pointing" convention across the app.
    const tip = mirrorLandmark(pair.hand.landmarks[8]!);
    const mapped = mapThroughReachBox(tip, getReachBox());
    return {
      x: mapped.x,
      y: mapped.y,
      ndcX: mapped.x * 2 - 1,
      ndcY: -(mapped.y * 2 - 1),
      pinching: pair.gesture.gesture === 'PINCH',
      hand: pair.hand.handedness,
    };
  }

  private handleFrame(frame: VisionFrame): void {
    const { primary, secondary } = this.pickHands(frame, getLatestGestureResults());
    this.latest = {
      primary: primary ? this.toPointer(primary) : null,
      secondary: secondary ? this.toPointer(secondary) : null,
    };
  }
}

/** Singleton — one Studio interaction pipeline for the whole app, same
 *  reasoning as `cursorEngine`/`visionEngine`. */
export const studioEngine = new StudioEngineImpl();
