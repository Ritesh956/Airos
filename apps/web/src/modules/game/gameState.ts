import { syncGameSummary } from './gameStore';
import {
  applyPause,
  applyRestart,
  applyStart,
  createInitialSimState,
  setShipX as pureSetShipX,
  spawnProjectile,
  stepSimulation,
  type GameSimState,
} from './gameSimulation';

/**
 * Game Mode's hot-path state — a module-level singleton, not React state
 * or a `createStore`, for the same reason `drawStrokes.ts`/
 * `studioTransforms.ts` aren't: ship/enemy/projectile positions change
 * every animation frame while a round is playing, and `GameCanvas.tsx`'s
 * own rAF loop reads and paints them directly. `gameStore.ts` holds the
 * React-visible *summary* this module keeps in sync after every real
 * change — the same relationship `drawStore.ts` has to `drawStrokes.ts`.
 *
 * Every mutator here is a thin wrapper around `gameSimulation.ts`'s pure
 * functions — this file's only job is owning *where* the current state
 * lives and *when* to publish a summary, never game logic itself.
 */

let state: GameSimState = createInitialSimState();

function syncIfChanged(previous: GameSimState, next: GameSimState): void {
  state = next;
  if (
    previous.status !== next.status ||
    previous.score !== next.score ||
    previous.lives !== next.lives
  ) {
    syncGameSummary({ status: next.status, score: next.score, lives: next.lives });
  }
}

export function getGameState(): GameSimState {
  return state;
}

/** Advances the round by `dtMs` — a no-op whenever nothing is playing, so
 *  callers (GameCanvas's rAF loop) can call this unconditionally every
 *  frame without checking status first. */
export function advance(dtMs: number, shieldActive: boolean): void {
  syncIfChanged(state, stepSimulation(state, dtMs, shieldActive));
}

export function fire(): void {
  syncIfChanged(state, spawnProjectile(state));
}

export function moveShipTo(x: number): void {
  state = pureSetShipX(state, x);
}

/** THUMBS_UP / the "Start / Resume" command — contextual, see
 *  gameSimulation.ts's applyStart doc comment. */
export function startOrResume(): void {
  syncIfChanged(state, applyStart(state));
}

/** FIST / the "Pause" command. */
export function pause(): void {
  syncIfChanged(state, applyPause(state));
}

/** The explicit "Restart" command — always a full reset. */
export function restart(): void {
  syncIfChanged(state, applyRestart(state));
}

/** Not reachable from any button or gesture — exists for test isolation,
 *  mirroring `drawStrokes.ts`'s `resetDrawStrokes`/`studioTransforms.ts`'s
 *  `initStudioTransforms`. */
export function resetGameState(): void {
  state = createInitialSimState();
  syncGameSummary({ status: state.status, score: state.score, lives: state.lives });
}
