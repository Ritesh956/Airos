import { describe, expect, it, vi } from 'vitest';
import { createStore, throttle } from './createStore';

describe('createStore', () => {
  it('notifies subscribers on set', () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ count: 1 });

    expect(store.get().count).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('merges patches on update without dropping other fields', () => {
    const store = createStore({ a: 1, b: 2 });
    store.update({ b: 5 });
    expect(store.get()).toEqual({ a: 1, b: 5 });
  });

  it('mutate writes without notifying subscribers (the hot-path escape hatch)', () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.mutate((draft) => {
      draft.count = 42;
    });

    expect(store.get().count).toBe(42);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further notifications', () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.set({ count: 1 });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('throttle', () => {
  // Uses real timers with short windows rather than fake timers, since
  // throttle's leading-edge check is driven by performance.now() — faking
  // that reliably across environments is more trouble than a 40ms test.

  it('invokes immediately on the leading edge', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 40);

    throttled('a');
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('coalesces rapid calls and fires only the trailing one within the window', async () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 40);

    throttled('first');
    throttled('second');
    throttled('third');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('first');

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('third');
  });

  // Regression test: a real bug (Phase 4) — code resetting a store by
  // writing to it directly, in parallel with a throttled publisher for
  // the same store, assumed the reset was final. It wasn't: a trailing
  // call already scheduled from just before the reset fired moments
  // later on its own timer and silently overwrote the reset with stale
  // data. `cancel()` exists specifically to prevent that.
  it('cancel() discards a pending trailing call so it never fires', async () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 40);

    throttled('first'); // leading edge, fires immediately
    throttled('second'); // queued as the pending trailing call
    expect(fn).toHaveBeenCalledTimes(1);

    throttled.cancel();

    await new Promise((resolve) => setTimeout(resolve, 60));

    // Without cancel(), this would be 2 calls with 'second' as the last.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() is a no-op when nothing is pending', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 40);
    expect(() => throttled.cancel()).not.toThrow();
  });

  it('the throttle keeps working normally for calls made after cancel()', async () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 40);

    throttled('first'); // leading edge
    throttled('second'); // pending, then discarded
    throttled.cancel();

    // Still inside the original window, so this queues as a new pending
    // call rather than firing immediately — cancel() clears the pending
    // call, it doesn't reset the window. It should still fire on its own
    // schedule rather than being silently dropped forever.
    throttled('third');
    expect(fn).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('third');
  });
});
