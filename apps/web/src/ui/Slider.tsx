import { useId } from 'react';

interface SliderProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

/**
 * A labeled range input. The live value and the description used to sit
 * inside the same `<label>` wrapping the `<input>`, which makes the
 * label's entire text content the input's accessible name — so the name
 * changed on every step and re-announced the whole help paragraph each
 * time (CLAUDE.md UI/UX audit finding #02). Fixed by naming the input
 * explicitly via `aria-labelledby` (pointing only at the short label span,
 * not the value or the description) and moving the description to
 * `aria-describedby` — read once, not folded into a name that changes.
 * `aria-valuetext` carries the same formatted string shown visually, so a
 * unit like "beta" or "frames" isn't lost to a bare number for screen
 * reader users.
 */
export function Slider({ label, description, value, min, max, step, onChange, formatValue }: SliderProps) {
  const labelId = useId();
  const descriptionId = useId();
  const formatted = formatValue ? formatValue(value) : String(value);
  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <span id={labelId} className="text-sm text-ink-0">
          {label}
        </span>
        <span className="text-mono-tabular text-xs text-ink-2">{formatted}</span>
      </div>
      {description && (
        <span id={descriptionId} className="text-xs text-ink-3">
          {description}
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        aria-valuetext={formatted}
        className="slider-track h-6 w-full cursor-pointer accent-signal-500"
      />
    </div>
  );
}
