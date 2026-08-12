import { visionEngine } from '@/vision/engine/VisionEngine';
import { ensureGestureBridgeStarted, getLatestGestureResults } from '@/interaction/gestureBridge';
import type { GestureResult } from '@/gestures/types';
import type { Handedness, HandObservation, VisionFrame } from '@/vision/types';
import { mirrorLandmark } from '@/utils/coords';
import { appStore } from '@/state/appStore';
import { setCursor } from '@/state/interactionStore';
import { throttle } from '@/state/createStore';
import { getReachBox, mapThroughReachBox } from './calibration';
import { Point2DFilter } from './OneEuroFilter';
import { PinchDragTracker } from './pinchDragTracker';
import {
  dispatchSyntheticPointerDown,
  dispatchSyntheticPointerMove,
  dispatchSyntheticPointerUp,
} from './syntheticPointer';

/**
 * Turns a tracked hand into an actual on-screen pointer: the Interaction
 * Engine stage of IMPLEMENTATION.md §3's pipeline, specific to the cursor.
 * Gesture mapping (brief's "2. AIR CURSOR" section):
 *   POINT      -> move the cursor
 *   PINCH      -> click (quick tap) or drag (held / moved while pinching)
 *   OPEN_PALM  -> pause tracking; releases a click/drag in progress
 *   FIST       -> "grab": also pauses movement, kept as a distinct
 *                 reported state from OPEN_PALM since the brief lists them
 *                 separately, even though the cursor behavior (freeze in
 *                 place) is the same for both here — a fuller "grab this
 *                 object" interaction is 3D Studio's job in Phase 6, where
 *                 FIST has something specific (a scene object) to grab.
 * Anything else (PEACE, THUMBS_*, a swipe, no hand) pauses too, as a safe
 * default rather than guessing what an unrelated gesture should do to a
 * cursor mid-click.
 *
 * OPEN_PALM's release isn't a separate code path: PINCH and every other
 * gesture are mutually exclusive by the time GestureEngine reports one, so
 * PinchDragTracker's normal "stopped pinching while a drag was active"
 * transition already fires the instant OPEN_PALM (or anything else)
 * replaces PINCH.
 */

export interface CursorHotState {
  x: number | null;
  y: number | null;
  visible: boolean;
  dragging: boolean;
  gesture: GestureResult['gesture'];
  confidence: number;
  hand: Handedness | null;
}

const SUMMARY_PUBLISH_INTERVAL_MS = 100; // matches visionStore/gestureBridge's cold-path rate

class CursorEngineImpl {
  private filter = new Point2DFilter();
  private pinchTracker = new PinchDragTracker();
  private listeners = new Set<() => void>();

  private preferredHandedness: Handedness | null = null;
  private wasHandVisible = false;

  private dragTarget: Element | null = null;

  latest: CursorHotState = {
    x: null,
    y: null,
    visible: false,
    dragging: false,
    gesture: 'NONE',
    confidence: 0,
    hand: null,
  };

  private started = false;

  private lastInputSource = appStore.get().inputSource;
  private lastCameraState = appStore.get().cameraState;

