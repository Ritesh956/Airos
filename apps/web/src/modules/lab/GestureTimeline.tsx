import { useStoreSelector } from '@/hooks/useStore';
import { interactionStore } from '@/state/interactionStore';
import { Panel } from '@/ui/Panel';
import { MethodBadge } from '@/ui/MethodBadge';
import { formatClockTime, formatGestureLabel } from '@/utils/format';
import { mirrorHandedness } from '@/utils/coords';

/**
 * A scrolling log of gesture *transitions* (see gestureBridge.ts's
 * logGestureTransition) — newest first, so the most recent detection is
 * always visible without scrolling, the way a live log viewer usually
 * works. Not a per-frame sample: a held OPEN_PALM appears once, not 30x/sec.
 */
export function GestureTimeline() {
  const history = useStoreSelector(interactionStore, (s) => s.gestureHistory);

  return (
    <Panel eyebrow="History" title="Gesture Timeline" action={<MethodBadge method="HEURISTIC" />}>
      {history.length === 0 ? (
        <p className="text-sm text-ink-3">
          No gestures detected yet. Hold a pose or swipe in front of the camera.
        </p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {history.map((entry, i) => (
            <li
              key={`${entry.timestamp}-${i}`}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs odd:bg-surface-1/60"
            >
              <span className="text-mono-tabular text-ink-3">{formatClockTime(entry.timestamp)}</span>
              <span className="flex-1 text-ink-0">{formatGestureLabel(entry.gesture)}</span>
              <span className="text-mono-tabular text-ink-3">{mirrorHandedness(entry.hand)}</span>
              <span className="text-mono-tabular text-ink-2">{entry.confidence.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
