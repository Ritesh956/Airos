import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from './Panel';

interface ModulePlaceholderProps {
  label: string;
  phase: number;
  description: string;
  willInclude: string[];
  icon: ReactNode;
}

/**
 * The honest stand-in for a module not yet built. Every phase-gated
 * feature in the brief routes here until its phase lands — this is not a
 * fake button or a disguised dead end, it states plainly what's missing and
 * when it arrives, per IMPLEMENTATION.md §12 ("no placeholder AI, no
 * fake buttons"). Nothing on this page claims to do anything it doesn't.
 */
export function ModulePlaceholder({
  label,
  phase,
  description,
  willInclude,
  icon,
}: ModulePlaceholderProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-2 text-ink-2">
        {icon}
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-3">
          Phase {phase} · Not yet built
        </div>
        <h1 className="mt-2 text-2xl font-medium text-ink-0">{label}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{description}</p>
      </div>

      <Panel eyebrow="Planned for this module" className="w-full text-left">
        <ul className="space-y-2 text-sm text-ink-1">
          {willInclude.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
              {item}
            </li>
          ))}
        </ul>
      </Panel>

      <Link
        to="/"
        className="text-xs text-ink-2 underline decoration-border underline-offset-4 hover:text-ink-0"
      >
        ← Back to Home
      </Link>
    </div>
  );
}
