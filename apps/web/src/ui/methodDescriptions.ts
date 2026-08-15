import type { Method } from '@/vision/types';

/** Kept in sync with MethodBadge's own copy — the single source of truth
 *  both read from would be nicer, but MethodBadge needs the short label
 *  too and this file only needs the long form, so duplicating three
 *  short strings isn't worth a shared-constants module for. */
export const METHOD_DESCRIPTION: Record<Method, string> = {
  MODEL: 'Output of a pretrained neural network.',
  HEURISTIC: 'Rule-based geometric analysis, not a trained classifier.',
  DERIVED: 'Arithmetic derived from model or heuristic values.',
};

export function methodDescriptionId(method: Method): string {
  return `method-def-${method.toLowerCase()}`;
}
