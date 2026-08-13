import { describe, expect, it } from 'vitest';
import {
  ENEMY_RADIUS,
  LIVES_START,
  SHIP_RADIUS,
  SHIP_Y,
  applyPause,
  applyRestart,
  applyStart,
  createInitialSimState,
  enemySpeed,
  setShipX,
  spawnIntervalMs,
  spawnProjectile,
  stepSimulation,
  type GameSimState,
} from './gameSimulation';

function playingState(overrides: Partial<GameSimState> = {}): GameSimState {
  return { ...createInitialSimState(), status: 'playing', ...overrides };
}

describe('applyStart', () => {
  it('starts fresh from idle', () => {
    const next = applyStart(createInitialSimState());
    expect(next.status).toBe('playing');
    expect(next.score).toBe(0);
    expect(next.lives).toBe(LIVES_START);
  });

  it('resumes from paused without touching score, lives, or entities', () => {
    const paused: GameSimState = {
      ...playingState({ score: 40, lives: 2 }),
      status: 'paused',
      enemies: [{ id: 1, x: 0.5, y: 0.5 }],
    };
    const next = applyStart(paused);
    expect(next.status).toBe('playing');
    expect(next.score).toBe(40);
    expect(next.lives).toBe(2);
    expect(next.enemies).toHaveLength(1);
  });

  it('is a no-op while already playing', () => {
    const state = playingState({ score: 10 });
    expect(applyStart(state)).toBe(state);
  });

  it('resets fully from a finished game', () => {
    const gameover = playingState({ score: 999, lives: 0, status: 'gameover' });
    const next = applyStart(gameover);
    expect(next.status).toBe('playing');
    expect(next.score).toBe(0);
    expect(next.lives).toBe(LIVES_START);
  });
});

describe('applyPause', () => {
  it('pauses an in-progress round', () => {
    const next = applyPause(playingState());
    expect(next.status).toBe('paused');
  });

  it('is a no-op outside playing', () => {
    const idle = createInitialSimState();
    expect(applyPause(idle)).toBe(idle);
  });
});

describe('applyRestart', () => {
  it('always resets, even mid-round with a nonzero score', () => {
    const midRound = playingState({ score: 250, lives: 1, enemies: [{ id: 1, x: 0.5, y: 0.5 }] });
    const next = applyRestart(midRound);
    expect(next.status).toBe('playing');
    expect(next.score).toBe(0);
    expect(next.lives).toBe(LIVES_START);
    expect(next.enemies).toHaveLength(0);
  });
});

describe('setShipX', () => {
  it('clamps to [0, 1]', () => {
    expect(setShipX(createInitialSimState(), -0.5).shipX).toBe(0);
    expect(setShipX(createInitialSimState(), 1.5).shipX).toBe(1);
    expect(setShipX(createInitialSimState(), 0.3).shipX).toBe(0.3);
  });
});

describe('spawnProjectile', () => {
  it('adds a projectile at the ship position', () => {
    const state = playingState({ shipX: 0.42 });
    const next = spawnProjectile(state);
    expect(next.projectiles).toHaveLength(1);
    expect(next.projectiles[0]).toMatchObject({ x: 0.42, y: SHIP_Y - SHIP_RADIUS });
  });

  it('is a no-op outside playing (no queued shot on resume)', () => {
    const paused = { ...playingState(), status: 'paused' as const };
    expect(spawnProjectile(paused)).toBe(paused);
  });
});

describe('enemySpeed / spawnIntervalMs', () => {
  it('clamp at high score rather than growing unbounded', () => {
    expect(enemySpeed(1_000_000)).toBeLessThanOrEqual(0.28);
    expect(spawnIntervalMs(1_000_000)).toBeGreaterThanOrEqual(450);
  });

  it('ramp up difficulty as score increases', () => {
    expect(enemySpeed(100)).toBeGreaterThan(enemySpeed(0));
    expect(spawnIntervalMs(100)).toBeLessThan(spawnIntervalMs(0));
  });
});

describe('stepSimulation', () => {
  it('is a no-op outside playing', () => {
    const paused = { ...playingState(), status: 'paused' as const };
    expect(stepSimulation(paused, 1000, false)).toBe(paused);
  });

  it('moves enemies down and projectiles up over time', () => {
    const state = playingState({
      enemies: [{ id: 1, x: 0.5, y: 0 }],
      projectiles: [{ id: 2, x: 0.5, y: 0.5 }],
      clockMs: 0,
      lastSpawnAtMs: 0,
    });
    // A short dt so the projectile (much faster than an enemy) stays
    // on-screen — a full second at PROJECTILE_SPEED would fly off the top
    // entirely, which is covered separately below.
    const next = stepSimulation(state, 100, false);
    expect(next.enemies[0]!.y).toBeCloseTo(enemySpeed(0) * 0.1, 5);
    expect(next.projectiles[0]!.y).toBeLessThan(0.5);
  });

  it('removes projectiles once they travel off the top of the screen', () => {
    const state = playingState({ projectiles: [{ id: 1, x: 0.5, y: 0.001 }] });
    const next = stepSimulation(state, 1000, false);
    expect(next.projectiles).toHaveLength(0);
  });

  it('spawns a new enemy once the cadence interval elapses, not before', () => {
    const almost = playingState({ clockMs: 1200, lastSpawnAtMs: 0 });
    expect(stepSimulation(almost, 50, false).enemies).toHaveLength(0); // 1250ms < 1300ms interval at score 0

    const ready = playingState({ clockMs: 1250, lastSpawnAtMs: 0 });
    const next = stepSimulation(ready, 100, false, { randomX: () => 0.5 });
    expect(next.enemies).toHaveLength(1);
    expect(next.lastSpawnAtMs).toBe(1350);
  });

  it('destroys both projectile and enemy on collision and awards score', () => {
    const state = playingState({
      enemies: [{ id: 1, x: 0.5, y: 0.5 }],
      projectiles: [{ id: 2, x: 0.5, y: 0.5 }],
    });
    const next = stepSimulation(state, 0, false);
    expect(next.enemies).toHaveLength(0);
    expect(next.projectiles).toHaveLength(0);
    expect(next.score).toBe(10);
  });

  it('costs a life when an unblocked enemy reaches the bottom', () => {
    const state = playingState({ enemies: [{ id: 1, x: 0.5, y: 1 - ENEMY_RADIUS }], lives: LIVES_START });
    const next = stepSimulation(state, 0, false);
    expect(next.enemies).toHaveLength(0);
    expect(next.lives).toBe(LIVES_START - 1);
  });

  it('blocks the same collision for free when the shield is active', () => {
    const state = playingState({ enemies: [{ id: 1, x: 0.5, y: 1 - ENEMY_RADIUS }], lives: LIVES_START });
    const next = stepSimulation(state, 0, true);
    expect(next.enemies).toHaveLength(0);
    expect(next.lives).toBe(LIVES_START);
  });

  it('ends the round once lives reach zero', () => {
    const state = playingState({ enemies: [{ id: 1, x: 0.5, y: 1 - ENEMY_RADIUS }], lives: 1 });
    const next = stepSimulation(state, 0, false);
    expect(next.lives).toBe(0);
    expect(next.status).toBe('gameover');
  });
});
