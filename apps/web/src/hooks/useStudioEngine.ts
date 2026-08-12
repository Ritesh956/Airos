import { useEffect } from 'react';
import { studioEngine } from '@/interaction/studio/StudioEngine';

/** Starts the Studio engine (idempotent, see StudioEngine.start). Call from
 *  the 3D Studio module. */
export function useStudioEngine(): void {
  useEffect(() => {
    studioEngine.start();
  }, []);
}
