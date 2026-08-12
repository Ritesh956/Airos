import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import { useLatestFingertipRef } from '@/hooks/useLatestFingertip';
import { sanitizeReachBox, setReachBox } from '@/interaction/cursor/calibration';
import { Button } from '@/ui/Button';

type Step = 'top-left' | 'bottom-right';

const STEP_COPY: Record<Step, string> = {
  'top-left': 'Reach toward the top-left of where you can comfortably point, then pinch to confirm.',
  'bottom-right': 'Now the bottom-right corner. Pinch to confirm.',
};

/**
 * A short 2-corner calibration: without this, the screen's edges map to
 * the edge of the camera frame, where tracking is least reliable and the
 * user's arm is fully extended — see IMPLEMENTATION.md §1.9. Renders as a
 * full-viewport overlay (portaled above everything, including
 * AirCursorOverlay's z-index) so it also incidentally shields the rest of
 * the app from the pinches used to confirm each corner — those pinches
 * still flow through CursorEngine same as any other, so without this
 * overlay in the way they'd dispatch real clicks on whatever's behind it.
 */
export function CalibrationFlow({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('top-left');
  const [firstCorner, setFirstCorner] = useState<{ x: number; y: number } | null>(null);
  const fingertipRef = useLatestFingertipRef();
  const activeGesture = useActiveGesture();
  const markerRef = useRef<HTMLDivElement>(null);
  const wasPinching = useRef(false);

  useEffect(() => {
    let rafId: number;
    const loop = () => {
      const point = fingertipRef.current;
      const marker = markerRef.current;
      if (marker) {
        if (point) {
          marker.style.opacity = '1';
          marker.style.left = `${point.x * 100}%`;
          marker.style.top = `${point.y * 100}%`;
        } else {
          marker.style.opacity = '0';
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [fingertipRef]);

  const confirmCorner = () => {
    const point = fingertipRef.current;
    if (!point) return;

    if (step === 'top-left') {
      setFirstCorner(point);
      setStep('bottom-right');
      return;
    }

    if (firstCorner) {
      setReachBox(sanitizeReachBox({ minX: firstCorner.x, minY: firstCorner.y, maxX: point.x, maxY: point.y }));
    }
    onDone();
  };

  useEffect(() => {
    const isPinching = activeGesture?.gesture === 'PINCH';
    if (isPinching && !wasPinching.current) confirmCorner();
    wasPinching.current = isPinching;
    // confirmCorner intentionally omitted — it reads current step/corner
    // via closure each render and is not itself a dependency worth
    // re-subscribing on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGesture]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') confirmCorner();
      if (event.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, firstCorner]);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-6 bg-surface-0/90 backdrop-blur-sm">
      <div
        ref={markerRef}
        className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-signal-400 opacity-0"
      />
      <div className="max-w-sm text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-signal-400">
          Calibration · {step === 'top-left' ? '1 of 2' : '2 of 2'}
        </p>
        <p className="mt-2 text-sm text-ink-1">{STEP_COPY[step]}</p>
        <p className="mt-1 text-xs text-ink-3">Or press Enter to confirm at the current position.</p>
      </div>
      <Button variant="secondary" onClick={onDone}>
        Cancel (Esc)
      </Button>
    </div>,
    document.body,
  );
}
