import type { ModuleId } from '@/state/appStore';

/**
 * The pure half of IMPLEMENTATION.md §9's degradation ladder — thresholds,
 * step descriptions, and the arithmetic that decides what should currently
 * be active. `DegradationController.ts` is the thin stateful wrapper that
 * calls into this (subscribes to real stores, calls real side-effecting
 * APIs); everything here is a plain function of its arguments, callable
 * from a unit test with no camera, no MediaPipe, no store. Same "pure
 * core, thin wrapper" split `presentStore.ts`'s timer math and
 * `gameSimulation.ts` already use.
 *
 * Critically, `getAppliedEffects()` is the *one* place that decides what
 * each level actually does — both `DegradationController` (to know what to
 * call) and the Analytics dashboard / status-bar banner (to know what to
 * display) call this same function, so the UI can never claim a step is
 * active that the controller didn't really apply, or vice versa.
 */

export const LOW_FPS_THRESHOLD = 20;
/** Recovery requires climbing back above this, not just above
 *  LOW_FPS_THRESHOLD — the gap is the ladder's hysteresis margin, so a
 *  frame rate hovering right at 20 doesn't flap a step on and off. */
export const RECOVERY_FPS_THRESHOLD = 25;
/** Both the "stayed low for 3 seconds" trigger and the recovery trigger use
 *  the same sustain window (IMPLEMENTATION.md §9 only specifies the
 *  escalation side; using the same duration for recovery is the simplest
 *  symmetric choice and still satisfies "each step is reversible... with
 *  hysteresis to avoid oscillation" — the threshold gap above is what
 *  prevents oscillation, not an asymmetric timer). */
export const SUSTAIN_MS = 3000;

export interface DegradationStep {
  level: number;
  label: string;
  description: string;
}

export const DEGRADATION_STEPS: readonly DegradationStep[] = [
  {
    level: 1,
    label: 'Reduced camera resolution',
    description: 'Capture dropped to 640×480 to cut per-frame processing cost.',
  },
  {
    level: 2,
    label: 'Single-hand tracking',
    description: 'Hand detection limited to 1 hand instead of 2 — skipped while 3D Studio needs both.',
  },
  {
    level: 3,
    label: 'Halved inference rate',
    description: 'Detection runs on every other frame; the last real detection is held on the frame in between.',
  },
  {
    level: 4,
    label: 'Secondary tracking disabled',
    description: 'Face/pose tracking paused to free up frame budget — skipped while Gesture Lab is tracking them.',
  },
  {
    level: 5,
    label: 'Demo Mode recommended',
    description: 'Frame rate has stayed low — Demo Mode gives a smooth experience with no camera/inference cost.',
  },
];

export const MAX_LEVEL = DEGRADATION_STEPS.length;

/** What's genuinely active at a given ladder level — module-gated exactly
 *  as IMPLEMENTATION.md §9 specifies ("only if the active module allows
 *  it" / "if the active module doesn't require them"). 3D Studio is the
 *  only module whose interaction genuinely needs two hands
 *  (interaction/studio/StudioEngine.ts's two-hand gesture); Gesture Lab is
 *  the only module that ever requests face/pose tracking at all. */
export interface AppliedEffects {
  resolutionDowngraded: boolean;
  handsReduced: boolean;
  frameSkipping: boolean;
  secondaryDisabled: boolean;
  recommendDemoMode: boolean;
}

export const NO_EFFECTS: AppliedEffects = {
  resolutionDowngraded: false,
  handsReduced: false,
  frameSkipping: false,
  secondaryDisabled: false,
  recommendDemoMode: false,
};

export function getAppliedEffects(level: number, activeModule: ModuleId): AppliedEffects {
  return {
    resolutionDowngraded: level >= 1,
    handsReduced: level >= 2 && activeModule !== 'studio',
    frameSkipping: level >= 3,
    secondaryDisabled: level >= 4 && activeModule !== 'lab',
    recommendDemoMode: level >= 5,
  };
}

/** The rolling-median FPS calculation the ladder triggers on — a median
 *  rather than a mean specifically because it's insensitive to a single
 *  outlier stall (a GC pause, a tab-switch hitch) that a mean would let
 *  swing the trigger. */
export function median(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
