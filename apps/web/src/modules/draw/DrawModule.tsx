import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraStage } from '@/modules/shared/CameraStage';
import { DrawCanvas, type DrawCanvasHandle } from './DrawCanvas';
import { useDrawKeyboardCommands } from './useDrawKeyboardCommands';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useDrawEngine } from '@/hooks/useDrawEngine';
import { useStore } from '@/hooks/useStore';
import {
  DRAW_COLOR_NAMES,
  DRAW_COLORS,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  drawStore,
  setDrawBrushSize,
  setDrawColor,
} from './drawStore';
import { clear, redo, undo } from './drawStrokes';
import { canvasToPngBlob, downloadCanvasAsPng } from './drawExport';
import { deleteDrawing, listDrawings, saveDrawing, type GalleryEntry } from './drawGallery';
import { Panel } from '@/ui/Panel';
import { Readout } from '@/ui/Readout';
import { Button } from '@/ui/Button';
import { Slider } from '@/ui/Slider';
import { formatDateTime } from '@/utils/format';

const HAND_TASK = { hand: true, face: false, pose: false };

/** "draw" -> "Draw". Display-only, same spirit as utils/format.ts's
 *  formatGestureLabel but for DrawTool rather than GestureKind. */
function formatTool(tool: string): string {
  return tool.charAt(0).toUpperCase() + tool.slice(1);
}

interface GalleryItem {
  id: number;
  createdAt: number;
  url: string;
}

/**
 * A drawing canvas where the fingertip is the brush — pinch to draw, fist
 * to erase, open palm (or anything else) to lift. Full mouse parity too
 * (click-drag on the canvas), since a camera shouldn't be required to use
 * the module at all — same "camera-less full capability" bar Air Cursor
 * and 3D Studio hold themselves to.
 *
 * `DrawEngine` only reports a filtered fingertip pointer + raw gesture;
 * turning that into paint, and everything downstream of a finished stroke
 * (undo/redo, color/size, PNG export, the IndexedDB gallery), lives in this
 * module — see `DrawCanvas.tsx`'s doc comment for the split.
 */
