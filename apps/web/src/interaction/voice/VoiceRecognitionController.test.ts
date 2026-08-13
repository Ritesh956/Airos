import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceRecognitionController } from './VoiceRecognitionController';

/** A minimal fake standing in for the real (unimplemented-in-jsdom)
 *  SpeechRecognition — just enough surface for the controller to drive,
 *  with manual event-firing helpers so tests can simulate the browser's
 *  async lifecycle deterministically. */
class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  started = false;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((event: { results: { 0: { transcript: string }; isFinal: boolean }[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
    this.onend?.();
  }

  abort(): void {
    this.started = false;
  }

  static latest(): FakeSpeechRecognition {
    const instance = FakeSpeechRecognition.instances[FakeSpeechRecognition.instances.length - 1];
    if (!instance) throw new Error('No FakeSpeechRecognition instance was constructed');
    return instance;
  }
}

function finalResult(transcript: string) {
  return { results: [{ 0: { transcript }, isFinal: true }] };
}

const originalSpeechRecognition = window.SpeechRecognition;

afterEach(() => {
  FakeSpeechRecognition.instances = [];
  window.SpeechRecognition = originalSpeechRecognition;
});

describe('VoiceRecognitionController — unsupported browser', () => {
  it('reports an unsupported error and never constructs a recognizer', () => {
    delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    const onResult = vi.fn();
    const onStateChange = vi.fn();
    const controller = new VoiceRecognitionController(onResult, onStateChange);

    controller.start();

    expect(onStateChange).toHaveBeenCalledWith('error', 'unsupported');
    expect(FakeSpeechRecognition.instances).toHaveLength(0);
  });
});

describe('VoiceRecognitionController — with a recognizer available', () => {
  it('reports listening once the recognizer actually starts', () => {
    window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
    const onStateChange = vi.fn();
    const controller = new VoiceRecognitionController(vi.fn(), onStateChange);

    controller.start();
    FakeSpeechRecognition.latest().onstart?.();

    expect(onStateChange).toHaveBeenCalledWith('listening', null);
  });

  it('dispatches only final results as transcripts', () => {
    window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
    const onResult = vi.fn();
    const controller = new VoiceRecognitionController(onResult, vi.fn());

    controller.start();
    const recognizer = FakeSpeechRecognition.latest();
    recognizer.onresult?.({ results: [{ 0: { transcript: 'open studio' }, isFinal: false }] });
    expect(onResult).not.toHaveBeenCalled();

    recognizer.onresult?.(finalResult('open 3d studio'));
    expect(onResult).toHaveBeenCalledWith('open 3d studio');
  });

  it('swallows benign errors (no-speech) without reporting an error state', () => {
    window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
    const onStateChange = vi.fn();
    const controller = new VoiceRecognitionController(vi.fn(), onStateChange);

    controller.start();
    FakeSpeechRecognition.latest().onerror?.({ error: 'no-speech' });

    expect(onStateChange).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('reports a real error and stops retrying on permission-denied', () => {
    window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
    const onStateChange = vi.fn();
    const controller = new VoiceRecognitionController(vi.fn(), onStateChange);

    controller.start();
    const recognizer = FakeSpeechRecognition.latest();
    recognizer.onerror?.({ error: 'not-allowed' });

    expect(onStateChange).toHaveBeenCalledWith('error', 'permission-denied');

    // A permission-denied failure shouldn't keep restarting — ending the
    // (already-failed) recognizer must not spin up a fresh instance.
    const instanceCountBeforeEnd = FakeSpeechRecognition.instances.length;
    recognizer.onend?.();
    expect(FakeSpeechRecognition.instances).toHaveLength(instanceCountBeforeEnd);
  });

  it('restarts with a fresh instance when the recognizer ends while still armed', () => {
    window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
    const controller = new VoiceRecognitionController(vi.fn(), vi.fn());

    controller.start();
    const first = FakeSpeechRecognition.latest();
    first.onend?.(); // browsers end the recognizer after a pause even in continuous mode

    expect(FakeSpeechRecognition.instances.length).toBeGreaterThan(1);
    expect(FakeSpeechRecognition.latest()).not.toBe(first);
  });

  it('reports off once stop() lets the recognizer actually end', () => {
    window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
    const onStateChange = vi.fn();
    const controller = new VoiceRecognitionController(vi.fn(), onStateChange);

    controller.start();
    controller.stop(); // triggers the fake's onend synchronously, same as a real stop() eventually does

    expect(onStateChange).toHaveBeenCalledWith('off', null);
  });

  it('start() is idempotent while already listening', () => {
    window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
    const controller = new VoiceRecognitionController(vi.fn(), vi.fn());

    controller.start();
    controller.start();

    expect(FakeSpeechRecognition.instances).toHaveLength(1);
  });

  it('backs off before restarting after a non-fatal error, instead of restarting on the same tick', () => {
    vi.useFakeTimers();
    try {
      window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
      const controller = new VoiceRecognitionController(vi.fn(), vi.fn());

      controller.start();
      const first = FakeSpeechRecognition.latest();
      first.onerror?.({ error: 'network' });
      first.onend?.();

      // Immediately after onend: no new instance yet — this is the exact
      // gap that used to be missing, which is what made the status pill
      // flicker between Listening and Error every restart with no delay.
      expect(FakeSpeechRecognition.instances).toHaveLength(1);

      vi.advanceTimersByTime(2000);
      expect(FakeSpeechRecognition.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after repeated consecutive network errors instead of retrying forever', () => {
    vi.useFakeTimers();
    try {
      window.SpeechRecognition = FakeSpeechRecognition as unknown as typeof window.SpeechRecognition;
      const onStateChange = vi.fn();
      const controller = new VoiceRecognitionController(vi.fn(), onStateChange);

      controller.start();
      // Three consecutive failures with no successful 'listening' state in
      // between — matches MAX_CONSECUTIVE_ERRORS.
      for (let i = 0; i < 3; i++) {
        const recognizer = FakeSpeechRecognition.latest();
        recognizer.onerror?.({ error: 'network' });
        recognizer.onend?.();
        vi.advanceTimersByTime(2000);
      }

      const instanceCountAfterGivingUp = FakeSpeechRecognition.instances.length;

      // No further restart should be scheduled — advancing time well past
      // another retry window must not spin up another instance.
      vi.advanceTimersByTime(10_000);
      expect(FakeSpeechRecognition.instances).toHaveLength(instanceCountAfterGivingUp);

      // The final reported state is the error, not a silent 'off' —
      // overwriting it would misreport that voice control just turned
      // itself off cleanly when it actually gave up after failing.
      expect(onStateChange).toHaveBeenLastCalledWith('error', 'network');
    } finally {
      vi.useRealTimers();
    }
  });
});
