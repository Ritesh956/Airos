import { NavLink } from 'react-router-dom';
import { MODULE_REGISTRY } from '@/app/moduleRegistry';
import { cn } from '@/utils/cn';

export function Nav() {
  return (
    <nav className="flex w-[72px] flex-col items-center gap-1 border-r border-border bg-surface-1 py-4 lg:w-56 lg:items-stretch lg:px-3">
      <div className="mb-4 flex items-center gap-2 px-2 lg:px-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal-500/15 text-signal-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
            <path
              d="M12 2 3 7v10l9 5 9-5V7Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M12 12v8.5M3 7l9 5 9-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="hidden text-sm font-medium tracking-wide text-ink-0 lg:inline">AIR OS</span>
      </div>

      {MODULE_REGISTRY.map((module) => {
        const Icon = module.icon;
        return (
          <NavLink
            key={module.id}
            to={module.path}
            end={module.path === '/'}
            title={module.label}
            aria-label={module.label}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-surface-3 text-ink-0'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink-0',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    isActive ? 'text-signal-400' : 'text-ink-3 group-hover:text-ink-1',
                  )}
                />
                <span className="hidden truncate lg:inline">{module.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
