import type { CameraState } from '@/state/appStore';
import { cn } from '@/utils/cn';

const CONFIG: Record<CameraState, { label: string; dot: string; pulse?: boolean }> = {
  off: { label: 'Camera Off', dot: 'bg-ink-3' },
  starting: { label: 'Starting…', dot: 'bg-warning-500', pulse: true },
  active: { label: 'Camera Active', dot: 'bg-success-500', pulse: true },
  stopping: { label: 'Stopping…', dot: 'bg-warning-500', pulse: true },
  error: { label: 'Camera Error', dot: 'bg-danger-500' },
};

/** A presentational chip only — no `role="status"`. It used to carry one,
 *  but this component renders twice on every module page (once in
 *  `StatusBar`, once as a module Panel's own `action`), so every camera
 *  transition was announced twice to screen reader users, back to back
 *  (CLAUDE.md UI/UX audit finding #13). `StatusBar` now owns the single
 *  live announcement of camera state, the same way it already owns
 *  tracking-state announcements — see its `CAMERA_ANNOUNCEMENT` map. */
export function StatusPill({ state, className }: { state: CameraState; className?: string }) {
  const cfg = CONFIG[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-ink-1',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot, cfg.pulse && 'animate-pulse-slow')} />
      {cfg.label}
    </span>
  );
}
