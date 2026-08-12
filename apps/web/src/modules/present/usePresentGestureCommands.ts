import { useEffect, useRef } from 'react';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import type { GestureKind } from '@/gestures/types';
import type { ActiveGesture } from '@/state/interactionStore';
import { nextSlide, pauseTimer, prevSlide, startTimer, toggleLegend } from './presentStore';

/**
 * Turns already-classified gestures into presentation actions. No
 * `interaction/present/` engine exists for this phase — unlike Cursor,
 * Studio, and Draw, Presentation needs no per-frame fingertip position at
 * all, only the already-throttled `interactionStore.activeGesture` channel
 * every other module already publishes into. Adding a hot-path engine here
 * would be complexity with nothing to spend it on.
 *
 * Two genuinely different pieces of logic live in this one effect, because
 * swipes and held poses need different edge-detection:
 *
 * - **Swipes** (SWIPE_LEFT/RIGHT) are one-shot events — `gestureBridge.ts`
 *   publishes a swipe exactly once per detection (bug #4: unthrottled,
 *   bypasses the throttle that sustained poses go through) and never
 *   republishes the same occurrence. So *every* new `activeGesture`
 *   publish whose kind is a swipe is a real, distinct event — including
 *   two consecutive swipes in the same direction, which is exactly the
 *   "no double-fires... but also no missed-fires" the phase gate asks for.
 *   `useActiveGesture()` already gives this for free: it's backed by
 *   `useStoreSelector` with `Object.is` on the *object itself* (not a
 *   narrowed field), and `setActiveGesture` constructs a fresh object
 *   literal on every call — so a changed reference already means "a new
 *   publish just happened," regardless of whether the value repeats.
 *
 * - **Held poses** (THUMBS_UP starts the timer, FIST pauses it, OPEN_PALM
 *   toggles the legend) are throttled, *sustained* state — `gestureBridge`
 *   republishes the same still-held pose roughly every 100ms for as long
 *   as it's held, each a fresh object. Reacting to every reference change
 *   the way swipes do would fire `toggleLegend()` ~10 times a second while
 *   a palm stays open, which is a strobing-toggle bug, not a feature. This
 *   needs true *value*-transition detection: only act the instant the
 *   gesture *kind* changes into the target pose, then ignore repeats until
 *   it changes to something else and back.
 *
 * Both trackers are seeded from whatever `interactionStore.activeGesture`
 * already holds on mount, not `null`/`'NONE'` — that store is a global
 * singleton that outlives any one module, so a visitor arriving at
 * Presentation from Cursor or Studio can find a stale gesture already
 * sitting there. Seeding the baseline from the live value (rather than a
 * fixed `null`) means the effect's first run always sees an unchanged
 * reference and exits without acting — only a *new* publish after mount
 * can ever trigger an action; a pre-existing stale one can't cause a
 * spurious slide change or timer start the moment this module mounts.
 */
export function usePresentGestureCommands(): void {
  const activeGesture = useActiveGesture();

  const lastGestureRef = useRef<ActiveGesture | null>(activeGesture);
  const lastKindRef = useRef<GestureKind>(activeGesture?.gesture ?? 'NONE');

  useEffect(() => {
    if (activeGesture === lastGestureRef.current) return;
    lastGestureRef.current = activeGesture;
    const kind = activeGesture?.gesture ?? 'NONE';

    if (kind === 'SWIPE_LEFT') nextSlide();
    else if (kind === 'SWIPE_RIGHT') prevSlide();

    if (kind !== lastKindRef.current) {
      if (kind === 'THUMBS_UP') startTimer();
      else if (kind === 'FIST') pauseTimer();
      else if (kind === 'OPEN_PALM') toggleLegend();
      lastKindRef.current = kind;
    }
  }, [activeGesture]);
}
