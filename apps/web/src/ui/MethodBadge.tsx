import type { Method } from '@/vision/types';
import { cn } from '@/utils/cn';

/**
 * Renders the provenance of a value. This is the enforcement mechanism for
 * IMPLEMENTATION.md §1.4: `method` is a required prop, not optional, so
 * there is no code path that displays a number without saying where it
 * came from.
 */
const LABEL: Record<Method, string> = {
  MODEL: 'Model',
  HEURISTIC: 'Heuristic',
  DERIVED: 'Derived',
};

const STYLE: Record<Method, string> = {
  MODEL: 'text-signal-400 border-signal-500/30 bg-signal-500/10',
  HEURISTIC: 'text-accent-400 border-accent-500/30 bg-accent-500/10',
  DERIVED: 'text-ink-2 border-border-strong bg-surface-3',
};

export function MethodBadge({ method, className }: { method: Method; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        STYLE[method],
        className,
      )}
      title={
        method === 'MODEL'
          ? 'Output of a pretrained neural network.'
          : method === 'HEURISTIC'
            ? 'Rule-based geometric analysis, not a trained classifier.'
            : 'Arithmetic derived from model or heuristic values.'
      }
    >
      {LABEL[method]}
    </span>
  );
}
