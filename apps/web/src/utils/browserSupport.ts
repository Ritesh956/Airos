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

export function checkBrowserSupport(): BrowserSupport {
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

  return {
    secureContext,
    mediaDevices,
    webgl2,
    wasm,
    speechRecognition,
    fullySupported: secureContext && mediaDevices && webgl2 && wasm,
  };
}
