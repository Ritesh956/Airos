import { useRef } from 'react';
import { useStore } from '@/hooks/useStore';
import { useModalDialog } from '@/hooks/useModalDialog';
import {
  presentStore,
  nextSlide,
  prevSlide,
  goToSlide,
  startTimer,
  pauseTimer,
  resetTimer,
  toggleLegend,
  toggleNotes,
  getElapsedMs,
} from './presentStore';
import { SLIDES } from './slides';
import { Button } from '@/ui/Button';
import { formatDuration } from '@/utils/format';
import { cn } from '@/utils/cn';

export const GESTURE_LEGEND = [
  { gesture: 'Swipe Left', action: 'Next slide' },
  { gesture: 'Swipe Right', action: 'Previous slide' },
  { gesture: 'Thumbs Up', action: 'Start timer' },
  { gesture: 'Fist', action: 'Pause timer' },
  { gesture: 'Open Palm', action: 'Toggle this legend' },
] as const;

/**
 * The slide itself, plus every control a presenter needs — always
 * reachable by mouse or keyboard (nothing here is hover-only or
 * gesture-only, per IMPLEMENTATION.md §1.6's keyboard-fallback rule).
 * `showLegend`/`showNotes` are plain toggled panels, not hidden-until-
 * hovered UI, specifically to avoid the accessibility trap of controls
 * that only appear on mouse hover or a held gesture.
 */
export function SlideStage() {
  const present = useStore(presentStore);
  const slide = SLIDES[present.slideIndex]!;
  const isFirst = present.slideIndex === 0;
  const isLast = present.slideIndex === SLIDES.length - 1;

  const legendCloseRef = useRef<HTMLButtonElement>(null);
  const legendTriggerRef = useRef<HTMLButtonElement>(null);

  // The standard modal-dialog contract (trap/Escape/restore-focus/
  // scroll-lock), shared with CommandPalette and CalibrationFlow — see
  // useModalDialog's doc comment (CLAUDE.md UI/UX audit finding #26). This
  // overlay is small enough that the trap and the explicit close button
  // are the only two focusable descendants, but it gets the same contract
  // as every other dialog in the app rather than a hand-rolled subset of it.
  const legendDialogRef = useModalDialog<HTMLDivElement>({
    open: present.showLegend,
    onClose: toggleLegend,
    initialFocusRef: legendCloseRef,
    restoreFocusRef: legendTriggerRef,
  });

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
        <h2 className="text-3xl font-medium text-ink-0">{slide.title}</h2>
        <ul className="flex flex-col gap-3">
          {slide.bullets.map((bullet) => (
            <li key={bullet} className="max-w-lg text-base text-ink-2">
              {bullet}
            </li>
          ))}
        </ul>
      </div>

      {present.showNotes && (
        <div className="border-t border-border bg-surface-1 px-6 py-3 text-xs text-ink-3">
          <span className="font-medium text-ink-2">Speaker notes: </span>
          {slide.notes}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={prevSlide} disabled={isFirst}>
            ← Prev
          </Button>
          <div className="flex items-center px-1">
            {SLIDES.map((s, i) => (
              // The dot itself stays a slim 6px visual — the button around
              // it is a full 24px hit target (WCAG 2.5.8), padding rather
              // than growing the dot (CLAUDE.md UI/UX audit finding #7).
              <button
                key={s.id}
                type="button"
                aria-label={`Go to slide ${i + 1}: ${s.title}`}
                aria-current={i === present.slideIndex}
                onClick={() => goToSlide(i)}
                className="group flex h-6 w-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400"
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    i === present.slideIndex ? 'bg-signal-400' : 'bg-surface-3 group-hover:bg-surface-2',
                  )}
                />
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={nextSlide} disabled={isLast}>
            Next →
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-mono-tabular text-xs text-ink-2">{formatDuration(getElapsedMs())}</span>
          {present.isTimerRunning ? (
            <Button variant="secondary" size="sm" onClick={() => pauseTimer()}>
              Pause
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => startTimer()}>
              Start
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={resetTimer}>
            Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleNotes}>
            {present.showNotes ? 'Hide Notes' : 'Notes'}
          </Button>
          <Button ref={legendTriggerRef} variant="ghost" size="sm" onClick={toggleLegend}>
            Legend
          </Button>
        </div>
      </div>

      {present.showLegend && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-0/80 backdrop-blur-sm">
          <div
            ref={legendDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gesture-legend-title"
            className="glass-panel w-72 rounded-2xl p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 id="gesture-legend-title" className="text-sm font-medium text-ink-0">
                Gesture Legend
              </h3>
              <button
                ref={legendCloseRef}
                type="button"
                onClick={toggleLegend}
                aria-label="Close legend"
                className="text-ink-3 outline-none transition-colors hover:text-ink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400"
              >
                ✕
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {GESTURE_LEGEND.map((item) => (
                <li key={item.gesture} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-ink-2">{item.gesture}</span>
                  <span className="text-ink-0">{item.action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
