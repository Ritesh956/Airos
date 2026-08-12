import { CameraStage } from '@/modules/shared/CameraStage';
import { Panel } from '@/ui/Panel';
import { Readout } from '@/ui/Readout';
import { Toggle } from '@/ui/Toggle';
import { LandmarkTable } from './LandmarkTable';
import { GestureTimeline } from './GestureTimeline';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, updateSettings } from '@/state/appStore';
import { visionStore } from '@/state/visionStore';
import { interactionStore } from '@/state/interactionStore';
import { formatGestureLabel } from '@/utils/format';

const HAND_TASK = { hand: true, face: false, pose: false };

/**
 * An interactive laboratory view of exactly what the tracking pipeline
 * sees, frame by frame — the landmark table and gesture timeline are new
 * here; everything else (camera stage, live readouts, overlay toggles)
 * reuses Phase 1-4 primitives rather than rebuilding them. See CLAUDE.md's
 * Phase 5 section for the reuse checklist this was built against.
 */
export default function LabModule() {
  useVisionTask(HAND_TASK);
  const activeGesture = useActiveGesture();
  const vision = useStoreSelector(visionStore, (s) => s);
  const trackingState = useStoreSelector(interactionStore, (s) => s.trackingState);
  const settings = useStoreSelector(appStore, (s) => s.settings);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-slow" />
          Phase 5 — Gesture Lab
        </div>
        <h1 className="mt-3 text-2xl font-medium text-ink-0">Gesture Lab</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-2">
          Exactly what the tracking pipeline sees, frame by frame — raw landmarks, live gesture
          classification, and every readout labelled by where the number actually came from.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <CameraStage demoDescription="Explore the Gesture Lab with a synthetic recorded hand — no camera access needed." />

        <div className="flex flex-col gap-5">
          <Panel eyebrow="Pipeline" title="Live Readouts">
            <Readout label="Tracking" value={trackingState} method="DERIVED" />
            <Readout label="Hands tracked" value={vision.handsPresent} method="DERIVED" />
            <Readout label="FPS" value={vision.fps > 0 ? vision.fps.toFixed(0) : '—'} method="DERIVED" />
            <Readout
              label="Inference time"
              value={vision.inferenceMs > 0 ? vision.inferenceMs.toFixed(1) : '—'}
              unit="ms"
              method="DERIVED"
            />
            <Readout
              label="Gesture"
              value={
                activeGesture && activeGesture.gesture !== 'NONE'
                  ? `${formatGestureLabel(activeGesture.gesture)} · ${activeGesture.confidence.toFixed(2)}`
                  : '—'
              }
              method="HEURISTIC"
            />
          </Panel>

          <Panel eyebrow="Overlays" title="Debug View">
            <Toggle
              checked={settings.showSkeletonOverlay}
              onChange={(checked) => updateSettings({ showSkeletonOverlay: checked })}
              label="Skeleton overlay"
              description="Draw the 21-point hand skeleton over the camera preview."
            />
            <Toggle
              checked={settings.showDebugOverlay}
              onChange={(checked) => updateSettings({ showDebugOverlay: checked })}
              label="Landmark indices"
              description="Label each joint with its landmark index on the overlay."
            />
          </Panel>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <LandmarkTable />
        <GestureTimeline />
      </section>
    </div>
  );
}
