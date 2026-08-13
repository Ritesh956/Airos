import { useEffect, useRef } from 'react';
import { useStoreSelector } from '@/hooks/useStore';
import { visionStore } from '@/state/visionStore';
import { LOW_FPS_THRESHOLD, RECOVERY_FPS_THRESHOLD } from '@/vision/perf/degradationLadder';

const GRAPH_HEIGHT = 160;
const AXIS_MAX_FPS = 60;

/**
 * Plots visionStore.fpsHistory — the real inter-frame-arrival measurement
 * from visionStore.ts's recordFrameArrival(), not a synthesized curve — as
 * a line chart. Not a hot-path canvas: fpsHistory only changes when the
 * store's own ~10Hz throttled publish fires (see visionStore.ts), so a
 * plain effect keyed on the array reference is enough; this never needs
 * its own requestAnimationFrame loop the way HandSkeletonOverlay does.
 *
 * The two reference lines are the exact thresholds
 * vision/perf/DegradationController.ts itself acts on (LOW_FPS_THRESHOLD/
 * RECOVERY_FPS_THRESHOLD) — not a loose conversion of the ms-based frame-
 * time budget in IMPLEMENTATION.md §9's table, which measures a different
 * thing (total per-frame processing time, not raw inter-frame rate) and
 * would misrepresent itself as "the same number" on an FPS axis.
 */
export function FpsGraph() {
  const history = useStoreSelector(visionStore, (s) => s.fpsHistory);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = GRAPH_HEIGHT;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const yFor = (fps: number) => height - (Math.min(fps, AXIS_MAX_FPS) / AXIS_MAX_FPS) * height;

    // Reference lines first, so the plotted line draws on top.
    const drawReferenceLine = (fps: number, color: string) => {
      const y = yFor(fps);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawReferenceLine(RECOVERY_FPS_THRESHOLD, 'rgba(148, 163, 184, 0.35)');
    drawReferenceLine(LOW_FPS_THRESHOLD, 'rgba(239, 68, 68, 0.45)');

    if (history.length < 2) return;

    const stepX = width / (history.length - 1);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    history.forEach((fps, i) => {
      const x = i * stepX;
      const y = yFor(fps);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under the line, faint, for a readable silhouette at a glance.
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.fill();
  }, [history]);

  // The one number on this chart that exists nowhere else in text — a
  // plain <canvas> reports nothing to a screen reader (CLAUDE.md UI/UX
  // audit finding #21), so summarize the same samples the line plots.
  const latest = history.length > 0 ? Math.round(history[history.length - 1]!) : null;
  const min = history.length > 0 ? Math.round(Math.min(...history)) : null;
  const max = history.length > 0 ? Math.round(Math.max(...history)) : null;
  const graphLabel =
    latest !== null
      ? `Frame rate history. Currently ${latest} frames per second, ranging from ${min} to ${max} over the last ${history.length} samples.`
      : 'Frame rate history. No samples yet.';

  return (
    <div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={graphLabel}
        className="w-full"
        style={{ height: GRAPH_HEIGHT }}
      />
      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-3">
        <span>0 fps</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-danger-500/60" /> {LOW_FPS_THRESHOLD} fps — ladder trigger
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-ink-3/60" /> {RECOVERY_FPS_THRESHOLD} fps — recovery
          </span>
        </span>
        <span>{AXIS_MAX_FPS} fps</span>
      </div>
    </div>
  );
}
