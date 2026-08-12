import { Readout } from '@/ui/Readout';
import { CameraStage } from '@/modules/shared/CameraStage';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import { useStoreSelector } from '@/hooks/useStore';
import { visionStore } from '@/state/visionStore';
import { formatGestureLabel } from '@/utils/format';

const HAND_TASK = { hand: true, face: false, pose: false };

/**
 * The one place that exercises the full pipeline end to end: camera
 * lifecycle (Phase 1) plus live hand tracking (Phase 2), with a Demo Mode
 * toggle that swaps the underlying LandmarkSource without this component
 * knowing or caring which one is active — see VisionEngine's doc comment.
 */
export function CameraControlPanel() {
  const vision = useStoreSelector(visionStore, (s) => s);

  // Acquiring the hand task here (rather than a dedicated Gesture Lab,
  // which is Phase 5) is what makes Phase 2's "2 hands tracked, ≥25fps"
  // gate demonstrable today. Demo Mode works even though the camera itself
  // was denied in some environments — it never calls getUserMedia.
  useVisionTask(HAND_TASK);
  const activeGesture = useActiveGesture();

  return (
    <CameraStage
      demoDescription="See AIR OS working with a synthetic recorded hand — no camera access needed."
      controlsNote={() => (
        <div className="mb-4 rounded-lg border border-border bg-surface-1/60 px-3">
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
        </div>
      )}
      footer={() => (
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          Camera processing happens locally in your browser. Frames are never uploaded, recorded, or
          sent to a server — tracking model inference runs entirely on this device.
        </p>
      )}
    />
  );
}
