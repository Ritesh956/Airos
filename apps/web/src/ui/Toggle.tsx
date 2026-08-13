import { cn } from '@/utils/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 py-2.5',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span>
        <span className="block text-sm text-ink-0">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-3">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-400',
          checked ? 'border-signal-500/40 bg-signal-500/30' : 'border-border-strong bg-surface-3',
        )}
      >
        <span
          className={cn(
            // `left-0.5` is load-bearing, not decorative: a <button>'s
            // internal rendering centers an absolutely-positioned child that
            // doesn't pin an edge (left/right both effectively "auto"),
            // regardless of translate-x — without it, the knob's un-translated
            // base position sits at the button's horizontal center, so
            // translate-x-[22px] pushed it out past the track's right edge
            // entirely. Pinning left explicitly removes that ambiguity. See
            // CLAUDE.md for the full diagnosis.
            'absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-ink-0 transition-transform',
            // Delta from the left-0.5 (2px) base, not an absolute target:
            // checked = 2px base + 20px translate = 22px from the left,
            // landing the knob 2px from the track's right edge too — the
            // same symmetric inset the unchecked (0px translate) state has
            // on the left.
            checked ? 'translate-x-[20px]' : 'translate-x-0',
          )}
        />
      </button>
    </label>
  );
}
