import { Link } from 'react-router-dom';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, setInputSource } from '@/state/appStore';
import { visionStore } from '@/state/visionStore';
import { getAppliedEffects } from '@/vision/perf/degradationLadder';
import { Button } from '@/ui/Button';
import { WarningIcon } from '@/ui/icons';

/**
 * Step 5 of the degradation ladder (IMPLEMENTATION.md §9): "surface a
 * banner recommending Demo Mode, with a link to the perf panel." Only
 * rendered at the ladder's deepest step — earlier steps are quieter,
 * surfaced instead by StatusBar's PerfPill, per the spec's "each announced
 * in the status bar" wording for steps 1-4 and this explicit "banner" call-
 * out only for step 5. Reads getAppliedEffects() — the same function
 * DegradationController itself uses to decide what to apply — so this can
 * never claim step 5 is active when the controller didn't really reach it.
 */
export function DegradationBanner() {
  const level = useStoreSelector(visionStore, (s) => s.degradationLevel);
  const activeModule = useStoreSelector(appStore, (s) => s.activeModule);
  const effects = getAppliedEffects(level, activeModule);

  if (!effects.recommendDemoMode) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 border-b border-warning-500/30 bg-warning-500/10 px-5 py-2.5 text-xs text-ink-0"
    >
      <div className="flex items-center gap-2.5">
        <WarningIcon className="h-4 w-4 shrink-0 text-warning-500" />
        <span>
          Frame rate has stayed low even after every automatic adjustment. Demo Mode gives a smooth
          experience with no camera or inference cost.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/analytics"
          className="rounded outline-none text-ink-2 underline decoration-border underline-offset-4 hover:text-ink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400"
        >
          View perf panel
        </Link>
        <Button size="sm" variant="secondary" onClick={() => setInputSource('replay')}>
          Switch to Demo Mode
        </Button>
      </div>
    </div>
  );
}
