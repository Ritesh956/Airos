import { useEffect, useRef } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { cn } from '@/utils/cn';

/**
 * Renders the live camera feed (mirrored for the user, since a mirrored
 * feed is what makes "my hand" feel like "my hand" — see utils/coords.ts
 * for why landmark math never mirrors, only this presentation layer does).
 *
 * This component owns no camera lifecycle logic itself; it only attaches
 * to whatever `useCamera` currently has running.
 */
export function CameraPreview({ className }: { className?: string }) {
  const { state, attach } = useCamera();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) attach(videoRef.current);
  }, [attach, state]);

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <video
        ref={videoRef}
        className="h-full w-full scale-x-[-1] object-cover"
        muted
        playsInline
      />
      {state !== 'active' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-1/60 text-xs text-ink-3">
          {state === 'starting' ? 'Starting camera…' : 'No signal'}
        </div>
      )}
    </div>
  );
}
