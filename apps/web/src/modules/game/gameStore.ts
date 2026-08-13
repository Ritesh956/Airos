import { createStore } from '@/state/createStore';
import type { GameStatus } from './gameSimulation';

/**
 * Game Mode's cold-path summary — the small set of fields the HUD
 * actually re-renders on (score, lives, status, best score). Ship/enemy/
 * projectile positions are hot-path data that changes every animation
 * frame and lives in `gameState.ts`'s module-level singleton instead,
 * read directly by `GameCanvas.tsx`'s own render loop — never here. Same
 * split `drawStore.ts` has from `drawStrokes.ts`.
 */
export interface GameState {
  status: GameStatus;
  score: number;
  lives: number;
  highScore: number;
  /** Mirrors GameCanvas's per-frame `shieldActive` boolean (OPEN_PALM or
   *  held Shift) into the cold path — the shield ring is otherwise a
   *  canvas-only visual with no text alternative for a screen reader. See
   *  gameState.ts's `advance()`, the one place this is synced, and only on
   *  the frame it actually changes. */
  shieldActive: boolean;
}

const HIGH_SCORE_KEY = 'airos.game.highScore.v1';

function loadHighScore(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(HIGH_SCORE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export const gameStore = createStore<GameState>({
  status: 'idle',
  score: 0,
  lives: 0,
  highScore: loadHighScore(),
  shieldActive: false,
});

/** Called by `gameState.ts` after every real change (status/score/lives) —
 *  never on every animation frame, since those don't change most frames.
 *  Also the one place a new high score gets persisted. */
export function syncGameSummary(patch: Pick<GameState, 'status' | 'score' | 'lives'>): void {
  const current = gameStore.get();
  const highScore = Math.max(current.highScore, patch.score);
  if (highScore > current.highScore && typeof window !== 'undefined') {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  }
  gameStore.update({ ...patch, highScore });
}

/** Called by `gameState.ts`'s `advance()` only on the frame `shieldActive`
 *  actually changes — an equality guard, not a throttle, since a per-frame
 *  unconditional write would defeat the whole point of keeping this off
 *  the hot path. */
export function syncShieldState(active: boolean): void {
  if (gameStore.get().shieldActive === active) return;
  gameStore.update({ shieldActive: active });
}
