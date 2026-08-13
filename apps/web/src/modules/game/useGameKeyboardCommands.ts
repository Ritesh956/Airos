import { useEffect } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { pause, restart, startOrResume } from './gameState';

/**
 * Keyboard parity for the discrete, contextual actions (IMPLEMENTATION.md
 * §1.6) — the same 's'/'p'/'r' bindings Presentation uses for its
 * timer, another deliberate cross-module consistency. Fire and shield are
 * intentionally absent from this registry: they're continuous/reflex
 * actions (Space/click to fire, Shift to hold the shield), wired directly
 * in `GameCanvas.tsx` the same way that module's mouse-drag listeners
 * bypass the router — `CommandRouter` models one-shot commands, not a
 * held key, so forcing them through it would either misrepresent the
 * behavior or need a discrete stand-in that isn't what the game plays
 * like. They're still fully available without a camera (documented in
 * the module's own instructions), just not through this registry.
 */
export function useGameKeyboardCommands(): void {
  useEffect(() => {
    const unregisters = [
      commandRouter.register({
        id: 'game.start',
        title: 'Start / Resume Game',
        phrases: ['start game', 'resume game'],
        keys: ['s'],
        category: 'Game',
        run: startOrResume,
      }),
      commandRouter.register({
        id: 'game.pause',
        title: 'Pause Game',
        phrases: ['pause game'],
        keys: ['p'],
        category: 'Game',
        run: pause,
      }),
      commandRouter.register({
        id: 'game.restart',
        title: 'Restart Game',
        phrases: ['restart game'],
        keys: ['r'],
        category: 'Game',
        run: restart,
      }),
    ];

    return () => unregisters.forEach((fn) => fn());
  }, []);
}
