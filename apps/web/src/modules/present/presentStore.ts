import { createStore } from '@/state/createStore';
import { SLIDES } from './slides';

export interface PresentState {
  slideIndex: number;
  isTimerRunning: boolean;
  /** performance.now() when the current run segment started; null while paused. */
  runStartedAt: number | null;
  /** Elapsed time banked from *previous* run segments — frozen while paused. */
  accumulatedMs: number;
  /** The gesture-legend overlay, toggled by OPEN_PALM (or its mouse/keyboard
   *  equivalents) — see usePresentGestureCommands.ts. */
  showLegend: boolean;
  showNotes: boolean;
}

export const presentStore = createStore<PresentState>({
  slideIndex: 0,
  isTimerRunning: false,
  runStartedAt: null,
  accumulatedMs: 0,
  showLegend: false,
  showNotes: false,
});

// --- Pure logic, unit-tested directly (presentStore.test.ts) ---------------
// Same reasoning as drawStrokes.ts / pinchDragTracker.ts: timing and bounds
// math is worth testing in isolation, without a real store, a real
// setInterval, or a real clock.

export function clampSlideIndex(index: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index));
}

export interface TimerState {
  isTimerRunning: boolean;
  runStartedAt: number | null;
  accumulatedMs: number;
}

/** The live elapsed time for a given timer state at a given instant —
 *  banked time plus whatever's accrued in the current run segment, or just
 *  banked time while paused. */
export function computeElapsedMs(state: TimerState, now: number): number {
  if (state.isTimerRunning && state.runStartedAt !== null) {
    return state.accumulatedMs + (now - state.runStartedAt);
  }
  return state.accumulatedMs;
}

export function applyStartTimer(state: TimerState, now: number): Partial<PresentState> {
  if (state.isTimerRunning) return {};
  return { isTimerRunning: true, runStartedAt: now };
}

export function applyPauseTimer(state: TimerState, now: number): Partial<PresentState> {
  if (!state.isTimerRunning) return {};
  return { isTimerRunning: false, runStartedAt: null, accumulatedMs: computeElapsedMs(state, now) };
}

export function applyResetTimer(): Partial<PresentState> {
  return { isTimerRunning: false, runStartedAt: null, accumulatedMs: 0 };
}

// --- Store-mutating actions --------------------------------------------

export function nextSlide(): void {
  const { slideIndex } = presentStore.get();
  presentStore.update({ slideIndex: clampSlideIndex(slideIndex + 1, SLIDES.length) });
}

export function prevSlide(): void {
  const { slideIndex } = presentStore.get();
  presentStore.update({ slideIndex: clampSlideIndex(slideIndex - 1, SLIDES.length) });
}

export function goToSlide(index: number): void {
  presentStore.update({ slideIndex: clampSlideIndex(index, SLIDES.length) });
}

// The timer only needs a ~4Hz UI tick while running (a human reads seconds,
// not frames) — this is a plain setInterval, not a rAF hot loop, matching
// how little this needs to cost. It exists independently of any mounted
// component, same reasoning as drawStrokes/studioTransforms persisting
// across navigation: pausing to switch modules shouldn't reset the clock.
let tickInterval: ReturnType<typeof setInterval> | null = null;

function ensureTicking(): void {
  if (tickInterval) return;
  // An empty patch still notifies subscribers (see state/createStore.ts) —
  // this is purely "wake up any component reading getElapsedMs() so the
  // displayed number keeps advancing," not a real state change itself.
  tickInterval = setInterval(() => presentStore.update({}), 250);
}

function stopTicking(): void {
  if (!tickInterval) return;
  clearInterval(tickInterval);
  tickInterval = null;
}

export function startTimer(now: number = performance.now()): void {
  presentStore.update(applyStartTimer(presentStore.get(), now));
  ensureTicking();
}

export function pauseTimer(now: number = performance.now()): void {
  presentStore.update(applyPauseTimer(presentStore.get(), now));
  stopTicking();
}

export function resetTimer(): void {
  presentStore.update(applyResetTimer());
  stopTicking();
}

export function getElapsedMs(now: number = performance.now()): number {
  return computeElapsedMs(presentStore.get(), now);
}

export function toggleLegend(): void {
  presentStore.update({ showLegend: !presentStore.get().showLegend });
}

export function toggleNotes(): void {
  presentStore.update({ showNotes: !presentStore.get().showNotes });
}
