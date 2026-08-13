import { useEffect, useRef } from 'react';
import { visionEngine } from '@/vision/engine/VisionEngine';
import type { VisionFrame } from '@/vision/types';
import { mirrorLandmark } from '@/utils/coords';
import { appStore } from '@/state/appStore';
import { interactionStore } from '@/state/interactionStore';
import { useStoreSelector } from '@/hooks/useStore';
import { cn } from '@/utils/cn';

// A muted outline for the face's overall shape — distinct from the eye/
// mouth accents below so "mesh" reads as a separate layer from what the
// phase is actually highlighting.
const OVAL_COLOR = '#5b6478';
// Matches --color-signal-400, same "tracking" accent HandSkeletonOverlay
// uses, applied here to eyes/eyebrows specifically.
const EYE_COLOR = '#5eead4';
const LIPS_COLOR = '#fbbf24'; // --color-warning-500

type Connection = { start: number; end: number };
type ConnectionGroup = { connections: readonly Connection[]; color: string };

// Same reasoning as HandSkeletonOverlay.tsx's getHandConnections(): these
// are static index-pair arrays baked into @mediapipe/tasks-vision's JS
// wrapper, and this overlay is reachable from Gesture Lab regardless of
// whether face tracking is on — fetched lazily so the package isn't pulled
// into the eagerly-loaded bundle just for these constants.
let connectionGroupsPromise: Promise<ConnectionGroup[]> | null = null;
function getConnectionGroups(): Promise<ConnectionGroup[]> {
  if (!connectionGroupsPromise) {
    connectionGroupsPromise = import('@mediapipe/tasks-vision').then((m) => [
      { connections: m.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, color: OVAL_COLOR },
      { connections: m.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, color: EYE_COLOR },
      { connections: m.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, color: EYE_COLOR },
      { connections: m.FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, color: EYE_COLOR },
      { connections: m.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, color: EYE_COLOR },
      { connections: m.FaceLandmarker.FACE_LANDMARKS_LIPS, color: LIPS_COLOR },
    ]);
  }
  return connectionGroupsPromise;
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: VisionFrame,
  show: boolean,
  groups: ConnectionGroup[] | null,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!show || !frame.face || !groups) return;

  const points = frame.face.landmarks.map((l) => {
    const mirrored = mirrorLandmark(l);
    return { x: mirrored.x * width, y: mirrored.y * height };
  });

  ctx.lineWidth = Math.max(1, width * 0.0018);
  for (const group of groups) {
    ctx.strokeStyle = group.color;
    ctx.beginPath();
    for (const connection of group.connections) {
      const start = points[connection.start];
      const end = points[connection.end];
      if (!start || !end) continue;
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    }
    ctx.stroke();
  }
}

/**
 * Draws face mesh/eye/eyebrow/lips contours over the camera preview —
 * Phase 9's visualization, structurally identical to
 * `HandSkeletonOverlay.tsx` (same hot-path subscription, same mirroring,
 * same bug-#9 tracking-loss clear) but deliberately narrower in *what* it
 * draws: only the oval/eye/eyebrow/lips connection groups, never the full
 * ~7000-edge tesselation (too visually dense to read as anything but
 * noise) and never a derived "openness" or expression readout anywhere —
 * this phase's gate is tracking only, no attribute claims, so the only
 * thing rendered is raw MODEL landmark positions, geometrically connected.
 */
export function FaceMeshOverlay({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showFaceMesh = useStoreSelector(appStore, (s) => s.settings.showFaceMesh);
  const trackingState = useStoreSelector(interactionStore, (s) => s.trackingState);
  const showRef = useRef(showFaceMesh);
  const groupsRef = useRef<ConnectionGroup[] | null>(null);
  showRef.current = showFaceMesh;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    void getConnectionGroups().then((groups) => {
      groupsRef.current = groups;
    });

    const unsubscribe = visionEngine.subscribe((frame) => {
      draw(ctx, canvas.width, canvas.height, frame, showRef.current, groupsRef.current);
    });

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
    };
  }, []);

  // Same staleness fix HandSkeletonOverlay needed (bug #9): frames stop
  // arriving entirely once tracking stops, so nothing else would ever
  // clear the last-drawn mesh.
  useEffect(() => {
    if (trackingState === 'tracking') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, [trackingState]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  );
}
