import { Link } from 'react-router-dom';
import type { ModuleDescriptor } from '@/app/moduleRegistry';
import { cn } from '@/utils/cn';

export function ModuleCard({ module }: { module: ModuleDescriptor }) {
  const Icon = module.icon;
  return (
    <Link
      to={module.path}
      className={cn(
        'group glass-panel flex flex-col gap-4 rounded-2xl p-5 transition-all duration-200',
        'hover:border-border-strong hover:bg-surface-3/60',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-3 text-ink-1 transition-colors group-hover:text-signal-400">
          <Icon className="h-5 w-5" />
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
            module.status === 'ready'
              ? 'border-success-500/30 bg-success-500/10 text-success-500'
              : 'border-border-strong bg-surface-3 text-ink-3',
          )}
        >
          {module.status === 'ready' ? 'Ready' : `Phase ${module.phase}`}
        </span>
      </div>
      <div>
        <div className="text-sm font-medium text-ink-0">{module.label}</div>
        <div className="mt-1 text-xs text-ink-2">{module.tagline}</div>
      </div>
      <div className="mt-auto flex items-center gap-1.5 text-[11px] text-ink-3">
        <kbd className="rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono">
          {module.shortcut}
        </kbd>
        <span>shortcut</span>
      </div>
    </Link>
  );
}
