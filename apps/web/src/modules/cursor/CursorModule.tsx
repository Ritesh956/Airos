import { useState } from 'react';
import { Panel } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { Readout } from '@/ui/Readout';
import { Slider } from '@/ui/Slider';
import { CameraStage } from '@/modules/shared/CameraStage';
import { AirCursorOverlay } from './AirCursorOverlay';
import { CalibrationFlow } from './CalibrationFlow';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import { useCursorEngine } from '@/hooks/useCursorEngine';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, updateSettings } from '@/state/appStore';
import { visionStore } from '@/state/visionStore';
import { interactionStore } from '@/state/interactionStore';
import { formatGestureLabel } from '@/utils/format';

const HAND_TASK = { hand: true, face: false, pose: false };

/**
 * The cursor rendered here is a real pointer, not a decorative dot — it
 * dispatches genuine DOM pointer/mouse events (see
 * interaction/cursor/syntheticPointer.ts), so pinching over any button or
 * link anywhere in AIR OS actually activates it. It can't move the OS
 * mouse or reach outside this page — no browser page can — but within
 * AIR OS it's the real thing.
 */
export default function CursorModule() {
  const [calibrating, setCalibrating] = useState(false);
  const settings = useStoreSelector(appStore, (s) => s.settings);
  const vision = useStoreSelector(visionStore, (s) => s);
  const cursor = useStoreSelector(interactionStore, (s) => s.cursor);
  const trackingState = useStoreSelector(interactionStore, (s) => s.trackingState);
  const activeGesture = useActiveGesture();

  useVisionTask(HAND_TASK);
  useCursorEngine();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-slow" />
          Phase 4 — Air Cursor
        </div>
        <h1 className="mt-3 text-2xl font-medium text-ink-0">Air Cursor</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-2">
          Point to move the cursor, pinch to click or drag, open palm to pause. It's a real pointer — try
          pinching on a nav link in the sidebar.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <CameraStage
          demoDescription="Try Air Cursor with a synthetic recorded hand — no camera access needed."
          extraControls={(isDemoMode) => (
            <Button
              variant="secondary"
              onClick={() => setCalibrating(true)}
              disabled={isDemoMode}
              title={isDemoMode ? 'Calibration needs a real hand — turn off Demo Mode first.' : undefined}
            >
              Calibrate Reach
            </Button>
          )}
          controlsNote={(isDemoMode) =>
            isDemoMode ? (
              <p className="mb-4 text-xs text-ink-3">
                Calibration needs your actual reach, not the demo hand's canned motion — turn off Demo Mode to
                calibrate.
              </p>
            ) : null
          }
        />

        <div className="flex flex-col gap-5">
          <Panel eyebrow="Cursor" title="Live State">
            <Readout label="Tracking" value={trackingState} method="DERIVED" />
            <Readout
              label="Gesture"
              value={
                activeGesture && activeGesture.gesture !== 'NONE'
                  ? `${formatGestureLabel(activeGesture.gesture)} · ${activeGesture.confidence.toFixed(2)}`
                  : '—'
              }
              method="HEURISTIC"
            />
            <Readout
              label="Position"
              value={cursor.x !== null && cursor.y !== null ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)}` : '—'}
              unit="px"
              method="DERIVED"
            />
            <Readout label="Dragging" value={cursor.dragging ? 'Yes' : 'No'} method="DERIVED" />
            <Readout label="Hands tracked" value={vision.handsPresent} method="DERIVED" />
          </Panel>

          <Panel eyebrow="Tuning" title="Cursor Smoothing">
            <Slider
              label="Min cutoff"
              description="Lower = smoother while still, more lag."
              value={settings.cursorMinCutoff}
              min={0.1}
              max={3}
              step={0.1}
              formatValue={(v) => v.toFixed(1)}
              onChange={(v) => updateSettings({ cursorMinCutoff: v })}
            />
            <Slider
              label="Beta"
              description="Higher = less lag while moving fast, less jitter suppression."
              value={settings.cursorBeta}
              min={0}
              max={0.5}
              step={0.01}
              formatValue={(v) => v.toFixed(2)}
              onChange={(v) => updateSettings({ cursorBeta: v })}
            />
          </Panel>
        </div>
      </section>

      <AirCursorOverlay />
      {calibrating && <CalibrationFlow onDone={() => setCalibrating(false)} />}
    </div>
  );
}
