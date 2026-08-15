import { NavLink } from 'react-router-dom';
import { MODULE_REGISTRY } from '@/app/moduleRegistry';
import { cn } from '@/utils/cn';

/**
 * Below `sm` this renders as a horizontally-scrollable bottom tab bar
 * instead of the left rail — the rail used to stay pinned at a fixed 72px
 * all the way down to phone widths, eating 19% of a 375px viewport and
 * squeezing the camera preview (the one thing a gesture app most needs
 * room for) down to a barely-usable size, with no path to anything
 * narrower (CLAUDE.md UI/UX audit finding #09). `order-2`/`sm:order-1`
 * on this element plus the matching `order-1`/`sm:order-2` on AppShell's
 * content column is what actually moves it from "last, at the bottom" on
 * mobile to "first, on the left" at `sm` and up — the rail/bar swap itself
 * is just Tailwind responsive classes on the same element, no separate
 * mobile component.
 */
export function Nav() {
  return (
    <nav
      className={cn(
        'order-2 flex w-full shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-surface-1 px-2 py-1',
        'sm:order-1 sm:w-[72px] sm:flex-col sm:items-center sm:overflow-x-visible sm:border-t-0 sm:border-r sm:px-0 sm:py-4',
        'lg:w-56 lg:items-stretch lg:px-3',
      )}
    >
      <div className="mb-4 hidden items-center gap-2 px-2 sm:flex lg:px-1">
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
                'group flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 text-sm transition-colors',
                'sm:flex-row sm:gap-3 sm:py-2.5',
                'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400',
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
                <span className="max-w-[64px] truncate text-[10px] sm:hidden">{module.label}</span>
                <span className="hidden truncate lg:inline">{module.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
