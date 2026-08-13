/**
 * The pure simulation core for Game Mode — a small vertical shooter
 * ("ships" descend from the top, the player's ship sits at the bottom and
 * fires upward). Every function here is a deterministic function of its
 * inputs, same "pure core, thin stateful wrapper" split
 * `modules/present/presentStore.ts` uses for its timer math: no
 * `performance.now()`, no module-level mutable state, no randomness
 * without an injectable override — so the whole simulation (movement,
 * spawning cadence, collisions, lives/shield/score) is testable with
 * plain synchronous assertions and a fake clock, the same reasoning
 * `pinchDragTracker.ts` and `drawStrokes.ts` are tested this way.
 *
 * All positions are normalized [0, 1] canvas-space (fraction of the game
 * canvas's own width/height) — the same convention `drawStrokes.ts` uses
 * for stroke points, per the project-wide rule that distance/speed
 * thresholds on tracked input belong in normalized space, not pixels
 * (CLAUDE.md bug #5).
 */

export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover';

export interface Enemy {
  id: number;
  x: number;
  y: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
}

export interface GameSimState {
  status: GameStatus;
  shipX: number;
  enemies: Enemy[];
  projectiles: Projectile[];
  score: number;
  lives: number;
  /** A simulation-owned clock in ms, advanced by `dtMs` each
   *  `stepSimulation` call — not `performance.now()`, so pausing the game
   *  (which simply stops calling `stepSimulation`) freezes spawn pacing
   *  for free, and tests never need a real or faked wall clock. */
  clockMs: number;
  lastSpawnAtMs: number;
  nextEntityId: number;
}

export const SHIP_Y = 0.92;
export const SHIP_RADIUS = 0.035;
export const ENEMY_RADIUS = 0.032;
export const PROJECTILE_RADIUS = 0.012;

export const LIVES_START = 3;
const SCORE_PER_KILL = 10;

const PROJECTILE_SPEED = 0.9; // normalized units/sec, moving toward y=0
const BASE_ENEMY_SPEED = 0.09; // normalized units/sec, moving toward y=1
const MAX_ENEMY_SPEED = 0.28;
const SPEED_PER_POINT = 0.0015;

const BASE_SPAWN_INTERVAL_MS = 1300;
const MIN_SPAWN_INTERVAL_MS = 450;
const SPAWN_INTERVAL_DECAY_PER_POINT = 5;

export function createInitialSimState(): GameSimState {
  return {
    status: 'idle',
    shipX: 0.5,
    enemies: [],
    projectiles: [],
    score: 0,
    lives: LIVES_START,
    clockMs: 0,
    lastSpawnAtMs: 0,
    nextEntityId: 1,
  };
}

/** Enemy descent speed ramps up with score — a deliberately gentle
 *  difficulty curve, clamped so late-game never becomes unfair-fast. */
export function enemySpeed(score: number): number {
  return Math.min(MAX_ENEMY_SPEED, BASE_ENEMY_SPEED + score * SPEED_PER_POINT);
}

/** Spawn cadence tightens with score, mirroring enemySpeed's curve. */
export function spawnIntervalMs(score: number): number {
  return Math.max(MIN_SPAWN_INTERVAL_MS, BASE_SPAWN_INTERVAL_MS - score * SPAWN_INTERVAL_DECAY_PER_POINT);
}

function resetKeepingShip(state: GameSimState): GameSimState {
  return { ...createInitialSimState(), shipX: state.shipX };
}

/** THUMBS_UP's action — contextual, same idempotent-and-smart shape
 *  `presentStore.ts`'s `applyStartTimer` uses: a no-op while already
 *  playing, a plain resume from paused (score/lives/entities untouched),
 *  and a full reset from idle or a finished game. */
export function applyStart(state: GameSimState): GameSimState {
  if (state.status === 'playing') return state;
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return { ...resetKeepingShip(state), status: 'playing' };
}

/** FIST's action — a no-op unless a round is actually in progress. */
export function applyPause(state: GameSimState): GameSimState {
  if (state.status !== 'playing') return state;
  return { ...state, status: 'paused' };
}

/** Always a full reset, regardless of current status — the explicit
 *  "start over" action, distinct from THUMBS_UP's contextual resume. */
