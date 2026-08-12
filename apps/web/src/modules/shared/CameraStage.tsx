import { useState, type ReactNode } from 'react';
import { Panel } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { StatusPill } from '@/ui/StatusPill';
import { Toggle } from '@/ui/Toggle';
import { CameraPreview } from '@/vision/camera/CameraPreview';
import { HandSkeletonOverlay } from '@/vision/hand/HandSkeletonOverlay';
import { useCamera } from '@/hooks/useCamera';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, setInputSource } from '@/state/appStore';

interface CameraStageProps {
  eyebrow?: string;
  title?: string;
  demoDescription?: string;
  /** Extra buttons appended to the Start/Stop Camera control row. */
  extraControls?: (isDemoMode: boolean) => ReactNode;
  /** Rendered between the control row and the Demo Mode toggle. */
  controlsNote?: (isDemoMode: boolean) => ReactNode;
  /** An additional absolutely-positioned overlay layered into the preview,
   *  alongside the always-present hand skeleton — e.g. Gesture Lab's
   *  FaceMeshOverlay (Phase 9). Nothing by default. */
  extraOverlay?: ReactNode;
  /** Rendered after the Demo Mode toggle and any camera error message. */
  footer?: (isDemoMode: boolean) => ReactNode;
  className?: string;
}

/**
 * The camera-preview + skeleton overlay + Demo Mode toggle + Start/Stop
 * Camera block, used identically by every module that exercises live
 * tracking (Air Cursor, the Home camera panel, Gesture Lab). Factored out
 * once this became the third near-identical copy — see the Phase 5 handoff
 * note in CLAUDE.md. Each caller still owns its own readouts/controls
 * specific to what it's demonstrating, via the render-prop slots.
 */
export function CameraStage({
  eyebrow = 'Tracking Source',
  title = 'Camera',
  demoDescription = 'Use a synthetic recorded hand — no camera access needed.',
  extraControls,
  controlsNote,
  extraOverlay,
  footer,
  className,
}: CameraStageProps) {
  const { state, errorMessage, start, stop } = useCamera();
  const [starting, setStarting] = useState(false);
  const inputSource = useStoreSelector(appStore, (s) => s.inputSource);
  const isDemoMode = inputSource === 'replay';

  const handleStart = async () => {
    setStarting(true);
    try {
      await start();
    } catch {
      // useCamera already published the classified error into appStore.
    } finally {
      setStarting(false);
    }
  };

  return (
    <Panel eyebrow={eyebrow} title={title} action={<StatusPill state={state} />} className={className}>
      <div className="relative mb-4 aspect-video overflow-hidden rounded-xl border border-border bg-surface-1">
        {isDemoMode ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-surface-1 text-center">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-signal-400">
              Demo · Recorded
            </span>
            <span className="text-xs text-ink-3">Synthetic hand motion — no camera in use</span>
          </div>
        ) : (
          <CameraPreview className="h-full w-full" />
        )}
        <HandSkeletonOverlay />
        {extraOverlay}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isDemoMode ? null : state === 'active' || state === 'starting' ? (
          <Button variant="secondary" onClick={stop} disabled={state === 'starting'}>
            Stop Camera
          </Button>
        ) : (
          <Button variant="primary" onClick={handleStart} disabled={starting}>
            {starting ? 'Requesting Access…' : 'Start Camera'}
          </Button>
        )}
        {extraControls?.(isDemoMode)}
      </div>

      {controlsNote?.(isDemoMode)}

      <Toggle
        checked={isDemoMode}
        onChange={(checked) => setInputSource(checked ? 'replay' : 'camera')}
        label="Demo Mode"
        description={demoDescription}
      />

      {errorMessage && !isDemoMode && (
        <p className="mt-3 rounded-lg border border-danger-500/30 bg-danger-500/10 p-3 text-xs text-danger-500">
          {errorMessage}
        </p>
      )}

      {footer?.(isDemoMode)}
    </Panel>
  );
}
