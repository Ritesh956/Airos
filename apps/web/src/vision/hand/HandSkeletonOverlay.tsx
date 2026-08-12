import { useEffect, useRef } from 'react';
import { HandLandmarker } from '@mediapipe/tasks-vision';
import { visionEngine } from '@/vision/engine/VisionEngine';
import type { VisionFrame } from '@/vision/types';
import { mirrorLandmark } from '@/utils/coords';
import { appStore } from '@/state/appStore';
import { interactionStore } from '@/state/interactionStore';
import { useStoreSelector } from '@/hooks/useStore';
import { cn } from '@/utils/cn';

// Matches --color-signal-400 in index.css — the one accent reserved for
// "the system is tracking you right now" (see the design tokens comment
// there). Hardcoded here since canvas drawing can't read CSS custom
// properties directly.
const SKELETON_COLOR = '#5eead4';
const JOINT_COLOR = '#f4f6fb';

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: VisionFrame,
  showSkeleton: boolean,
  showLandmarkIndices: boolean,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!showSkeleton || frame.hands.length === 0) return;

  for (const hand of frame.hands) {
    const points = hand.landmarks.map((l) => {
      const mirrored = mirrorLandmark(l);
      return { x: mirrored.x * width, y: mirrored.y * height };
    });

    ctx.strokeStyle = SKELETON_COLOR;
    ctx.lineWidth = Math.max(1.5, width * 0.0025);
    ctx.beginPath();
    for (const connection of HandLandmarker.HAND_CONNECTIONS) {
      const start = points[connection.start];
      const end = points[connection.end];
      if (!start || !end) continue;
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    }
    ctx.stroke();

    const jointRadius = Math.max(2, width * 0.004);
    ctx.fillStyle = JOINT_COLOR;
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, jointRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Debug overlay (Gesture Lab, Phase 5): labels each joint with its
    // MediaPipe landmark index, so the on-canvas skeleton can be read
    // directly against the landmark table rather than counted by hand.
    if (showLandmarkIndices) {
      ctx.fillStyle = SKELETON_COLOR;
      ctx.font = `${Math.max(9, width * 0.014)}px monospace`;
      points.forEach((point, idx) => {
        ctx.fillText(String(idx), point.x + jointRadius + 2, point.y - jointRadius);
      });
    }
  }
}

/**
 * Draws the 21-point hand skeleton over the camera preview. Subscribes
 * directly to VisionEngine's per-frame hot path rather than visionStore —
 * this redraws on every detection, which the throttled store (~10Hz) is
 * deliberately too slow for. See ARCHITECTURE.md's "hot path vs. cold
 * path" — this component never touches React state for the draw itself.
 *
 * `showSkeletonOverlay`/`showDebugOverlay` are read from appStore so
 * Settings and Gesture Lab share one on/off switch rather than each
 * inventing a local-only toggle. They're mirrored into refs so the hot
 * per-frame subscription (set up once, on mount) can read their current
 * value without re-subscribing to VisionEngine every time a setting
 * changes.
 */
export function HandSkeletonOverlay({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showSkeleton = useStoreSelector(appStore, (s) => s.settings.showSkeletonOverlay);
  const showDebugOverlay = useStoreSelector(appStore, (s) => s.settings.showDebugOverlay);
  const trackingState = useStoreSelector(interactionStore, (s) => s.trackingState);
  const showSkeletonRef = useRef(showSkeleton);
  const showDebugOverlayRef = useRef(showDebugOverlay);
  showSkeletonRef.current = showSkeleton;
  showDebugOverlayRef.current = showDebugOverlay;

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

    const unsubscribe = visionEngine.subscribe((frame) => {
      draw(ctx, canvas.width, canvas.height, frame, showSkeletonRef.current, showDebugOverlayRef.current);
    });

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
    };
  }, []);

  // Frames stop arriving entirely once tracking stops (camera off, no task
  // acquired, source switched) — nothing then triggers a redraw to clear
  // the last frame's skeleton, leaving a frozen "ghost" hand on screen
  // indefinitely. Caught in Phase 5 browser verification by turning Demo
  // Mode off. Same staleness bug class as visionStore/VisionEngine's fixes,
  // just the one hot-path consumer that isn't state-driven so it needed
  // its own clear, keyed off the same trackingState signal.
  useEffect(() => {
    if (trackingState === 'tracking') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, [trackingState]);

  return (
    <canvas ref={canvasRef} className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />
  );
}
