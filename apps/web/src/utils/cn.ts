import { clsx, type ClassValue } from 'clsx';

/** Thin wrapper so class-composition call sites read `cn(...)` everywhere. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
