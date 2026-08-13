import { describe, expect, it } from 'vitest';
import { DEGRADATION_STEPS, MAX_LEVEL, getAppliedEffects, median } from './degradationLadder';

describe('median', () => {
  it('returns 0 for an empty sample set', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for an odd-length sample set', () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it('averages the two middle values for an even-length sample set', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('is insensitive to a single outlier', () => {
    const samples = [28, 29, 30, 31, 30, 29, 2];
    expect(median(samples)).toBe(29);
  });
});

describe('getAppliedEffects', () => {
  it('applies nothing at level 0', () => {
    expect(getAppliedEffects(0, 'cursor')).toEqual({
      resolutionDowngraded: false,
      handsReduced: false,
      frameSkipping: false,
      secondaryDisabled: false,
      recommendDemoMode: false,
    });
  });

  it('escalates one real effect per level, in order, for a module with no gating', () => {
    expect(getAppliedEffects(1, 'cursor').resolutionDowngraded).toBe(true);
    expect(getAppliedEffects(2, 'cursor').handsReduced).toBe(true);
    expect(getAppliedEffects(3, 'cursor').frameSkipping).toBe(true);
    expect(getAppliedEffects(4, 'cursor').secondaryDisabled).toBe(true);
    expect(getAppliedEffects(5, 'cursor').recommendDemoMode).toBe(true);
  });

  it('never reduces hands while 3D Studio is active, even at max level', () => {
    const effects = getAppliedEffects(MAX_LEVEL, 'studio');
    expect(effects.handsReduced).toBe(false);
    // every other step still applies — the gate is specific to hands.
    expect(effects.resolutionDowngraded).toBe(true);
    expect(effects.frameSkipping).toBe(true);
    expect(effects.secondaryDisabled).toBe(true);
  });

  it('never disables secondary tasks while Gesture Lab is active, even at max level', () => {
    const effects = getAppliedEffects(MAX_LEVEL, 'lab');
    expect(effects.secondaryDisabled).toBe(false);
    expect(effects.handsReduced).toBe(true);
  });

  it('reduces hands for modules other than studio', () => {
    for (const moduleId of ['home', 'cursor', 'draw', 'present', 'game', 'analytics', 'settings'] as const) {
      expect(getAppliedEffects(2, moduleId).handsReduced).toBe(true);
    }
  });
});

describe('DEGRADATION_STEPS', () => {
  it('has exactly MAX_LEVEL entries, numbered 1..MAX_LEVEL in order', () => {
    expect(DEGRADATION_STEPS).toHaveLength(MAX_LEVEL);
    DEGRADATION_STEPS.forEach((step, i) => expect(step.level).toBe(i + 1));
  });
});