export function applyRestart(state: GameSimState): GameSimState {
  return { ...resetKeepingShip(state), status: 'playing' };
}

export function setShipX(state: GameSimState, x: number): GameSimState {
  return { ...state, shipX: Math.min(1, Math.max(0, x)) };
}

/** A no-op outside 'playing' — matches CLAUDE.md's Phase 3 pinch-hysteresis
 *  precedent of "a false positive is worse than a missed input": firing
 *  while paused or before the round starts shouldn't queue up a shot that
 *  appears the instant play resumes. */
export function spawnProjectile(state: GameSimState): GameSimState {
  if (state.status !== 'playing') return state;
  return {
    ...state,
    projectiles: [...state.projectiles, { id: state.nextEntityId, x: state.shipX, y: SHIP_Y - SHIP_RADIUS }],
    nextEntityId: state.nextEntityId + 1,
  };
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export interface StepOptions {
  /** Injectable for deterministic tests — defaults to `Math.random`. */
  randomX?: () => number;
}

/**
 * Advances the simulation by `dtMs`: moves enemies down and projectiles
 * up, spawns a new enemy when the cadence allows, resolves
 * projectile-enemy collisions (both destroyed, score up), and resolves
 * any enemy that reached the bottom — blocked for free by an active
 * shield, otherwise costing a life. Ends the round (`status: 'gameover'`)
 * the instant lives hits zero. A no-op whenever `status !== 'playing'`
 * (paused/idle/gameover all freeze in place), so callers can call this
 * unconditionally every animation frame without checking status first.
 */
export function stepSimulation(
  state: GameSimState,
  dtMs: number,
  shieldActive: boolean,
  options: StepOptions = {},
): GameSimState {
  if (state.status !== 'playing') return state;
  const randomX = options.randomX ?? Math.random;
  const dtSec = dtMs / 1000;
  const clockMs = state.clockMs + dtMs;
  const speed = enemySpeed(state.score);

  let enemies = state.enemies.map((e) => ({ ...e, y: e.y + speed * dtSec }));
  let projectiles = state.projectiles
    .map((p) => ({ ...p, y: p.y - PROJECTILE_SPEED * dtSec }))
    .filter((p) => p.y > -PROJECTILE_RADIUS);

  let nextEntityId = state.nextEntityId;
  let lastSpawnAtMs = state.lastSpawnAtMs;
  if (clockMs - lastSpawnAtMs >= spawnIntervalMs(state.score)) {
    lastSpawnAtMs = clockMs;
    // Kept away from the very edges so a spawned enemy is never clipped.
    enemies = [...enemies, { id: nextEntityId, x: 0.08 + randomX() * 0.84, y: -ENEMY_RADIUS }];
    nextEntityId += 1;
  }

  let score = state.score;
  const hitEnemyIds = new Set<number>();
  const hitProjectileIds = new Set<number>();
  for (const projectile of projectiles) {
    for (const enemy of enemies) {
      if (hitEnemyIds.has(enemy.id)) continue;
      if (distance(projectile.x, projectile.y, enemy.x, enemy.y) <= PROJECTILE_RADIUS + ENEMY_RADIUS) {
        hitProjectileIds.add(projectile.id);
        hitEnemyIds.add(enemy.id);
        score += SCORE_PER_KILL;
        break;
      }
    }
  }
  if (hitEnemyIds.size > 0) {
    enemies = enemies.filter((e) => !hitEnemyIds.has(e.id));
    projectiles = projectiles.filter((p) => !hitProjectileIds.has(p.id));
  }

  let lives = state.lives;
  const reachedBottom = enemies.filter((e) => e.y >= 1 - ENEMY_RADIUS);
  if (reachedBottom.length > 0) {
    enemies = enemies.filter((e) => e.y < 1 - ENEMY_RADIUS);
    if (!shieldActive) lives -= reachedBottom.length;
  }
  lives = Math.max(0, lives);

  return {
    ...state,
    status: lives <= 0 ? 'gameover' : 'playing',
    enemies,
    projectiles,
    score,
    lives,
    clockMs,
    lastSpawnAtMs,
    nextEntityId,
  };
}
