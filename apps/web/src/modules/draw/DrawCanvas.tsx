import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { drawEngine, type DrawPointerState } from '@/interaction/draw/DrawEngine';
import { throttle } from '@/state/createStore';
import { drawStore, resetDrawToolSummary, setDrawToolSummary, type DrawTool } from './drawStore';
import * as strokesApi from './drawStrokes';
import type { Stroke } from './drawStrokes';
import { cn } from '@/utils/cn';

const TOOL_SUMMARY_INTERVAL_MS = 100; // matches the app's cold-path publish rate elsewhere (Cursor/gestureBridge)
const ERASE_CURSOR_COLOR = '#f87171';
const IDLE_CURSOR_COLOR = '#6b7280';

const publishToolSummary = throttle(setDrawToolSummary, TOOL_SUMMARY_INTERVAL_MS);

function toolForGesture(pointer: DrawPointerState): DrawTool {
  if (!pointer.visible) return 'idle';
  if (pointer.gesture === 'PINCH') return 'draw';
  if (pointer.gesture === 'FIST') return 'erase';
  return 'idle';
}

function toNormalized(clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
  };
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number, dpr: number): void {
  const lineWidth = Math.max(1, stroke.size * dpr);
  if (stroke.points.length === 1) {
    const p = stroke.points[0]!;
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  stroke.points.forEach((p, i) => {
    const px = p.x * width;
    const py = p.y * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

export interface DrawCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

/**
 * Air Draw's canvas — the module-layer equivalent of `StudioScene.tsx`'s
 * `useFrame` loop: `DrawEngine` only reports a generic filtered fingertip
 * pointer + raw gesture (see its doc comment for why), so turning PINCH/
 * FIST into actual strokes lives here, one layer up.
 *
 * Runs its own `requestAnimationFrame` loop (like `AirCursorOverlay`)
 * rather than subscribing to `visionEngine`/`DrawEngine` push updates
 * (like `HandSkeletonOverlay` does) — deliberately, because a
 * push-subscription loop only redraws when a new frame *arrives*, which
 * is exactly the mechanism behind CLAUDE.md bug #9 (a frozen "ghost"
 * overlay once frames stop arriving). A self-driven loop keeps ticking
 * every animation frame regardless of whether tracking is active, so the
 * brush/eraser cursor indicator disappears the instant `drawEngine.latest`
 * reports `visible: false` — no separate `trackingState`-watching effect
 * needed, unlike the skeleton overlay's fix. It also means any stroke
 * mutation (gesture-driven, mouse-driven, or a toolbar Undo/Redo/Clear
 * click) is picked up on the very next frame with no explicit invalidation
 * wiring, since `strokesApi`'s data is just read fresh every tick.
 *
 * Committed strokes persist across mount/unmount by design (module-level
 * singleton in `drawStrokes.ts`, not component state) — navigating away
 * from Air Draw and back doesn't lose a drawing, same as 3D Studio's
 * `studioTransforms`. Only an in-progress stroke is at risk on unmount,
 * so it's committed (not discarded) in the cleanup effect below.
 */
export const DrawCanvas = forwardRef<DrawCanvasHandle, { className?: string }>(function DrawCanvas(
  { className },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestureDrawingRef = useRef(false);
  const activeInputRef = useRef<'gesture' | 'mouse' | null>(null);

  useImperativeHandle(forwardedRef, () => ({ getCanvas: () => canvasRef.current }), []);

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

    let rafId: number;

    const renderFrame = () => {
      const { width, height } = canvas;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, width, height);

      for (const stroke of strokesApi.getStrokes()) renderStroke(ctx, stroke, width, height, dpr);
      const current = strokesApi.getCurrentStroke();
      if (current) renderStroke(ctx, current, width, height, dpr);

      const pointer = drawEngine.latest;
      const tool = toolForGesture(pointer);

      if (activeInputRef.current !== 'mouse') {
        if (tool === 'draw') {
          if (!gestureDrawingRef.current) {
            strokesApi.beginStroke(pointer.x!, pointer.y!, drawStore.get().color, drawStore.get().brushSize);
            gestureDrawingRef.current = true;
            activeInputRef.current = 'gesture';
          } else {
            strokesApi.appendPoint(pointer.x!, pointer.y!);
          }
        } else if (gestureDrawingRef.current) {
          strokesApi.commitStroke();
          gestureDrawingRef.current = false;
          activeInputRef.current = null;
        }

        if (tool === 'erase') {
          strokesApi.eraseNear(pointer.x!, pointer.y!, strokesApi.ERASE_RADIUS);
        }

        publishToolSummary(tool, pointer.hand);
      }

      if (pointer.visible && activeInputRef.current !== 'mouse') {
        const { color, brushSize } = drawStore.get();
        const minSide = Math.min(width, height);
        const radius =
          tool === 'erase' ? strokesApi.ERASE_RADIUS * minSide : Math.max(2, (brushSize * dpr) / 2);
        ctx.strokeStyle = tool === 'erase' ? ERASE_CURSOR_COLOR : tool === 'draw' ? color : IDLE_CURSOR_COLOR;
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath();
        ctx.arc(pointer.x! * width, pointer.y! * height, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || activeInputRef.current === 'gesture') return;
      canvas.setPointerCapture(event.pointerId);
      const { x, y } = toNormalized(event.clientX, event.clientY, canvas);
      strokesApi.beginStroke(x, y, drawStore.get().color, drawStore.get().brushSize);
      activeInputRef.current = 'mouse';
    };
    const onPointerMove = (event: PointerEvent) => {
      if (activeInputRef.current !== 'mouse') return;
      const { x, y } = toNormalized(event.clientX, event.clientY, canvas);
      strokesApi.appendPoint(x, y);
    };
    const endMouseStroke = () => {
      if (activeInputRef.current !== 'mouse') return;
      strokesApi.commitStroke();
      activeInputRef.current = null;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endMouseStroke);
    canvas.addEventListener('pointercancel', endMouseStroke);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endMouseStroke);
      canvas.removeEventListener('pointercancel', endMouseStroke);

      // A pinch (or mouse drag) mid-navigation-away shouldn't silently lose
      // the stroke — commit whatever's in progress rather than discarding it.
      if (activeInputRef.current !== null) strokesApi.commitStroke();
      publishToolSummary.cancel();
      resetDrawToolSummary();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn('h-full w-full cursor-crosshair touch-none', className)}
    />
  );
});
