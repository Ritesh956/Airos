import { useId } from 'react';
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

/** A single labelled metric — the atom of every HUD/debug panel in the app.
 *  `aria-labelledby` ties the value to its label explicitly (CLAUDE.md
 *  UI/UX audit finding #32) — the two were previously just sibling spans
 *  with no programmatic association, which mostly worked in linear browse
 *  mode but left a screen reader landing directly on the value (e.g. by
 *  element-type navigation) with no label. */
export function Readout({ label, value, unit, method, className }: ReadoutProps) {
  const labelId = useId();
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5', className)}>
      <span id={labelId} className="text-xs text-ink-2">
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span aria-labelledby={labelId} className="text-mono-tabular text-sm text-ink-0">
          {value}
          {unit && <span className="ml-1 text-ink-3">{unit}</span>}
        </span>
        {method && <MethodBadge method={method} />}
      </span>
    </div>
  );
}
