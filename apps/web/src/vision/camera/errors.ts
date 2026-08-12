import type { CameraErrorReason } from '@/state/appStore';
import { checkBrowserSupport } from '@/utils/browserSupport';

/** Human-readable, actionable messages. Every one names the fix, not just the failure. */
export const CAMERA_ERROR_MESSAGES: Record<CameraErrorReason, string> = {
  'permission-denied':
    'Camera access was denied. Click the camera icon in your browser\'s address bar and allow access, then try again — or continue in Demo Mode.',
  'not-found':
    'No camera was found on this device. Try Demo Mode to see AIR OS with recorded gesture data instead.',
  'in-use':
    'The camera is already in use by another application (a video call app or another browser tab). Close it and try again.',
  'insecure-context':
    'Camera access requires a secure connection (HTTPS) or localhost. This page was loaded over an insecure connection.',
  unsupported:
    'This browser is missing a feature AIR OS needs (WebGL2 or WebAssembly). Try a recent version of Chrome or Edge.',
  'model-load-failed':
    'The tracking model failed to download. Check your connection and retry — AIR OS loads models locally and does not work fully offline yet.',
  unknown: 'Something went wrong starting the camera. Try again, or switch to Demo Mode.',
};

/** Maps a getUserMedia failure (or a pre-flight capability check) to a taxonomy entry. */
export function classifyCameraError(error: unknown): CameraErrorReason {
  const support = checkBrowserSupport();
  if (!support.secureContext) return 'insecure-context';
  if (!support.webgl2 || !support.wasm || !support.mediaDevices) return 'unsupported';

  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'permission-denied';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'not-found';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'in-use';
      default:
        return 'unknown';
    }
  }

  return 'unknown';
}
