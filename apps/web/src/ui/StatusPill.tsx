import type { CameraState } from '@/state/appStore';
import { cn } from '@/utils/cn';

const CONFIG: Record<CameraState, { label: string; dot: string; pulse?: boolean }> = {
  off: { label: 'Camera Off', dot: 'bg-ink-3' },
  starting: { label: 'Starting…', dot: 'bg-warning-500', pulse: true },
  active: { label: 'Camera Active', dot: 'bg-success-500', pulse: true },
  stopping: { label: 'Stopping…', dot: 'bg-warning-500', pulse: true },
  error: { label: 'Camera Error', dot: 'bg-danger-500' },
};

export function StatusPill({ state, className }: { state: CameraState; className?: string }) {
  const cfg = CONFIG[state];
  return (
    <span
      role="status"
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
