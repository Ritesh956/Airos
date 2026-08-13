import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  glow?: boolean;
  padded?: boolean;
}

/** The base glass-panel surface used throughout AIR OS. */
export function Panel({
  title,
  eyebrow,
  action,
  glow = false,
  padded = true,
  className,
  children,
  ...rest
}: PanelProps) {
  return (
    <div
      className={cn('glass-panel rounded-2xl', glow && 'glow-signal', className)}
      {...rest}
    >
      {(title || eyebrow || action) && (
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            {eyebrow && (
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-3">
                {eyebrow}
              </div>
            )}
            {title && <h2 className="text-sm font-medium text-ink-0">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? 'p-5' : undefined}>{children}</div>
    </div>
  );
}
