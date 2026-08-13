import { useEffect } from 'react';
import { gameEngine } from '@/interaction/game/GameEngine';

/** Starts the Game Mode engine (idempotent, see GameEngine.start). Call
 *  from the Game Mode module. */
export function useGameEngine(): void {
  useEffect(() => {
    gameEngine.start();
  }, []);
}
