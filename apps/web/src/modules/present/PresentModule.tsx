import { CameraStage } from '@/modules/shared/CameraStage';
import { SlideStage, GESTURE_LEGEND } from './SlideStage';
import { usePresentGestureCommands } from './usePresentGestureCommands';
import { usePresentKeyboardCommands } from './usePresentKeyboardCommands';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useActiveGesture } from '@/hooks/useActiveGesture';
import { useStore } from '@/hooks/useStore';
import { presentStore, getElapsedMs } from './presentStore';
import { SLIDES } from './slides';
import { Panel } from '@/ui/Panel';
import { Readout } from '@/ui/Readout';
import { formatDuration, formatGestureLabel } from '@/utils/format';

const HAND_TASK = { hand: true, face: false, pose: false };

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-0">
      {children}
    </kbd>
  );
}

/**
 * Drives a slide deck with swipes — no clicker, no keyboard, no assistant
 * hovering by the laptop. Unlike Cursor/Studio/Draw, this module needs no
 * per-frame fingertip position, only the gesture classifications every
 * other module already publishes into `interactionStore.activeGesture` —
 * see usePresentGestureCommands.ts for why that means no
 * `interaction/present/` engine exists for this phase.
 *
 * Demo Mode can fully exercise the core interaction here (unlike 3D
 * Studio's two-hand gesture): the synthetic fixture's SWIPE_LEFT keyframe
 * advances slides for real, driven through the exact same code path a
 * live swipe would use.
 */
export default function PresentModule() {
  useVisionTask(HAND_TASK);
  usePresentGestureCommands();
  usePresentKeyboardCommands();

  const activeGesture = useActiveGesture();
  const present = useStore(presentStore);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-slow" />
          Phase 8 — Presentation
        </div>
        <h1 className="mt-3 text-2xl font-medium text-ink-0">Presentation</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-2">
          Swipe left or right to move through the deck, thumbs up to start the timer, a fist to pause
          it, open your palm to peek at the gesture legend. No camera handy? Every control here works
          with a mouse and keyboard too.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="flex flex-col gap-5">
          <CameraStage demoDescription="Try Presentation with a synthetic recorded hand — no camera access needed." />

          <Panel eyebrow="Present" title="Live State">
            <Readout label="Slide" value={`${present.slideIndex + 1} / ${SLIDES.length}`} method="DERIVED" />
            <Readout
              label="Gesture"
              value={
                activeGesture && activeGesture.gesture !== 'NONE'
                  ? `${formatGestureLabel(activeGesture.gesture)} · ${activeGesture.confidence.toFixed(2)}`
                  : '—'
              }
              method="HEURISTIC"
            />
            <Readout label="Timer" value={formatDuration(getElapsedMs())} method="DERIVED" />
            <Readout label="Timer running" value={present.isTimerRunning ? 'Yes' : 'No'} method="DERIVED" />
          </Panel>

          <Panel eyebrow="Reference" title="Gesture Legend">
            <ul className="flex flex-col gap-2">
              {GESTURE_LEGEND.map((item) => (
                <li key={item.gesture} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-ink-2">{item.gesture}</span>
                  <span className="text-ink-0">{item.action}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel eyebrow="Controls" title="Keyboard">
            <ul className="flex flex-col gap-2 text-xs text-ink-2">
              <li className="flex items-center gap-2">
                <Key>←</Key> <Key>→</Key> previous / next slide
              </li>
              <li className="flex items-center gap-2">
                <Key>S</Key> start timer
              </li>
              <li className="flex items-center gap-2">
                <Key>P</Key> pause timer
              </li>
              <li className="flex items-center gap-2">
                <Key>R</Key> reset timer
              </li>
              <li className="flex items-center gap-2">
                <Key>H</Key> toggle gesture legend
              </li>
              <li className="flex items-center gap-2">
                <Key>N</Key> toggle speaker notes
              </li>
            </ul>
          </Panel>
        </div>

        <Panel eyebrow="Stage" title="Slide Deck" padded={false} className="overflow-hidden">
          <div style={{ height: 560 }}>
            <SlideStage />
          </div>
        </Panel>
      </section>
    </div>
  );
}
