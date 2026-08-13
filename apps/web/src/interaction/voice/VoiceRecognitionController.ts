import { classifyVoiceError, isBenignVoiceError } from './errors';
import type { VoiceErrorReason } from '@/state/appStore';

type ResultHandler = (transcript: string) => void;
type StateHandler = (state: 'listening' | 'off' | 'error', error: VoiceErrorReason | null) => void;

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/**
 * Thin wrapper around the browser's SpeechRecognition API — the voice half
 * of the Command Router (IMPLEMENTATION.md §8, §11). UI-agnostic, same
 * "plain class owns the lifecycle, publishes state via a callback" shape
 * `CameraManager` uses for the camera.
 *
 * All state reporting happens from the recognizer's own async events
 * (`onstart`/`onresult`/`onerror`/`onend`) — never synchronously inside
 * `start()`/`stop()` themselves. This class is driven from an
 * `appStore.subscribe` callback (see `useVoiceCommands.ts`), and every
 * state transition eventually calls back into `setVoiceState`, which
 * writes to that same store; routing every transition through a genuine
 * async browser event means the write always happens on a fresh call
 * stack, never nested inside `appStore`'s own listener-notification loop.
 * (`setVoiceState` also carries its own equality guard as a second line of
 * defense — see its doc comment in `state/appStore.ts` — but this class
 * doesn't rely on that alone.)
 */
export class VoiceRecognitionController {
  private recognition: SpeechRecognition | null = null;
  private armed = false;
  private onResult: ResultHandler;
  private onStateChange: StateHandler;

  constructor(onResult: ResultHandler, onStateChange: StateHandler) {
    this.onResult = onResult;
    this.onStateChange = onStateChange;
  }

  /** Idempotent — safe to call repeatedly while already listening. */
  start(): void {
    if (this.armed) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.onStateChange('error', 'unsupported');
      return;
    }
    this.armed = true;
    this.attachAndStart(Ctor);
  }

  /** Idempotent — safe to call repeatedly while already stopped. */
  stop(): void {
    if (!this.armed) return;
    this.armed = false;
    this.recognition?.stop();
  }

  private attachAndStart(Ctor: new () => SpeechRecognition): void {
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => this.onStateChange('listening', null);

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const alternative = result?.[0];
      if (result?.isFinal && alternative) this.onResult(alternative.transcript);
    };

    recognition.onerror = (event) => {
      if (isBenignVoiceError(event.error)) return; // e.g. 'no-speech' — onend below restarts it
      const reason = classifyVoiceError(event.error);
      this.onStateChange('error', reason);
      // Can't recover without the user re-granting access or plugging in a
      // mic — stop trying rather than looping restart attempts forever.
      if (reason === 'permission-denied' || reason === 'no-microphone') {
        this.armed = false;
      }
    };

    recognition.onend = () => {
      if (this.armed) {
        // Browsers end the recognizer after any pause, even in continuous
        // mode — restart to keep listening for as long as voice control
        // stays enabled. A fresh instance sidesteps quirks some browsers
        // have reusing an already-ended SpeechRecognition object.
        this.attachAndStart(Ctor);
      } else {
        this.recognition = null;
        this.onStateChange('off', null);
      }
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      // Rare: start() called in an invalid state (e.g. a stray call right
      // on top of a previous instance's own pending start). Not
      // user-facing — the next onend/onstart cycle self-corrects.
    }
  }
}
