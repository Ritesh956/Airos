import { useState } from 'react';
import { CameraStage } from '@/modules/shared/CameraStage';
import { LandmarkTable } from '@/modules/lab/LandmarkTable';
import { GestureTimeline } from '@/modules/lab/GestureTimeline';
import { FpsGraph } from './FpsGraph';
import { Panel } from '@/ui/Panel';
import { Readout } from '@/ui/Readout';
import { Toggle } from '@/ui/Toggle';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import { useRenderRate } from '@/hooks/useRenderRate';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore } from '@/state/appStore';
import { visionStore, PUBLISH_INTERVAL_MS } from '@/state/visionStore';
import { DEGRADATION_STEPS, SUSTAIN_MS, getAppliedEffects, median } from '@/vision/perf/degradationLadder';
import { formatGestureLabel } from '@/utils/format';

const SAMPLE_WINDOW = Math.round(SUSTAIN_MS / PUBLISH_INTERVAL_MS);

type StepStatus = 'active' | 'skipped' | 'pending';

function stepStatus(level: number, stepLevel: number, effectActive: boolean): StepStatus {
  if (level < stepLevel) return 'pending';
  return effectActive ? 'active' : 'skipped';
}

const STATUS_STYLE: Record<StepStatus, string> = {
  active: 'border-signal-500/40 bg-signal-500/10 text-signal-400',
  skipped: 'border-border-strong bg-surface-3 text-ink-2',
  pending: 'border-border bg-surface-1 text-ink-3',
};

const STATUS_LABEL: Record<StepStatus, string> = {
  active: 'Active',
  skipped: 'Skipped — current module',
  pending: 'Not triggered',
};

/**
 * Reads getAppliedEffects() — the exact function
 * vision/perf/DegradationController.ts uses to decide what to apply — so
 * this panel can never claim a step is active that the controller didn't
 * really apply (or vice versa). "Skipped — current module" only ever shows
 * for steps 2 and 4, the two IMPLEMENTATION.md §9 explicitly module-gates
 * (hand reduction skipped for 3D Studio, secondary-task suppression
 * skipped for Gesture Lab) — see degradationLadder.ts's doc comment.
 */
function DegradationLadderPanel() {
  const level = useStoreSelector(visionStore, (s) => s.degradationLevel);
  const activeModule = useStoreSelector(appStore, (s) => s.activeModule);
  const effects = getAppliedEffects(level, activeModule);
  const effectByLevel: Record<number, boolean> = {
    1: effects.resolutionDowngraded,
    2: effects.handsReduced,
    3: effects.frameSkipping,
    4: effects.secondaryDisabled,
    5: effects.recommendDemoMode,
  };

  return (
    <Panel eyebrow="IMPLEMENTATION.md §9" title="Degradation Ladder">
      <p className="mb-3 text-xs text-ink-2">
        Triggers when the rolling 3-second median FPS stays under 20. Each step reverses once FPS
        recovers above 25 for another 3 seconds.
      </p>
      <ul className="flex flex-col gap-2">
        {DEGRADATION_STEPS.map((step) => {
          const status = stepStatus(level, step.level, effectByLevel[step.level] ?? false);
          return (
            <li
              key={step.level}
              className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${STATUS_STYLE[status]}`}
            >
              <div>
                <div className="font-medium">
                  {step.level}. {step.label}
                </div>
                <div className="mt-0.5 text-[11px] opacity-80">{step.description}</div>
              </div>
              <span className="shrink-0 text-[10px] uppercase tracking-wide">{STATUS_LABEL[status]}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * The real Phase 13 module — every number here traces to a
 * `performance.now()` measurement or arithmetic on one (IMPLEMENTATION.md
 * §9's "measure, never estimate" rule), and the degradation ladder panel
 * above reads `getAppliedEffects()`, the exact function
 * `vision/perf/DegradationController.ts` uses to decide what to apply, so
 * this page can never claim a step is active that isn't really running.
 *
 * Requests hand tracking unconditionally while mounted (like every other
 * tracking module's `useVisionTask` call) — a performance panel with
 * nothing to measure wouldn't be much of one. Face/pose stay out of scope
 * here entirely (Debug Mode reuses Gesture Lab's hand-only table/timeline,
 * not its face/pose toggles).
 */
export default function AnalyticsModule() {
  const [debugMode, setDebugMode] = useState(false);
  useVisionTask({ hand: true, face: false, pose: false });
  const activeGesture = useActiveGesture();
  const renderRate = useRenderRate();
  const vision = useStoreSelector(visionStore, (s) => s);

  const medianFps = vision.fpsHistory.length >= SAMPLE_WINDOW ? median(vision.fpsHistory.slice(-SAMPLE_WINDOW)) : null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-slow" />
          Phase 13 — Analytics
        </div>
        <h1 className="mt-3 text-2xl font-medium text-ink-0">Analytics</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-2">
          What the vision pipeline is actually costing, measured with performance.now() around the
          real work — never estimated, faked, or smoothed to look better than it is.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <CameraStage demoDescription="Explore the perf dashboard with a synthetic recorded hand — no camera access needed." />

        <div className="flex flex-col gap-5">
          <Panel eyebrow="Measured" title="Live Readouts">
            <Readout label="FPS (smoothed)" value={vision.fps > 0 ? vision.fps.toFixed(0) : '—'} method="DERIVED" />
            <Readout
              label="FPS (3s median)"
              value={medianFps !== null ? medianFps.toFixed(0) : '—'}
              method="DERIVED"
            />
            <Readout
              label="Inference time"
              value={vision.inferenceMs > 0 ? vision.inferenceMs.toFixed(1) : '—'}
              unit="ms"
              method="DERIVED"
            />
            <Readout
              label="Total frame time"
              value={vision.totalMs > 0 ? vision.totalMs.toFixed(1) : '—'}
              unit="ms"
              method="DERIVED"
            />
            <Readout label="Hands tracked" value={vision.handsPresent} method="DERIVED" />
            <Readout label="Source" value={vision.source ?? '—'} method="DERIVED" />
            <Readout
              label="Gesture"
              value={
                activeGesture && activeGesture.gesture !== 'NONE'
                  ? formatGestureLabel(activeGesture.gesture)
                  : '—'
              }
              method="HEURISTIC"
            />
            <Readout label="This panel's renders/sec" value={renderRate} method="DERIVED" />
          </Panel>

          <Panel eyebrow="Debug" title="Debug Mode">
            <Toggle
              checked={debugMode}
              onChange={setDebugMode}
              label="Debug mode"
              description="Show raw landmark coordinates and the gesture transition log below."
            />
          </Panel>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_0.6fr]">
        <Panel eyebrow="performance.now()" title="FPS History">
          <FpsGraph />
        </Panel>
        <DegradationLadderPanel />
      </section>

      {debugMode && (
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <LandmarkTable />
          <GestureTimeline />
        </section>
      )}
    </div>
  );
}
