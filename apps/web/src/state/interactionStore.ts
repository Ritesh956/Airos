import { createStore } from './createStore';
import type { GestureKind } from '@/gestures/types';
import type { Handedness, Method } from '@/vision/types';

export type TrackingState = 'idle' | 'tracking' | 'lost';

export interface CursorState {
  /** Viewport pixels. Null when no hand is tracked. */
  x: number | null;
  y: number | null;
  visible: boolean;
  dragging: boolean;
}

export interface ActiveGesture {
  gesture: GestureKind;
  confidence: number;
  method: Method;
}

/** One entry in the Gesture Lab's timeline — a transition *into* a new
 *  stable gesture, not a per-frame sample (see gestureBridge.ts, which is
 *  the only writer). */
export interface GestureHistoryEntry {
  gesture: GestureKind;
  confidence: number;
  method: Method;
  hand: Handedness;
  /** performance.now() at the frame that produced this result — matches
   *  GestureResult.timestamp, convert via performance.timeOrigin for a
   *  wall-clock display (see utils/format.ts's formatClockTime). */
  timestamp: number;
}

const GESTURE_HISTORY_LIMIT = 50;

/**
 * Interaction-layer state — the output of interaction/, consumed by
 * modules. Distinct from visionStore (raw tracking presence) and appStore
 * (which module is active). See IMPLEMENTATION.md §5.
 */
export interface InteractionState {
  cursor: CursorState;
  activeGesture: ActiveGesture | null;
  trackingState: TrackingState;
  selectedObjectId: string | null;
  /** Newest first, bounded ring buffer. Gesture Lab's timeline (Phase 5). */
  gestureHistory: GestureHistoryEntry[];
}

export const interactionStore = createStore<InteractionState>({
  cursor: { x: null, y: null, visible: false, dragging: false },
  activeGesture: null,
  trackingState: 'idle',
  selectedObjectId: null,
  gestureHistory: [],
});

export function setTrackingState(state: TrackingState): void {
  interactionStore.update({ trackingState: state });
}

export function setActiveGesture(gesture: ActiveGesture | null): void {
  interactionStore.update({ activeGesture: gesture });
}

export function setCursor(patch: Partial<CursorState>): void {
  interactionStore.update({ cursor: { ...interactionStore.get().cursor, ...patch } });
}

/** 3D Studio (Phase 6): which scene object is currently selected, if any.
 *  Written by both the gesture-driven raycast and the mouse/keyboard
 *  fallback paths — a single source of truth for "what's selected" that
 *  any module can read reactively via interactionStore. */
export function setSelectedObjectId(id: string | null): void {
  interactionStore.update({ selectedObjectId: id });
}

export function appendGestureHistory(entry: GestureHistoryEntry): void {
  const next = [entry, ...interactionStore.get().gestureHistory].slice(0, GESTURE_HISTORY_LIMIT);
  interactionStore.update({ gestureHistory: next });
}

export function clearGestureHistory(): void {
  interactionStore.update({ gestureHistory: [] });
}

export function resetInteractionStore(): void {
  interactionStore.set({
    cursor: { x: null, y: null, visible: false, dragging: false },
    activeGesture: null,
    trackingState: 'idle',
    selectedObjectId: null,
    gestureHistory: [],
  });
}
