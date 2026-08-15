import { MODULE_REGISTRY } from './moduleRegistry';

/**
 * The single source for "how much of AIR OS is built" — Home's hero chip
 * and Settings' About panel both drifted out of sync with reality more
 * than once (CLAUDE.md findings #14/#15: Home said "Phase 1", Settings
 * said "Phases 1–11" when all 14 were long done). One exported constant
 * both read means there's exactly one place left to update per phase.
 *
 * `TOTAL_PHASES` stays internal now rather than feeding user-facing copy —
 * "phases" is build-process language from this project's own development
 * process, meaningless to someone visiting the deployed site with no repo
 * (CLAUDE.md UI/UX audit finding #18). `BUILD_STATUS_SUMMARY` describes
 * what the app *does* instead.
 */
export const TOTAL_PHASES = 14;

/** Modules excluding Home itself — the number Home's own hero chip and
 *  copy can reference without hand-counting. */
export const MODULE_COUNT = MODULE_REGISTRY.filter((m) => m.id !== 'home').length;

export const BUILD_STATUS_SUMMARY = `${MODULE_COUNT} modules covering hand, face, pose, and voice tracking — running entirely in your browser.`;
