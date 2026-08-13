import { useEffect, useRef } from 'react';
import { visionEngine } from '@/vision/engine/VisionEngine';
import type { VisionFrame } from '@/vision/types';
import { mirrorLandmark } from '@/utils/coords';
import { appStore } from '@/state/appStore';
import { interactionStore } from '@/state/interactionStore';
import { useStoreSelector } from '@/hooks/useStore';
import { cn } from '@/utils/cn';

// A distinct accent from the hand skeleton's --color-signal-400 teal and
// the face mesh's warm oval/lips colors, so all three overlays stay
// visually separable when more than one is active at once (Gesture Lab
// can run hand + face + pose together).
const SKELETON_COLOR = '#c084fc'; // --color-accent-violet-400-ish
const JOINT_COLOR = '#f4f6fb';

type Connection = { start: number; end: number };

// Same reasoning as HandSkeletonOverlay.tsx's getHandConnections() — a
// static index-pair array baked into @mediapipe/tasks-vision's JS wrapper,
// fetched lazily so the package isn't pulled into the eagerly-loaded
// bundle just for this constant.
let poseConnectionsPromise: Promise<readonly Connection[]> | null = null;
function getPoseConnections(): Promise<readonly Connection[]> {
  if (!poseConnectionsPromise) {
    poseConnectionsPromise = import('@mediapipe/tasks-vision').then((m) => m.PoseLandmarker.POSE_CONNECTIONS);
  }
  return poseConnectionsPromise;
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: VisionFrame,
  show: boolean,
  connections: readonly Connection[] | null,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!show || !frame.pose) return;

  const points = frame.pose.landmarks.map((l) => {
    const mirrored = mirrorLandmark(l);
    return { x: mirrored.x * width, y: mirrored.y * height };
  });

  if (connections) {
    ctx.strokeStyle = SKELETON_COLOR;
    ctx.lineWidth = Math.max(1.5, width * 0.0025);
    ctx.beginPath();
    for (const connection of connections) {
      const start = points[connection.start];
      const end = points[connection.end];
      if (!start || !end) continue;
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    }
    ctx.stroke();
  }

  const jointRadius = Math.max(2, width * 0.004);
  ctx.fillStyle = JOINT_COLOR;
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, jointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draws the 33-point pose skeleton over the camera preview — Phase 10's
 * visualization, structurally identical to `HandSkeletonOverlay.tsx` and
 * `FaceMeshOverlay.tsx` (same hot-path subscription bypassing the
 * throttled store, same mirroring via `utils/coords.ts`, same bug-#9
 * tracking-loss clear below). Draws every `PoseLandmarker.POSE_CONNECTIONS`
 * edge — unlike the face overlay, pose has no "too dense to read" problem
 * at only 33 points, so there's no subset curation needed the way the face
 * mesh's ~7000-edge tesselation required.
 */
export function PoseSkeletonOverlay({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showPoseSkeleton = useStoreSelector(appStore, (s) => s.settings.showPoseSkeleton);
  const trackingState = useStoreSelector(interactionStore, (s) => s.trackingState);
  const showRef = useRef(showPoseSkeleton);
  const connectionsRef = useRef<readonly Connection[] | null>(null);
  showRef.current = showPoseSkeleton;

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

    void getPoseConnections().then((connections) => {
      connectionsRef.current = connections;
    });

    const unsubscribe = visionEngine.subscribe((frame) => {
      draw(ctx, canvas.width, canvas.height, frame, showRef.current, connectionsRef.current);
    });

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
    };
  }, []);

  // Same staleness fix HandSkeletonOverlay/FaceMeshOverlay needed (bug #9):
  // frames stop arriving entirely once tracking stops, so nothing else
  // would ever clear the last-drawn skeleton.
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
