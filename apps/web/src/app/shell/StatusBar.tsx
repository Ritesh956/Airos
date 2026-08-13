import { Link, useLocation } from 'react-router-dom';
import { MODULE_REGISTRY } from '@/app/moduleRegistry';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, toggleCommandPalette, type VoiceState } from '@/state/appStore';
import { visionStore } from '@/state/visionStore';
import { interactionStore, type TrackingState } from '@/state/interactionStore';
import { DEGRADATION_STEPS } from '@/vision/perf/degradationLadder';
import { StatusPill } from '@/ui/StatusPill';
import { LiveRegion } from '@/ui/LiveRegion';
import { CommandIcon, MicIcon, WarningIcon } from '@/ui/icons';
import { cn } from '@/utils/cn';

/** Announced text for each trackingState — see LiveRegion's doc comment
 *  for why tracking state (a discrete, infrequent transition) earns a live
 *  region while continuously-updating readouts deliberately don't. Empty
 *  for 'idle' since that's the resting state nothing needs announcing on
 *  arrival at (page load, or after Off is already known from the camera
 *  pill itself) — only the transitions into/out of active tracking are
 *  genuinely news. */
const TRACKING_ANNOUNCEMENT: Record<TrackingState, string> = {
  idle: '',
  tracking: 'Hand tracking active.',
  lost: 'Tracking lost — no hand detected.',
};

const VOICE_PILL_CONFIG: Record<VoiceState, { label: string; dot: string; pulse?: boolean }> = {
  off: { label: 'Voice Off', dot: 'bg-ink-3' },
  listening: { label: 'Listening', dot: 'bg-success-500', pulse: true },
  error: { label: 'Voice Error', dot: 'bg-danger-500' },
};

/** Same shape as `StatusPill`, kept local rather than generalizing that
 *  component — voice is the only other stateful pill this app has, and a
 *  generic `Record<string, Config>` prop would cost more type-safety than
 *  it'd save for just two call sites. */
function VoiceStatusPill({ state }: { state: VoiceState }) {
  const cfg = VOICE_PILL_CONFIG[state];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-ink-1">
      <MicIcon className="h-3 w-3" />
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot, cfg.pulse && 'animate-pulse-slow')} />
      {cfg.label}
    </span>
  );
}

/** Quiet indicator for degradation ladder steps 1-4 — step 5 gets its own
 *  full-width DegradationBanner instead, per the spec's explicit "surface a
 *  banner" call-out for that step only (see its doc comment). A Link
 *  rather than a button: "the perf panel" this points to is just the
 *  Analytics route. */
function PerfPill({ level }: { level: number }) {
  const step = DEGRADATION_STEPS[level - 1];
  if (!step) return null;
  return (
    <Link
      to="/analytics"
      title={`${step.label} — ${step.description}`}
      className="inline-flex items-center gap-2 rounded-full border border-warning-500/30 bg-warning-500/10 px-3 py-1 text-xs text-ink-1 outline-none transition-colors hover:border-warning-500/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400"
    >
      <WarningIcon className="h-3 w-3 text-warning-500" />
      Reduced performance
    </Link>
  );
}

export function StatusBar() {
  const location = useLocation();
  const cameraState = useStoreSelector(appStore, (s) => s.cameraState);
  const voiceEnabled = useStoreSelector(appStore, (s) => s.settings.voiceEnabled);
  const voiceState = useStoreSelector(appStore, (s) => s.voiceState);
  const degradationLevel = useStoreSelector(visionStore, (s) => s.degradationLevel);
  const trackingState = useStoreSelector(interactionStore, (s) => s.trackingState);
  const current = MODULE_REGISTRY.find((m) => m.path === location.pathname);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface-1/80 px-5 backdrop-blur-xl">
      <LiveRegion message={TRACKING_ANNOUNCEMENT[trackingState]} />
      <div>
        <div className="text-sm font-medium text-ink-0">{current?.label ?? 'AIR OS'}</div>
        {current?.tagline && <div className="text-[11px] text-ink-3">{current.tagline}</div>}
      </div>

      <div className="flex items-center gap-3">
        {degradationLevel > 0 && <PerfPill level={degradationLevel} />}
        {voiceEnabled && <VoiceStatusPill state={voiceState} />}
        <StatusPill state={cameraState} />
        <button
          onClick={() => toggleCommandPalette(true)}
          aria-label="Open command palette"
          className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-2 outline-none transition-colors hover:border-border-strong hover:text-ink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400"
        >
          <CommandIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Commands</span>
          <kbd className="rounded border border-border bg-surface-3 px-1 font-mono text-[10px]">/</kbd>
        </button>
      </div>
    </header>
  );
}