  /** Idempotent — safe to call from every component that wants a cursor. */
  start(): void {
    if (this.started) return;
    this.started = true;
    ensureGestureBridgeStarted();
    this.syncFilterParams();
    appStore.subscribe(() => this.handleAppStoreChange());
    visionEngine.subscribe((frame) => this.handleFrame(frame));
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
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

    // Same gap gestureBridge guards against: switching sources (or the
    // camera stopping) can mean no more frames arrive for a while, or
    // ever — without this, the cursor would freeze in place showing a
    // stale position/gesture as if still current rather than hiding.
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

    // Sticky: once a hand is "the" cursor hand, keep using it across
    // frames as long as it's still visible, rather than flopping between
    // hands every frame two are in view.
    if (this.preferredHandedness) {
      const sticky = pairs.find((p) => p.hand.handedness === this.preferredHandedness);
      if (sticky) return sticky;
    }

    // New primary hand needed: prefer one that's actively gesturing over
    // one just sitting in frame doing nothing recognizable.
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

    const tip = mirrorLandmark(hand.landmarks[8]!); // index fingertip, always — see module doc
    const boxMapped = mapThroughReachBox(tip, getReachBox());
    const filtered = this.filter.filter(boxMapped, frame.timestamp / 1000);
    const pixels = { x: filtered.x * window.innerWidth, y: filtered.y * window.innerHeight };

    const isMoving = gesture.gesture === 'POINT' || gesture.gesture === 'PINCH';
    if (isMoving) {
      this.latest.x = pixels.x;
      this.latest.y = pixels.y;
    }
    // Anything else: cursor freezes at its last position rather than
    // jumping to wherever a curled fist happens to be.

    this.latest.visible = true;
    this.latest.gesture = gesture.gesture;
    this.latest.confidence = gesture.confidence;
    this.latest.hand = hand.handedness;

    // Note this runs every frame regardless of gesture, not just while
    // pinching: PinchDragTracker's own "isPinching flips false while
    // active" branch is what releases a drag/click the instant OPEN_PALM
    // (or anything else) replaces PINCH — no separate OPEN_PALM special
    // case needed here, since PINCH and every other gesture are already
    // mutually exclusive by the time GestureEngine reports one.
    this.updatePinchState(gesture.gesture === 'PINCH', frame.timestamp, filtered, pixels);

    this.publish();
  }

  private updatePinchState(
    isPinching: boolean,
    timestampMs: number,
    normalizedPos: { x: number; y: number },
    pixels: { x: number; y: number },
  ): void {
    // The click/drag *decision* runs on normalized coordinates
    // (resolution-independent — see pinchDragTracker.ts); dispatching to
    // the DOM needs real viewport pixels, which is all `pixels` is used
    // for below.
    const action = this.pinchTracker.update(isPinching, timestampMs, normalizedPos);

    switch (action.type) {
      case 'start':
        this.dragTarget = dispatchSyntheticPointerDown(pixels.x, pixels.y);
        this.latest.dragging = false; // not committed to click-vs-drag yet
        return;
      case 'move':
        if (this.dragTarget) dispatchSyntheticPointerMove(this.dragTarget, pixels.x, pixels.y);
        return;
      case 'commit-drag':
        if (this.dragTarget) dispatchSyntheticPointerMove(this.dragTarget, pixels.x, pixels.y);
        this.latest.dragging = true;
        return;
      case 'release-click':
        if (this.dragTarget) dispatchSyntheticPointerUp(this.dragTarget, pixels.x, pixels.y, true);
        this.dragTarget = null;
        this.latest.dragging = false;
        return;
      case 'release-drag':
        if (this.dragTarget) dispatchSyntheticPointerUp(this.dragTarget, pixels.x, pixels.y, false);
        this.dragTarget = null;
        this.latest.dragging = false;
        return;
      case 'idle':
        return;
    }
  }

  private resetPinchTracking(): void {
    this.dragTarget = null;
    this.pinchTracker.reset();
  }

  private handleHandLost(): void {
    if (this.wasHandVisible) {
      if (this.dragTarget) {
        dispatchSyntheticPointerUp(this.dragTarget, this.latest.x ?? 0, this.latest.y ?? 0, false);
      }
      this.resetPinchTracking();
      this.filter.reset();
      this.preferredHandedness = null;
    }
    this.wasHandVisible = false;
    this.latest = { x: null, y: null, visible: false, dragging: false, gesture: 'NONE', confidence: 0, hand: null };
    // publish() below goes through the same throttled publishCursorSummary
    // used every frame, which correctly overwrites any pending trailing
    // call's arguments — but cancel explicitly anyway rather than relying
    // on that being obvious from a distance (visionStore's and
    // gestureBridge's equivalent resets both write to their store
    // directly and need the cancel for exactly this reason).
    publishCursorSummary.cancel();
    this.publish();
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
    publishCursorSummary(this.latest);
  }
}

const publishCursorSummary = throttle((state: CursorHotState) => {
  setCursor({ x: state.x, y: state.y, visible: state.visible, dragging: state.dragging });
}, SUMMARY_PUBLISH_INTERVAL_MS);

export const cursorEngine = new CursorEngineImpl();
