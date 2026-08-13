import { useEffect, useRef } from 'react';
import { gameEngine } from '@/interaction/game/GameEngine';
import * as gameApi from './gameState';
import { ENEMY_RADIUS, PROJECTILE_RADIUS, SHIP_RADIUS, SHIP_Y } from './gameSimulation';
import { cn } from '@/utils/cn';

const SHIP_COLOR = '#5eead4'; // --color-signal-400, the app-wide "you are in control" accent
const ENEMY_COLOR = '#f87171';
const PROJECTILE_COLOR = '#fbbf24';
const SHIELD_COLOR = '#818cf8';
const STAR_COLOR = 'rgba(244, 246, 251, 0.5)';

const KEYBOARD_MOVE_SPEED = 0.9; // normalized units/sec while an arrow key is held

// Same guard useGlobalKeyboardCommands.ts uses — without it, typing a space
// or an arrow key into the Command Palette's search box (or any other
// input on the page) would also fire/steer the ship out from under the
// user.
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

/** A handful of fixed pseudo-random star positions, generated once — a
 *  static backdrop, not an animated particle system, per the "interaction
 *  quality is the point, not the game design" brief this module's own
 *  placeholder (moduleRegistry.tsx, before this phase) already stated. */
const STARS = Array.from({ length: 60 }, (_, i) => {
  // A simple deterministic hash instead of Math.random(): every mount
  // renders the same starfield, which matters for visual stability across
  // re-renders (a canvas resize shouldn't reshuffle the stars).
  const seed = i * 928371 + 12345;
  const x = ((seed * 9301 + 49297) % 233280) / 233280;
  const y = ((seed * 4321 + 8765) % 104729) / 104729;
  return { x, y, r: 0.6 + (i % 3) * 0.4 };
});

function drawStarfield(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = STAR_COLOR;
  for (const star of STARS) {
    ctx.beginPath();
    ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShip(ctx: CanvasRenderingContext2D, x: number, width: number, height: number, shielded: boolean): void {
  const cx = x * width;
  const cy = SHIP_Y * height;
  const r = SHIP_RADIUS * Math.min(width, height);

  if (shielded) {
    ctx.strokeStyle = SHIELD_COLOR;
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = SHIP_COLOR;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy + r);
  ctx.lineTo(cx - r, cy + r);
  ctx.closePath();
  ctx.fill();
}

/**
 * Game Mode's canvas — the module-layer equivalent of `DrawCanvas.tsx`:
 * `GameEngine` only reports a generic filtered fingertip pointer + raw
 * gesture, so turning POINT-position into ship steering, PINCH into
 * fire, and OPEN_PALM into a shield lives here, one layer up.
 *
 * Runs its own `requestAnimationFrame` loop rather than subscribing to
 * `visionEngine`/`GameEngine` push updates, for the identical reason
 * `DrawCanvas.tsx` does (see its doc comment, and CLAUDE.md bug #9): a
 * push-subscription loop only redraws when a frame *arrives*, but this
 * game's own simulation (enemy descent, projectile travel) must keep
 * advancing every animation frame regardless of whether a hand is
 * currently tracked — a self-driven loop gets both for free.
 *
 * Full mouse/keyboard parity, same "camera-less full capability" bar
 * every pointer-driven module holds itself to: the mouse steers and
 * clicks to fire, arrow keys steer, Shift holds the shield.
 */
export function GameCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const keysHeld = new Set<string>();
    let shiftHeld = false;
    let wasPinching = false;
    let lastFrameAt = performance.now();
    let rafId: number;

    const renderFrame = () => {
      const now = performance.now();
      const dtMs = Math.min(100, now - lastFrameAt); // clamp so a dropped/backgrounded tab doesn't jump the sim
      lastFrameAt = now;

      const pointer = gameEngine.latest;
      if (pointer.visible && pointer.x !== null) {
        gameApi.moveShipTo(pointer.x);
        // Edge-detected (act only on the transition *into* PINCH) so
        // holding a pinch fires once, not once per frame.
        const isPinching = pointer.gesture === 'PINCH';
        if (isPinching && !wasPinching) gameApi.fire();
        wasPinching = isPinching;
      }

      if (keysHeld.has('ArrowLeft') || keysHeld.has('ArrowRight')) {
        const direction = keysHeld.has('ArrowRight') ? 1 : -1;
        const current = gameApi.getGameState().shipX;
        gameApi.moveShipTo(current + direction * KEYBOARD_MOVE_SPEED * (dtMs / 1000));
      }

      const shieldActive = shiftHeld || pointer.gesture === 'OPEN_PALM';
      gameApi.advance(dtMs, shieldActive);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      drawStarfield(ctx, width, height);

      const state = gameApi.getGameState();
      const minSide = Math.min(width, height);

      ctx.fillStyle = ENEMY_COLOR;
      for (const enemy of state.enemies) {
        ctx.beginPath();
        ctx.arc(enemy.x * width, enemy.y * height, ENEMY_RADIUS * minSide, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = PROJECTILE_COLOR;
      for (const projectile of state.projectiles) {
        ctx.beginPath();
        ctx.arc(projectile.x * width, projectile.y * height, PROJECTILE_RADIUS * minSide, 0, Math.PI * 2);
        ctx.fill();
      }

      if (state.status !== 'idle') {
        drawShip(ctx, state.shipX, width, height, shieldActive);
      }

      rafId = requestAnimationFrame(renderFrame);
    };
    rafId = requestAnimationFrame(renderFrame);

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      gameApi.moveShipTo(x);
    };
    const onClick = () => gameApi.fire();
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') keysHeld.add(event.key);
      if (event.key === 'Shift') shiftHeld = true;
      if (event.key === ' ' && !event.repeat) {
        event.preventDefault();
        gameApi.fire();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') keysHeld.delete(event.key);
      if (event.key === 'Shift') shiftHeld = false;
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn('h-full w-full cursor-crosshair touch-none bg-[#05070d]', className)}
    />
  );
}
