import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cursorEngine } from '@/interaction/cursor/CursorEngine';

const COLOR_MOVE = '#5eead4'; // --color-signal-400
const COLOR_DRAG = '#fbbf24'; // --color-warning-500
const COLOR_PAUSED = '#6b7280'; // neutral grey — not tracking movement right now

function colorForState(gesture: string, dragging: boolean): string {
  if (dragging) return COLOR_DRAG;
  if (gesture === 'POINT' || gesture === 'PINCH') return COLOR_MOVE;
  return COLOR_PAUSED;
}

/**
 * The virtual pointer itself — a fixed-position element that follows
 * CursorEngine's hot-path state every frame via its own rAF loop, never
 * through React state or props. Rendering this as a re-render-on-every-
 * frame component would defeat the entire point of keeping cursor motion
 * off React's render path (see ARCHITECTURE.md's hot path / cold path
 * split); this component renders exactly once and then mutates DOM
 * styles directly, the same pattern HandSkeletonOverlay uses for the
 * skeleton.
 *
 * Portaled to document.body so it can sit above the entire app regardless
 * of where in the tree it's mounted, and marked pointer-events: none so
 * it never itself intercepts the clicks it's simulating on the element
 * underneath it.
 *
 * Driven by `cursorEngine.subscribe()` — its own push notification, fired
 * on every real vision frame while a hand is tracked and once more
 * whenever it's lost — rather than a perpetual `requestAnimationFrame`
 * loop. This component is mounted for the app's entire lifetime (AppShell,
 * every route), so a self-driven rAF loop ran and mutated DOM style
 * properties every animation frame regardless of whether Air Cursor was
 * even enabled or a hand had ever been in frame, meaning the app never
 * reached a genuinely idle state on any page. Subscribing means zero
 * ongoing work exists when nothing is happening, while the ring still
 * updates on every frame that actually matters — the same trade
 * `HandSkeletonOverlay` already makes against `visionEngine`'s hot-path
 * push instead of running its own loop.
 */
export function AirCursorOverlay() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const draw = () => {
      const state = cursorEngine.latest;
      const ring = ringRef.current;
      const dot = dotRef.current;
      if (!ring || !dot) return;

      const visible = state.visible && state.x !== null && state.y !== null;
      ring.style.opacity = visible ? '1' : '0';
      if (visible) {
        const scale = state.dragging ? 1.3 : 1;
        // One assignment, translate + scale together — setting
        // .style.transform replaces the whole property, so building it
        // in two places would silently drop whichever wasn't included
        // in the final write.
        ring.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) translate(-50%, -50%) scale(${scale})`;
        const color = colorForState(state.gesture, state.dragging);
        ring.style.borderColor = color;
        dot.style.backgroundColor = color;
        ring.style.boxShadow = `0 0 16px -2px ${color}`;
      }
    };

    draw();
    return cursorEngine.subscribe(draw);
  }, []);

  return createPortal(
    <div
      ref={ringRef}
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-10 w-10 rounded-full border-2 opacity-0 transition-[border-color,box-shadow] duration-150"
    >
      <div ref={dotRef} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" />
    </div>,
    document.body,
  );
}
