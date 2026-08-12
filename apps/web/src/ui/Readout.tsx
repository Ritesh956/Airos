import type { Method } from '@/vision/types';
import { MethodBadge } from './MethodBadge';
import { cn } from '@/utils/cn';

interface ReadoutProps {
  label: string;
  value: string | number;
  unit?: string;
  method?: Method;
  className?: string;
}

/** A single labelled metric — the atom of every HUD/debug panel in the app. */
export function Readout({ label, value, unit, method, className }: ReadoutProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5', className)}>
      <span className="text-xs text-ink-2">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-mono-tabular text-sm text-ink-0">
          {value}
          {unit && <span className="ml-1 text-ink-3">{unit}</span>}
        </span>
        {method && <MethodBadge method={method} />}
      </span>
    </div>
  );
}
