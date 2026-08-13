import { useState } from 'react';
import { CameraStage } from '@/modules/shared/CameraStage';
import { Panel } from '@/ui/Panel';
import { Readout } from '@/ui/Readout';
import { Toggle } from '@/ui/Toggle';
import { LandmarkTable } from './LandmarkTable';
import { GestureTimeline } from './GestureTimeline';
import { FaceMeshOverlay } from '@/vision/face/FaceMeshOverlay';
import { PoseSkeletonOverlay } from '@/vision/pose/PoseSkeletonOverlay';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import { usePoseAngles } from '@/hooks/usePoseAngles';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, updateSettings } from '@/state/appStore';
import { visionStore } from '@/state/visionStore';
import { interactionStore } from '@/state/interactionStore';
import { formatGestureLabel } from '@/utils/format';

/**
 * An interactive laboratory view of exactly what the tracking pipeline
 * sees, frame by frame — the landmark table and gesture timeline are new
 * here; everything else (camera stage, live readouts, overlay toggles)
 * reuses Phase 1-4 primitives rather than rebuilding them. See CLAUDE.md's
 * Phase 5 section for the reuse checklist this was built against.
 *
 * Face tracking (Phase 9) and pose tracking (Phase 10) are opt-in via
 * "Track Face"/"Track Pose" rather than always requested alongside hands —
 * the task-subscription model exists specifically so a module doesn't pay
 * for a detector nobody's looking at (IMPLEMENTATION.md §1.2), and running
 * three MediaPipe tasks on every frame by default would be exactly that.
 * `useVisionTask` already reacts to its argument's fields changing, so this
 * is just a bit of React state, no new plumbing.
 */
export default function LabModule() {
  const [trackFace, setTrackFace] = useState(false);
  const [trackPose, setTrackPose] = useState(false);
  useVisionTask({ hand: true, face: trackFace, pose: trackPose });
  const activeGesture = useActiveGesture();
  const poseAngles = usePoseAngles();
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
        <CameraStage
          demoDescription="Explore the Gesture Lab with a synthetic recorded hand — no camera access needed."
          extraOverlay={
            <>
              <FaceMeshOverlay />
              <PoseSkeletonOverlay />
            </>
          }
        />

        <div className="flex flex-col gap-5">
          <Panel eyebrow="Pipeline" title="Live Readouts">
            <Readout label="Tracking" value={trackingState} method="DERIVED" />
            <Readout label="Hands tracked" value={vision.handsPresent} method="DERIVED" />
            {trackFace && (
              <Readout label="Face detected" value={vision.faceDetected ? 'Yes' : 'No'} method="DERIVED" />
            )}
            {trackPose && (
              <>
                <Readout label="Pose detected" value={vision.poseDetected ? 'Yes' : 'No'} method="DERIVED" />
                <Readout
                  label="Left elbow angle"
                  value={poseAngles.leftElbowDeg !== null ? poseAngles.leftElbowDeg.toFixed(0) : '—'}
                  unit="°"
                  method="DERIVED"
                />
                <Readout
                  label="Right elbow angle"
                  value={poseAngles.rightElbowDeg !== null ? poseAngles.rightElbowDeg.toFixed(0) : '—'}
                  unit="°"
                  method="DERIVED"
                />
                <Readout
                  label="Left knee angle"
                  value={poseAngles.leftKneeDeg !== null ? poseAngles.leftKneeDeg.toFixed(0) : '—'}
                  unit="°"
                  method="DERIVED"
                />
                <Readout
                  label="Right knee angle"
                  value={poseAngles.rightKneeDeg !== null ? poseAngles.rightKneeDeg.toFixed(0) : '—'}
                  unit="°"
                  method="DERIVED"
                />
              </>
            )}
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
            <Toggle
              checked={trackFace}
              onChange={setTrackFace}
              label="Track face"
              description="Run the face landmarker alongside hand tracking — tracking only, no expression or identity inference."
            />
            <Toggle
              checked={settings.showFaceMesh}
              onChange={(checked) => updateSettings({ showFaceMesh: checked })}
              label="Face mesh overlay"
              description="Draw the face oval, eyes, eyebrows, and lips over the camera preview."
              disabled={!trackFace}
            />
            <Toggle
              checked={trackPose}
              onChange={setTrackPose}
              label="Track pose"
              description="Run the pose landmarker alongside hand tracking and compute elbow/knee joint angles."
            />
            <Toggle
              checked={settings.showPoseSkeleton}
              onChange={(checked) => updateSettings({ showPoseSkeleton: checked })}
              label="Pose skeleton overlay"
              description="Draw the 33-point body skeleton over the camera preview."
              disabled={!trackPose}
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