export default function DrawModule() {
  useVisionTask(HAND_TASK);
  useDrawEngine();
  useDrawKeyboardCommands();

  const canvasHandleRef = useRef<DrawCanvasHandle>(null);
  const draw = useStore(drawStore);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const galleryRef = useRef<GalleryItem[]>([]);
  const [busy, setBusy] = useState<'save' | 'export' | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  // A permanent IndexedDB delete had no confirmation at all (CLAUDE.md
  // UI/UX audit finding #9) — Air Draw is otherwise careful about this
  // exact hazard (`clear()` pushes onto the redo stack instead of
  // discarding), so the gallery gets the same "ask before you can't undo
  // it" treatment rather than a silent one-click delete.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const refreshGallery = useCallback(async () => {
    try {
      const entries = await listDrawings();
      setGallery((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.url));
        return entries.map((entry: GalleryEntry) => ({
          id: entry.id,
          createdAt: entry.createdAt,
          url: URL.createObjectURL(entry.blob),
        }));
      });
      setGalleryError(null);
    } catch {
      setGalleryError('Could not load the local gallery — IndexedDB may be unavailable in this browser.');
    }
  }, []);

  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);

  useEffect(() => {
    void refreshGallery();
    return () => {
      galleryRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [refreshGallery]);

  const handleSaveToGallery = async () => {
    const canvas = canvasHandleRef.current?.getCanvas();
    if (!canvas) return;
    setBusy('save');
    try {
      const blob = await canvasToPngBlob(canvas);
      await saveDrawing(blob);
      await refreshGallery();
    } catch {
      setGalleryError('Could not save to the local gallery — IndexedDB may be unavailable in this browser.');
    } finally {
      setBusy(null);
    }
  };

  const handleExportPng = async () => {
    const canvas = canvasHandleRef.current?.getCanvas();
    if (!canvas) return;
    setBusy('export');
    try {
      await downloadCanvasAsPng(canvas);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteFromGallery = async (id: number) => {
    await deleteDrawing(id);
    setPendingDeleteId(null);
    await refreshGallery();
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-slow" />
          Fingertip brush · pinch to draw, fist to erase
        </div>
        <h1 className="mt-3 text-2xl font-medium text-ink-0">Air Draw</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-2">
          Pinch to draw, make a fist to erase, open your palm to lift the brush. No camera handy?
          Click and drag with a mouse — same canvas, same strokes. Prefer the keyboard? Focus the
          canvas below, move with the arrow keys, hold Space to draw, and press E to switch to the
          eraser.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="flex flex-col gap-5">
          <CameraStage demoDescription="Try Air Draw with a synthetic recorded hand — no camera access needed." />

          <Panel eyebrow="Draw" title="Live State">
            <Readout label="Tool" value={formatTool(draw.tool)} method="DERIVED" />
            <Readout label="Hand" value={draw.activeHand ?? '—'} method="MODEL" />
            <Readout label="Strokes" value={draw.strokeCount} method="DERIVED" />
          </Panel>

          <Panel eyebrow="Brush" title="Color & Size">
            <div className="flex flex-wrap gap-2 py-1">
              {DRAW_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Use colour ${DRAW_COLOR_NAMES[color] ?? color}`}
                  aria-pressed={draw.color === color}
                  onClick={() => setDrawColor(color)}
                  className="h-7 w-7 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: color,
                    borderColor: draw.color === color ? '#f4f6fb' : 'transparent',
                    transform: draw.color === color ? 'scale(1.1)' : undefined,
                  }}
                />
              ))}
            </div>
            <Slider
              label="Brush size"
              value={draw.brushSize}
              min={MIN_BRUSH_SIZE}
              max={MAX_BRUSH_SIZE}
              step={1}
              formatValue={(v) => `${v}px`}
              onChange={setDrawBrushSize}
            />
          </Panel>

          <Panel eyebrow="Edit" title="Undo, Redo & Clear">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={undo} disabled={!draw.canUndo}>
                Undo
              </Button>
              <Button variant="secondary" size="sm" onClick={redo} disabled={!draw.canRedo}>
                Redo
              </Button>
              <Button variant="danger" size="sm" onClick={clear} disabled={draw.strokeCount === 0}>
                Clear
              </Button>
            </div>
          </Panel>

          <Panel eyebrow="Save" title="Export & Gallery">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={handleExportPng} disabled={busy !== null}>
                {busy === 'export' ? 'Exporting…' : 'Export as PNG'}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleSaveToGallery} disabled={busy !== null}>
                {busy === 'save' ? 'Saving…' : 'Save to Gallery'}
              </Button>
            </div>
            {galleryError && (
              <p role="alert" className="mt-3 text-xs text-danger-500">
                {galleryError}
              </p>
            )}
            {gallery.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {gallery.map((item) => {
                  const savedAt = formatDateTime(item.createdAt);
                  const confirming = pendingDeleteId === item.id;
                  return (
                    <div key={item.id} className="group relative overflow-hidden rounded-lg border border-border">
                      <img
                        src={item.url}
                        alt={`Drawing saved ${savedAt}`}
                        className="aspect-square w-full object-contain bg-surface-1"
                      />
                      <div className="absolute inset-x-0 bottom-0 truncate bg-surface-0/80 px-1.5 py-1 text-[10px] text-ink-3">
                        {savedAt}
                      </div>
                      {confirming ? (
                        <div className="absolute right-1 top-1 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDeleteFromGallery(item.id)}
                            className="rounded-md bg-danger-500/90 px-1.5 py-0.5 text-[10px] font-medium text-surface-0 outline-none transition-colors hover:bg-danger-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400"
                          >
                            Delete?
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            aria-label="Cancel delete"
                            className="rounded-md bg-surface-0/80 px-1.5 py-0.5 text-[10px] text-ink-2 outline-none transition-colors hover:text-ink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(item.id)}
                          aria-label={`Delete drawing saved ${savedAt}`}
                          className="absolute right-1 top-1 rounded-md bg-surface-0/80 px-1.5 py-0.5 text-[10px] text-ink-2 opacity-0 outline-none transition-opacity hover:text-danger-500 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400 group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <Panel eyebrow="Canvas" title="Drawing Surface" padded={false} className="overflow-hidden">
          {/* aspect-square + max-h, not a fixed 560px — at narrow viewports a
              flat height forced a tall, narrow strip that distorted anything
              drawn on a wider screen, since strokes are stored normalized
              (CLAUDE.md UI/UX audit finding #24). */}
          <div className="aspect-square max-h-[560px] w-full">
            <DrawCanvas ref={canvasHandleRef} />
          </div>
        </Panel>
      </section>
    </div>
  );
}
