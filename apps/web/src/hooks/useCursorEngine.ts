import { useEffect } from 'react';
import { cursorEngine } from '@/interaction/cursor/CursorEngine';

/** Starts the cursor engine (idempotent, see CursorEngine.start). Call
 *  from any module that wants a working Air Cursor. */
export function useCursorEngine(): void {
  useEffect(() => {
    cursorEngine.start();
  }, []);
}
