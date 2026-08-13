/**
 * Feature detection run once at startup. AIR OS depends on getUserMedia,
 * WebGL2 (for Three.js and MediaPipe's GPU delegate), and WebAssembly (for
 * MediaPipe's CPU fallback). If any are missing we say so explicitly rather
 * than failing deep inside a camera or model call. See IMPLEMENTATION.md §6.
 */
export interface BrowserSupport {
  secureContext: boolean;
  mediaDevices: boolean;
  webgl2: boolean;
  wasm: boolean;
  speechRecognition: boolean;
  fullySupported: boolean;
}

let cached: BrowserSupport | null = null;

/**
 * Memoized after the first real call — every one of these signals is a
 * fixed environment capability that can't change over the life of a page
 * (a browser doesn't gain or lose WebGL2 support mid-session; that's
 * distinct from *losing* an already-created WebGL context, a separate
 * concern this probe was never involved in). `errors.ts`'s
 * `classifyCameraError` calls this on every classified camera error, and
 * `document.createElement('canvas').getContext('webgl2')` creates a real
 * WebGL2RenderingContext each time it's called — without caching, repeated
 * camera failures (a user denying permission more than once, retrying)
 * kept accumulating contexts toward the browser's per-page cap with
 * nothing ever releasing them, since a canvas that's never attached to the
 * DOM has no lifecycle event to free its context on.
 */
export function checkBrowserSupport(): BrowserSupport {
  if (cached) return cached;

  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  const mediaDevices =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  const webgl2 = (() => {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  })();

  const wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';

  const speechRecognition =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  cached = {
    secureContext,
    mediaDevices,
    webgl2,
    wasm,
    speechRecognition,
    fullySupported: secureContext && mediaDevices && webgl2 && wasm,
  };
  return cached;
}
