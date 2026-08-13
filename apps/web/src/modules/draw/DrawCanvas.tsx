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
// Normalized units/sec while an arrow key is held — same constant shape as
// GameCanvas.tsx's KEYBOARD_MOVE_SPEED, tuned slower here since drawing
// benefits from finer control than steering a ship does.
const KEYBOARD_CURSOR_SPEED = 0.5;

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
 *
 * Full keyboard operation (§1.6): previously only Undo/Redo/Clear had a
 * keyboard path — the drawing action itself had none, unlike every other
 * gesture-driven module in the app. Focusing the canvas (Tab, or a click)
 * reveals a keyboard cursor moved by the arrow keys (the same
 * keysHeld-plus-per-frame-movement pattern `GameCanvas.tsx` already uses
 * for ship steering); holding Space draws or erases at that position,
 * exactly like a held PINCH/FIST would, and 'e' toggles which of the two
 * Space performs — mirroring a conventional paint tool's brush/eraser
 * switch rather than a held modifier chord.
 */
export const DrawCanvas = forwardRef<DrawCanvasHandle, { className?: string }>(function DrawCanvas(
  { className },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestureDrawingRef = useRef(false);
  const activeInputRef = useRef<'gesture' | 'mouse' | 'keyboard' | null>(null);
  const keyboardFocusedRef = useRef(false);
  const keyboardPosRef = useRef({ x: 0.5, y: 0.5 });
  const keysHeldRef = useRef(new Set<string>());
  const spaceHeldRef = useRef(false);
  const keyboardEraseRef = useRef(false);
  const keyboardDrawingRef = useRef(false);

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
    let lastFrameAt = performance.now();

    const renderFrame = () => {
      const now = performance.now();
      const dtMs = Math.min(100, now - lastFrameAt); // clamp so a backgrounded tab doesn't jump keyboard movement
      lastFrameAt = now;

      const { width, height } = canvas;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, width, height);

      for (const stroke of strokesApi.getStrokes()) renderStroke(ctx, stroke, width, height, dpr);
      const current = strokesApi.getCurrentStroke();
      if (current) renderStroke(ctx, current, width, height, dpr);

      const pointer = drawEngine.latest;
      const tool = toolForGesture(pointer);

      // Excludes 'keyboard' too, not just 'mouse' — the three input sources
      // are mutually exclusive, the same way mouse already excluded gesture
      // from also driving a stroke concurrently.
      if (activeInputRef.current !== 'mouse' && activeInputRef.current !== 'keyboard') {
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

      if (pointer.visible && activeInputRef.current !== 'mouse' && activeInputRef.current !== 'keyboard') {
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

      // Keyboard drawing (§1.6 parity — see the module doc comment): only
      // relevant while the canvas actually has focus, and mutually
      // exclusive with mouse/gesture the same way those exclude each other.
      if (keyboardFocusedRef.current && activeInputRef.current !== 'mouse' && activeInputRef.current !== 'gesture') {
        const keys = keysHeldRef.current;
        const dx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        const dy = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
        if (dx !== 0 || dy !== 0) {
          const pos = keyboardPosRef.current;
          pos.x = Math.min(1, Math.max(0, pos.x + dx * KEYBOARD_CURSOR_SPEED * (dtMs / 1000)));
          pos.y = Math.min(1, Math.max(0, pos.y + dy * KEYBOARD_CURSOR_SPEED * (dtMs / 1000)));
        }

        const keyboardTool: DrawTool = spaceHeldRef.current ? (keyboardEraseRef.current ? 'erase' : 'draw') : 'idle';
        const { x: kx, y: ky } = keyboardPosRef.current;

        if (keyboardTool === 'draw') {
          if (!keyboardDrawingRef.current) {
            strokesApi.beginStroke(kx, ky, drawStore.get().color, drawStore.get().brushSize);
            keyboardDrawingRef.current = true;
            activeInputRef.current = 'keyboard';
          } else {
            strokesApi.appendPoint(kx, ky);
          }
        } else if (keyboardDrawingRef.current) {
          strokesApi.commitStroke();
          keyboardDrawingRef.current = false;
          if (activeInputRef.current === 'keyboard') activeInputRef.current = null;
        }

        if (keyboardTool === 'erase') {
          strokesApi.eraseNear(kx, ky, strokesApi.ERASE_RADIUS);
        }

        publishToolSummary(keyboardTool, null);

        const { color, brushSize } = drawStore.get();
        const minSide = Math.min(width, height);
        const radius =
          keyboardTool === 'erase' ? strokesApi.ERASE_RADIUS * minSide : Math.max(2, (brushSize * dpr) / 2);
        ctx.strokeStyle =
          keyboardTool === 'erase' ? ERASE_CURSOR_COLOR : keyboardTool === 'draw' ? color : IDLE_CURSOR_COLOR;
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath();
        ctx.arc(kx * width, ky * height, radius, 0, Math.PI * 2);
        ctx.stroke();
        // A ring around the dot distinguishes "the keyboard cursor is here,
        // idle" from a same-sized gesture/mouse cursor — otherwise a
        // stationary keyboard-focused canvas looks identical to one with an
        // (invisible, off-camera) tracked hand paused over the same spot.
        if (keyboardTool === 'idle') {
          ctx.beginPath();
          ctx.arc(kx * width, ky * height, radius + 4 * dpr, 0, Math.PI * 2);
          ctx.stroke();
        }
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

    const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

    // Scoped to the canvas element itself, not window — unlike
    // GameCanvas.tsx's window-level listeners (which need an
    // isEditableTarget guard to avoid hijacking arrow keys/space from the
    // rest of the page), attaching directly to a focusable canvas means
    // these only ever fire while the canvas itself is the focused element,
    // with no separate guard needed.
    const onCanvasFocus = () => {
      keyboardFocusedRef.current = true;
    };
    const onCanvasBlur = () => {
      // A key's keyup never fires if focus leaves before it's released
      // (Tab away mid-press) — clear held state outright rather than
      // leaving the keyboard cursor "stuck" moving or drawing after focus
      // returns. Same reasoning as GameCanvas.tsx's window-blur handler.
      keyboardFocusedRef.current = false;
      keysHeldRef.current.clear();
      spaceHeldRef.current = false;
      if (activeInputRef.current === 'keyboard') {
        strokesApi.commitStroke();
        keyboardDrawingRef.current = false;
        activeInputRef.current = null;
      }
    };
    const onCanvasKeyDown = (event: KeyboardEvent) => {
      if (ARROW_KEYS.has(event.key)) {
        // Without this, arrow keys would also scroll the page while the
        // canvas has focus — same reasoning as GameCanvas.tsx's identical
        // preventDefault for ship steering.
        event.preventDefault();
        keysHeldRef.current.add(event.key);
      } else if (event.key === ' ') {
        event.preventDefault();
        spaceHeldRef.current = true;
      } else if (event.key === 'e' || event.key === 'E') {
        keyboardEraseRef.current = !keyboardEraseRef.current;
      }
    };
    const onCanvasKeyUp = (event: KeyboardEvent) => {
      if (ARROW_KEYS.has(event.key)) keysHeldRef.current.delete(event.key);
      else if (event.key === ' ') spaceHeldRef.current = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endMouseStroke);
    canvas.addEventListener('pointercancel', endMouseStroke);
    canvas.addEventListener('focus', onCanvasFocus);
    canvas.addEventListener('blur', onCanvasBlur);
    canvas.addEventListener('keydown', onCanvasKeyDown);
    canvas.addEventListener('keyup', onCanvasKeyUp);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endMouseStroke);
      canvas.removeEventListener('pointercancel', endMouseStroke);
      canvas.removeEventListener('focus', onCanvasFocus);
      canvas.removeEventListener('blur', onCanvasBlur);
      canvas.removeEventListener('keydown', onCanvasKeyDown);
      canvas.removeEventListener('keyup', onCanvasKeyUp);

      // A pinch (or mouse drag, or held-Space keyboard stroke) mid-
      // navigation-away shouldn't silently lose the stroke — commit
      // whatever's in progress rather than discarding it.
      if (activeInputRef.current !== null) strokesApi.commitStroke();
      publishToolSummary.cancel();
      resetDrawToolSummary();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      aria-label="Drawing surface. Click and drag with a mouse, pinch in the air over the camera, or focus this canvas and use the arrow keys to move the cursor, Space to draw, and E to switch between drawing and erasing."
      className={cn(
        'h-full w-full cursor-crosshair touch-none outline-none',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-400',
        className,
      )}
    />
  );
});
