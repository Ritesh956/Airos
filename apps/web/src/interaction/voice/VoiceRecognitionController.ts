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
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  /** Consecutive non-benign errors since the last successful `onstart` —
   *  reset to 0 there. Lets one real, transient failure (a genuine network
   *  blip) retry normally, while a *tight* failure loop (no reachable
   *  speech backend, a persistent device issue) gives up instead of
   *  restarting forever with zero delay — see `onerror`/`onend` below for
   *  the bug this closes. */
  private consecutiveErrors = 0;
  /** Set alongside `armed = false` when we disarm ourselves because of a
   *  real error (permission denied, no mic, or too many consecutive
   *  failures) — read by `onend` so it reports that error as the final
   *  state instead of silently overwriting it with `'off'` a moment
   *  later, which would look like nothing went wrong. Reset by an
   *  explicit `stop()`, which should always report `'off'`. */
  private disarmedByError = false;

  private static readonly MAX_CONSECUTIVE_ERRORS = 3;
  /** How long to wait before retrying after a non-fatal error, instead of
   *  restarting on the very same tick `onend` fires. Without this, a
   *  backend that fails instantly on every `start()` call (e.g. no real
   *  network route to the browser's speech-recognition service) produces
   *  a start→error→end→start loop with no gap at all — reported live as
   *  the status pill visibly flickering between Listening and Error
   *  several times a second. */
  private static readonly RETRY_DELAY_MS = 2000;

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
    this.disarmedByError = false;
    this.consecutiveErrors = 0;
    this.attachAndStart(Ctor);
  }

  /** Idempotent — safe to call repeatedly while already stopped. */
  stop(): void {
    if (!this.armed) return;
    this.armed = false;
    this.disarmedByError = false;
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    this.recognition?.stop();
  }

  private attachAndStart(Ctor: new () => SpeechRecognition): void {
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      this.consecutiveErrors = 0;
      this.onStateChange('listening', null);
    };

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const alternative = result?.[0];
      if (result?.isFinal && alternative) this.onResult(alternative.transcript);
    };

    recognition.onerror = (event) => {
      if (isBenignVoiceError(event.error)) return; // e.g. 'no-speech' — onend below restarts it
      const reason = classifyVoiceError(event.error);
      this.onStateChange('error', reason);

      if (reason === 'permission-denied' || reason === 'no-microphone') {
        // Can't recover without the user re-granting access or plugging in
        // a mic — stop trying rather than looping restart attempts forever.
        this.armed = false;
        this.disarmedByError = true;
        return;
      }

      this.consecutiveErrors += 1;
      if (this.consecutiveErrors >= VoiceRecognitionController.MAX_CONSECUTIVE_ERRORS) {
        // Repeated failures with no successful 'listening' state landed in
        // between — not a transient blip (a real one-off network hiccup
        // would typically succeed within the first retry or two).
        // Retrying forever here is what turned a single bad request into
        // an open-ended restart loop; give up the same way the two
        // unrecoverable reasons above already do. Toggling voice control
        // off and back on tries again from a clean state.
        this.armed = false;
        this.disarmedByError = true;
      }
    };

    recognition.onend = () => {
      if (this.armed) {
        // Browsers end the recognizer after any pause, even in continuous
        // mode — restart to keep listening for as long as voice control
        // stays enabled. A fresh instance sidesteps quirks some browsers
        // have reusing an already-ended SpeechRecognition object.
        if (this.consecutiveErrors > 0) {
          // A non-fatal error (network/unknown) just preceded this end —
          // whatever's wrong probably hasn't cleared yet. Back off instead
          // of restarting instantly, which is the actual mechanism behind
          // the flicker this class used to produce.
          this.retryTimeoutId = setTimeout(() => {
            this.retryTimeoutId = null;
            if (this.armed) this.attachAndStart(Ctor);
          }, VoiceRecognitionController.RETRY_DELAY_MS);
        } else {
          this.attachAndStart(Ctor);
        }
      } else {
        this.recognition = null;
        // Only report 'off' for an explicit stop(). If we just disarmed
        // ourselves because of a real error, that error (already reported
        // above) is the honest final state — silently overwriting it with
        // 'off' a moment later would misreport what actually happened.
        if (!this.disarmedByError) this.onStateChange('off', null);
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
