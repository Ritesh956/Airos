import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-signal-500 text-surface-0 hover:bg-signal-400 focus-visible:outline-signal-400 font-medium',
  secondary:
    'bg-surface-3 text-ink-0 border border-border-strong hover:bg-surface-2 focus-visible:outline-ink-2',
  ghost: 'text-ink-1 hover:bg-surface-2 hover:text-ink-0 focus-visible:outline-ink-2',
  danger: 'bg-danger-500/10 text-danger-500 border border-danger-500/30 hover:bg-danger-500/20',
};

const SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-colors duration-150',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      disabled={disabled}
      {...rest}
    />
  );
}
