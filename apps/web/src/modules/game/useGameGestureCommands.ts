import { useEffect, useRef } from 'react';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import type { GestureKind } from '@/gestures/types';
import { pause, startOrResume } from './gameState';

/**
 * THUMBS_UP starts/resumes, FIST pauses — the same held-pose
 * value-transition edge detection (and the same "seed from whatever's
 * already live in the store, not a fixed `NONE`" mount-safety)
 * `usePresentGestureCommands.ts` established first; reused here rather
 * than reinvented, and a deliberate cross-module consistency: the same
 * two gestures mean the same two things in both Presentation and Game
 * Mode. PINCH (fire) and OPEN_PALM (shield) are NOT handled here —
 * `GameCanvas.tsx` reads those directly from `GameEngine`'s per-frame
 * pointer instead. A reflex-driven shooter needs firing to feel
 * immediate; routing it through this store's ~100ms throttle would add
 * latency a "start the round" action doesn't need to avoid.
 */
export function useGameGestureCommands(): void {
  const activeGesture = useActiveGesture();
  const lastKindRef = useRef<GestureKind>(activeGesture?.gesture ?? 'NONE');

  useEffect(() => {
    const kind = activeGesture?.gesture ?? 'NONE';
    if (kind === lastKindRef.current) return;
    lastKindRef.current = kind;

    if (kind === 'THUMBS_UP') startOrResume();
    else if (kind === 'FIST') pause();
  }, [activeGesture]);
}
