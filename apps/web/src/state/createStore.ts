/**
 * A minimal external store compatible with React's `useSyncExternalStore`.
 *
 * Why not Redux/Zustand/Jotai: this app's state architecture (see
 * IMPLEMENTATION.md §5) is deliberately three small, narrowly-scoped stores,
 * not one global bag of state. A dependency doesn't buy much over ~40 lines
 * we can read in thirty seconds, and it keeps the "why doesn't this re-render
 * on every camera frame" answer visible in our own code rather than hidden
 * behind a library's batching internals.
 *
 * Two update paths are exposed on purpose:
 *  - `set` / `update` — always notify subscribers. Use for state a component
 *    should re-render on (module changes, camera state, settings).
 *  - `mutate` — write into `store.value` without notifying. Use for the hot
 *    path (landmarks, per-frame cursor position) that a rAF loop reads
 *    directly and React must never re-render for. See §3 of the plan.
 */

export interface Store<T> {
  readonly value: T;
  get(): T;
  set(next: T): void;
  update(patch: Partial<T>): void;
  /** Write without notifying subscribers. For the hot/ref path only. */
  mutate(fn: (draft: T) => void): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    get value() {
      return state;
    },
    get() {
      return state;
    },
    set(next) {
      state = next;
      notify();
    },
    update(patch) {
      state = { ...state, ...patch };
      notify();
    },
    mutate(fn) {
      fn(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface Throttled<Args extends unknown[]> {
  (...args: Args): void;
  /**
   * Discards any trailing call already scheduled. Needed whenever code
   * resets the underlying store by writing to it directly rather than
   * through the throttled function itself — without this, a call queued
   * just before the reset still fires on its own timer moments later,
   * silently overwriting the reset with stale data. This bit a real bug:
   * switching Demo Mode off left the gesture/hand-count readouts frozen
   * on whatever was last seen, because the reset ran but a pending
   * trailing publish fired right after it and undid it.
   */
  cancel(): void;
}

/**
 * A tiny throttle used by stores that publish from a high-frequency source
 * (the vision loop) into React-visible state. Trailing-edge only: the last
 * call within the window always eventually fires, so the UI never goes
 * stale, but it fires at most once per `intervalMs`.
 */
export function throttle<Args extends unknown[]>(fn: (...args: Args) => void, intervalMs: number): Throttled<Args> {
  let last = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  const invoke = (args: Args) => {
    last = performance.now();
    fn(...args);
  };

  const throttled = ((...args: Args) => {
    const now = performance.now();
    const remaining = intervalMs - (now - last);
    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      invoke(args);
    } else {
      pendingArgs = args;
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          if (pendingArgs) invoke(pendingArgs);
          pendingArgs = null;
        }, remaining);
      }
    }
  }) as Throttled<Args>;

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    pendingArgs = null;
  };

  return throttled;
}
