import type { VoiceErrorReason } from '@/state/appStore';

/** Human-readable, actionable messages — same "name the fix, not just the
 *  failure" bar as vision/camera/errors.ts's CAMERA_ERROR_MESSAGES. */
export const VOICE_ERROR_MESSAGES: Record<VoiceErrorReason, string> = {
  'permission-denied':
    "Microphone access was denied. Click the microphone icon in your browser's address bar and allow access, then try again.",
  'no-microphone': 'No microphone was found on this device.',
  network: 'A network error interrupted voice recognition. Check your connection and try again.',
  unsupported:
    "This browser doesn't support voice control. Try a recent version of Chrome or Edge — or use the Command Palette (press /) instead.",
  unknown: 'Something went wrong with voice control. Try turning it off and on again.',
};

const BENIGN_ERROR_CODES = new Set(['no-speech', 'aborted']);

/** `'no-speech'` fires routinely whenever the user is simply quiet for a
 *  few seconds, and `'aborted'` fires whenever *we* call `stop()`
 *  ourselves — neither is a real, actionable failure the way
 *  permission-denied or no-microphone are, so neither should surface as a
 *  user-visible error state. */
export function isBenignVoiceError(code: string): boolean {
  return BENIGN_ERROR_CODES.has(code);
}

/** Maps a `SpeechRecognitionErrorEvent.error` code to a taxonomy entry. */
export function classifyVoiceError(code: string): VoiceErrorReason {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission-denied';
    case 'audio-capture':
      return 'no-microphone';
    case 'network':
      return 'network';
    default:
      return 'unknown';
  }
}
