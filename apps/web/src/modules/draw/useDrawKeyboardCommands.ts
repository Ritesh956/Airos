import { useEffect } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { clear, redo, undo } from './drawStrokes';

/**
 * Keyboard parity for Undo/Redo/Clear — the same rationale as
 * `useStudioKeyboardCommands.ts` (IMPLEMENTATION.md §1.6): a camera isn't
 * required to fully use this module. Unlike Studio's per-object nudges,
 * these three aren't gesture-driven at all (no pose maps to "undo"), so
 * this is purely about keyboard being a first-class input, not a stand-in
 * for a missing gesture.
 *
 * Single-key bindings only, per `useGlobalKeyboardCommands`'s own
 * constraint (it ignores Ctrl/Cmd/Alt chords) — 'z'/'y' rather than the
 * Ctrl+Z/Ctrl+Shift+Z a desktop app would use.
 */
export function useDrawKeyboardCommands(): void {
  useEffect(() => {
    const unregisters = [
      commandRouter.register({
        id: 'draw.undo',
        title: 'Undo Last Stroke',
        phrases: ['undo'],
        keys: ['z'],
        category: 'Air Draw',
        run: undo,
      }),
      commandRouter.register({
        id: 'draw.redo',
        title: 'Redo Last Stroke',
        phrases: ['redo'],
        keys: ['y'],
        category: 'Air Draw',
        run: redo,
      }),
      commandRouter.register({
        id: 'draw.clear',
        title: 'Clear Canvas',
        phrases: ['clear canvas', 'clear drawing'],
        keys: ['c'],
        category: 'Air Draw',
        run: clear,
      }),
    ];

    return () => unregisters.forEach((fn) => fn());
  }, []);
}
