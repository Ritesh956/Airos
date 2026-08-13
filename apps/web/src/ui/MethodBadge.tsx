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

const DESCRIPTION: Record<Method, string> = {
  MODEL: 'Output of a pretrained neural network.',
  HEURISTIC: 'Rule-based geometric analysis, not a trained classifier.',
  DERIVED: 'Arithmetic derived from model or heuristic values.',
};

/** The `title` attribute this used to rely on exclusively is a mouse-only
 *  tooltip — unreachable by keyboard or touch (CLAUDE.md UI/UX audit
 *  finding #10), which matters here specifically because the provenance
 *  taxonomy this badge exists to enforce (IMPLEMENTATION.md §1.4) is a
 *  stated project value, not decoration. `title` stays as a bonus for
 *  mouse users; the `sr-only` span is what actually makes the description
 *  reachable without one. */
export function MethodBadge({ method, className }: { method: Method; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        STYLE[method],
        className,
      )}
      title={DESCRIPTION[method]}
    >
      {LABEL[method]}
      <span className="sr-only"> — {DESCRIPTION[method]}</span>
    </span>
  );
}
