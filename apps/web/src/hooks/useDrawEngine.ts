import { useEffect } from 'react';
import { drawEngine } from '@/interaction/draw/DrawEngine';

/** Starts the Draw engine (idempotent, see DrawEngine.start). Call from the
 *  Air Draw module. */
export function useDrawEngine(): void {
  useEffect(() => {
    drawEngine.start();
  }, []);
}
