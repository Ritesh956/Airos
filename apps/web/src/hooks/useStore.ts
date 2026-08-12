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
