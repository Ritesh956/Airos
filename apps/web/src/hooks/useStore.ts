import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Store } from '@/state/createStore';

/** Subscribe a component to an entire store. Re-renders on every `set`/`update`. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Subscribe to a derived slice of a store, only re-rendering when the
 * selected value actually changes. Necessary for stores like `visionStore`
 * where most components care about one field (e.g. `fps`) and would
 * otherwise re-render on every unrelated field change.
 *
 * `selected.current` is deliberately mutated inside `getSnapshot` — that's
 * what makes `useSyncExternalStore` see a *stable* reference across calls
 * where nothing actually changed, satisfying its "getSnapshot must be
 * cached" contract. **This only holds if `isEqual` can actually recognize
 * "no change" for whatever `selector` returns.** Every current call site
 * either selects a primitive (default `Object.is` is correct and cheap) or
 * a reference the store itself keeps stable across unrelated updates
 * (`s.settings`, `s.cursor`, etc. — the store only replaces those objects
 * when they themselves change). If you add a selector that computes a
 * *fresh* object or array literal on every call (e.g. `(s) => [s.a, s.b]`),
 * the default `Object.is` will never consider two calls equal, `getSnapshot`
 * will return a new reference every render, and `useSyncExternalStore`
 * will throw/loop ("getSnapshot should be cached") instead of just
 * re-rendering more than necessary. Pass a real `isEqual` (shallow-equal,
 * or field-by-field) for any selector shaped like that.
 */
export function useStoreSelector<T, S>(
  store: Store<T>,
  selector: (state: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
): S {
  const selected = useRef<S>(selector(store.get()));
  const initialized = useRef(false);
  if (!initialized.current) {
    selected.current = selector(store.get());
    initialized.current = true;
  }

  const getSnapshot = useCallback(() => {
    const next = selector(store.get());
    if (!isEqual(selected.current, next)) {
      selected.current = next;
    }
    return selected.current;
  }, [store, selector, isEqual]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
