import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Without this, every `render()`/`renderHook()` across the whole suite
// stays mounted for the rest of the run (Testing Library doesn't
// auto-cleanup outside its own Jest integration) — later tests in the same
// file, or even later files, end up with several stale component instances
// all still subscribed to the same module-level stores, each reacting to
// every store update. First caught by usePresentGestureCommands.test.tsx,
// where stale mounted instances from earlier tests each fired their own
// nextSlide()/startTimer() alongside the current test's, inflating a
// single expected event into several. Not specific to that file — any
// future test using render()/renderHook() would hit the same bug silently.
afterEach(cleanup);

// jsdom doesn't implement requestAnimationFrame/cancelAnimationFrame (as of
// the version this project uses) — several vision/interaction classes use
// rAF-driven loops (ReplaySource, CameraLandmarkSource's rAF fallback,
// later the cursor and 3D Studio loops), so tests need a minimal shim to
// exercise that code at all. setTimeout(..., 16) approximates a 60fps tick;
// tests that care about exact timing use real timers with short waits
// rather than relying on this being precise.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    setTimeout(() => callback(performance.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame = (handle: number): void => clearTimeout(handle);
}
