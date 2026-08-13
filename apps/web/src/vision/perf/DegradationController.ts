import { appStore } from '@/state/appStore';
import { PUBLISH_INTERVAL_MS, setDegradationLevel, visionStore } from '@/state/visionStore';
import { cameraManager } from '@/vision/camera/CameraManager';
import { setHandLandmarkerNumHands } from '@/vision/hand/HandLandmarkerService';
import { visionEngine } from '@/vision/engine/VisionEngine';
import {
  LOW_FPS_THRESHOLD,
  MAX_LEVEL,
  NO_EFFECTS,
  RECOVERY_FPS_THRESHOLD,
  SUSTAIN_MS,
  getAppliedEffects,
  median,
  type AppliedEffects,
} from './degradationLadder';

/** How many fpsHistory samples span SUSTAIN_MS, given the store's actual
 *  publish rate — deriving this instead of hardcoding a second "30" keeps
 *  the two files from silently drifting apart if PUBLISH_INTERVAL_MS ever
 *  changes. */
const SAMPLE_WINDOW = Math.round(SUSTAIN_MS / PUBLISH_INTERVAL_MS);

/**
 * The stateful half of IMPLEMENTATION.md §9's degradation ladder — wired
 * to real measured FPS, exactly the "measure, never estimate" rule this
 * phase's whole point is to honor. No timer loop of its own: it re-checks
 * on every visionStore publish (~10Hz, whenever fpsHistory grows) and every
 * appStore change (module switch, camera/source change), the same
 * "recompute on every store change, let idempotency make repeats free"
 * pattern VisionEngine.recompute() and CameraLandmarkSource.
 * syncWithCameraState() already use elsewhere in this codebase.
 *
 * A singleton, like visionEngine/cameraManager — one ladder for the whole
 * app, not one per module.
 */
class DegradationControllerImpl {
  private started = false;
  private level = 0;
  private belowSince: number | null = null;
  private aboveSince: number | null = null;
  private applied: AppliedEffects = { ...NO_EFFECTS };
  /** True while a camera resolution restart we ourselves triggered is in
   *  flight — see evaluate()'s doc comment for why this has to gate
   *  re-entry rather than just letting the recompute-on-every-change
   *  pattern run unguarded here. */
  private resolutionChangeInFlight = false;

  /** Idempotent — safe to call from more than one mount. */
  start(): void {
    if (this.started) return;
    this.started = true;
    visionStore.subscribe(() => this.evaluate());
    appStore.subscribe(() => this.evaluate());
  }

  private computeMedianFps(): number | null {
    const history = visionStore.get().fpsHistory;
    // Not enough real samples yet to judge a 3-second window — e.g. right
    // after the camera starts. Staying idle here (rather than judging on a
    // shorter window) avoids the ladder reacting to the camera's own
    // startup ramp-up as if it were a real sustained slowdown.
    if (history.length < SAMPLE_WINDOW) return null;
    return median(history.slice(-SAMPLE_WINDOW));
  }

  /**
   * Re-evaluates the ladder against the current FPS/appStore snapshot.
   *
   * Skipped entirely while resolutionChangeInFlight: downgradeResolution()/
   * restoreDefaultResolution() stop and restart the camera stream, which
   * cycles cameraState through stopping -> off -> starting -> active before
   * landing back where it started — each of those is itself an appStore
   * update this same subscription would otherwise see. Reacting mid-
   * restart would read "camera not active" as a reason to immediately
   * reverse the very change in progress, oscillating forever. Same
   * "resets must account for every way frames can stop arriving" lesson
   * as CLAUDE.md bug #8, applied to a restart *we* initiated rather than
   * one the user did.
   */
  private evaluate(): void {
    if (this.resolutionChangeInFlight) return;

    const { inputSource, cameraState, activeModule } = appStore.get();
    const cameraLive = inputSource === 'camera' && cameraState === 'active';

    if (!cameraLive) {
      this.reset();
      return;
    }

    const medianFps = this.computeMedianFps();
    if (medianFps !== null) {
      const now = performance.now();
      if (medianFps < LOW_FPS_THRESHOLD) {
        this.aboveSince = null;
        if (this.belowSince === null) this.belowSince = now;
        if (this.level < MAX_LEVEL && now - this.belowSince >= SUSTAIN_MS) {
          this.level += 1;
          // Restart the window so a second escalation needs its own full
          // sustained-low period, rather than firing every tick once past
          // the first 3s while FPS stays low.
          this.belowSince = now;
        }
      } else if (medianFps >= RECOVERY_FPS_THRESHOLD) {
        this.belowSince = null;
        if (this.aboveSince === null) this.aboveSince = now;
        if (this.level > 0 && now - this.aboveSince >= SUSTAIN_MS) {
          this.level -= 1;
          this.aboveSince = now;
        }
      } else {
        // The hysteresis band itself (between the two thresholds): neither
        // window should keep counting here, or recovering from a dip would
        // "remember" time spent merely hovering near the low threshold.
        this.belowSince = null;
        this.aboveSince = null;
      }
    }

    setDegradationLevel(this.level);
    void this.applyEffects(getAppliedEffects(this.level, activeModule));
  }

