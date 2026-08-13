import { useLocation } from 'react-router-dom';
import { MODULE_REGISTRY } from '@/app/moduleRegistry';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, toggleCommandPalette, type VoiceState } from '@/state/appStore';
import { StatusPill } from '@/ui/StatusPill';
import { CommandIcon, MicIcon } from '@/ui/icons';
import { cn } from '@/utils/cn';

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

export function StatusBar() {
  const location = useLocation();
  const cameraState = useStoreSelector(appStore, (s) => s.cameraState);
  const voiceEnabled = useStoreSelector(appStore, (s) => s.settings.voiceEnabled);
  const voiceState = useStoreSelector(appStore, (s) => s.voiceState);
  const current = MODULE_REGISTRY.find((m) => m.path === location.pathname);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface-1/80 px-5 backdrop-blur-xl">
      <div>
        <div className="text-sm font-medium text-ink-0">{current?.label ?? 'AIR OS'}</div>
        {current?.tagline && <div className="text-[11px] text-ink-3">{current.tagline}</div>}
      </div>

      <div className="flex items-center gap-3">
        {voiceEnabled && <VoiceStatusPill state={voiceState} />}
        <StatusPill state={cameraState} />
        <button
          onClick={() => toggleCommandPalette(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-border-strong hover:text-ink-0"
        >
          <CommandIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Commands</span>
          <kbd className="rounded border border-border bg-surface-3 px-1 font-mono text-[10px]">/</kbd>
        </button>
      </div>
    </header>
  );
}
