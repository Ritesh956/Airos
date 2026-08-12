import { useLocation } from 'react-router-dom';
import { MODULE_REGISTRY } from '@/app/moduleRegistry';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, toggleCommandPalette } from '@/state/appStore';
import { StatusPill } from '@/ui/StatusPill';
import { CommandIcon } from '@/ui/icons';

export function StatusBar() {
  const location = useLocation();
  const cameraState = useStoreSelector(appStore, (s) => s.cameraState);
  const current = MODULE_REGISTRY.find((m) => m.path === location.pathname);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface-1/80 px-5 backdrop-blur-xl">
      <div>
        <div className="text-sm font-medium text-ink-0">{current?.label ?? 'AIR OS'}</div>
        {current?.tagline && <div className="text-[11px] text-ink-3">{current.tagline}</div>}
      </div>

      <div className="flex items-center gap-3">
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
