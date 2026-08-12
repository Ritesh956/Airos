import { useEffect } from 'react';
import { ensureGestureBridgeStarted } from '@/interaction/gestureBridge';
import { interactionStore, type ActiveGesture } from '@/state/interactionStore';
import { useStoreSelector } from './useStore';

/**
 * Starts the gesture pipeline (idempotent — cheap to call from every
 * module that wants gesture data, see gestureBridge.ts) and returns the
 * current primary-hand gesture, re-rendering only when it actually
 * changes.
 */
export function useActiveGesture(): ActiveGesture | null {
  useEffect(() => {
    ensureGestureBridgeStarted();
  }, []);

  return useStoreSelector(interactionStore, (state) => state.activeGesture);
}
