import { MODULE_REGISTRY } from './moduleRegistry';

/**
 * The single source for "how much of AIR OS is built" — Home's hero chip
 * and Settings' About panel both drifted out of sync with reality more
 * than once (CLAUDE.md findings #14/#15: Home said "Phase 1", Settings
 * said "Phases 1–11" when all 14 were long done). One exported constant
 * both read means there's exactly one place left to update per phase.
 */
export const TOTAL_PHASES = 14;

/** Modules excluding Home itself — the number Home's own hero chip and
 *  copy can reference without hand-counting. */
export const MODULE_COUNT = MODULE_REGISTRY.filter((m) => m.id !== 'home').length;

export const BUILD_STATUS_SUMMARY = `All ${TOTAL_PHASES} phases complete — ${MODULE_COUNT} modules, running entirely in your browser.`;
