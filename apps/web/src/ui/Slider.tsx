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

export function Slider({ label, description, value, min, max, step, onChange, formatValue }: SliderProps) {
  return (
    <label className="flex flex-col gap-1.5 py-2.5">
      <span className="flex items-center justify-between gap-4">
        <span className="text-sm text-ink-0">{label}</span>
        <span className="text-mono-tabular text-xs text-ink-2">{formatValue ? formatValue(value) : value}</span>
      </span>
      {description && <span className="text-xs text-ink-3">{description}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-signal-500"
      />
    </label>
  );
}