  /**
   * `setDegradationLevel()` above writes into visionStore, which — because
   * this class also subscribes to visionStore — synchronously re-enters
   * `evaluate()` (and thus this method) *before* the outer call reaches its
   * own `applyEffects()` invocation. Both the outer and the nested call
   * would otherwise read the same stale `this.applied` and independently
   * decide the same transition hasn't happened yet, each firing the same
   * side effect (e.g. downgrading the camera resolution twice). Committing
   * `this.applied = next` synchronously, before any `await`, closes that
   * window: whichever call (inner or outer) reaches this line first marks
   * the transition as claimed, so the other sees nothing left to do. This
   * is the same class of hazard CLAUDE.md bug #12 describes for
   * `setVoiceState`, just one level deeper — the equality guard there
   * stops infinite recursion, but doesn't by itself stop two sibling calls
   * from both acting on a transition that's only "pending", not yet
   * "claimed".
   */
  private async applyEffects(next: AppliedEffects): Promise<void> {
    const previous = this.applied;
    if (
      next.resolutionDowngraded === previous.resolutionDowngraded &&
      next.handsReduced === previous.handsReduced &&
      next.frameSkipping === previous.frameSkipping &&
      next.secondaryDisabled === previous.secondaryDisabled
    ) {
      return;
    }
    this.applied = next;

    if (next.resolutionDowngraded !== previous.resolutionDowngraded) {
      this.resolutionChangeInFlight = true;
      try {
        if (next.resolutionDowngraded) await cameraManager.downgradeResolution(640, 480);
        else await cameraManager.restoreDefaultResolution();
      } catch (error) {
        // Revert just this flag so a future evaluate() retries, rather
        // than silently believing a failed change succeeded.
        this.applied = { ...this.applied, resolutionDowngraded: previous.resolutionDowngraded };
        console.error('Degradation ladder: camera resolution change failed', error);
      } finally {
        this.resolutionChangeInFlight = false;
      }
    }

    if (next.handsReduced !== previous.handsReduced) {
      setHandLandmarkerNumHands(next.handsReduced ? 1 : 2).catch((error: unknown) => {
        console.error('Degradation ladder: numHands change failed', error);
      });
    }

    if (next.frameSkipping !== previous.frameSkipping) {
      visionEngine.setFrameSkipEnabled(next.frameSkipping);
    }

    if (next.secondaryDisabled !== previous.secondaryDisabled) {
      visionEngine.setSuppressSecondaryTasks(next.secondaryDisabled);
    }

    // recommendDemoMode has no side effect of its own to apply — it's a
    // pure display flag the Analytics dashboard and the status-bar banner
    // read directly via getAppliedEffects().
  }

  private reset(): void {
    this.belowSince = null;
    this.aboveSince = null;
    if (this.level !== 0) {
      this.level = 0;
      setDegradationLevel(0);
    }
    void this.applyEffects(NO_EFFECTS);
  }
}

/** Singleton — see class doc for why. Started from hooks/usePerfDegradation.ts. */
export const degradationController = new DegradationControllerImpl();
