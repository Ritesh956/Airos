import '@testing-library/jest-dom/vitest';

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
