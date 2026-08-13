import { describe, expect, it, vi } from 'vitest';
import { appStore, setLastVoiceResult, setVoiceState } from './appStore';

// appStore is a module-level singleton (later phases keep registering
// against it, same reasoning CommandRouter.test.ts documents for its own
// singleton), so every test resets voice state to a known baseline itself
// rather than relying on run order or isolation between files.
describe('setVoiceState', () => {
  it('skips notifying subscribers when nothing actually changed', () => {
    setVoiceState('off', null);
    const listener = vi.fn();
    const unsubscribe = appStore.subscribe(listener);

    setVoiceState('off', null); // identical to the current state

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('notifies subscribers when the state actually changes', () => {
    setVoiceState('off', null);
    const listener = vi.fn();
    const unsubscribe = appStore.subscribe(listener);

    setVoiceState('listening', null);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(appStore.get().voiceState).toBe('listening');

    setVoiceState('off', null);
    unsubscribe();
  });

  it('treats a different error reason at the same voiceState as a real change', () => {
    setVoiceState('error', 'unsupported');
    const listener = vi.fn();
    const unsubscribe = appStore.subscribe(listener);

    setVoiceState('error', 'network');

    expect(listener).toHaveBeenCalledTimes(1);
    setVoiceState('off', null);
    unsubscribe();
  });

  // This is the actual bug the equality guard exists to prevent (see the
  // doc comment on setVoiceState in appStore.ts): createStore.ts's
  // notify() has no equality check of its own, so a subscriber that
  // reacts to *any* appStore change by unconditionally re-reporting the
  // same voice state — the exact shape useVoiceCommands.ts's sync effect
  // has — would otherwise recurse without bound, since each write would
  // re-trigger every listener, including itself, forever.
  it('prevents unbounded re-entrant notification when a subscriber calls it back synchronously', () => {
    setVoiceState('off', null);
    let callCount = 0;
    const unsubscribe = appStore.subscribe(() => {
      callCount += 1;
      if (callCount > 5) throw new Error('setVoiceState re-entered without bound');
      setVoiceState('error', 'unsupported');
    });

    setVoiceState('error', 'unsupported');

    expect(callCount).toBe(1);
    setVoiceState('off', null);
    unsubscribe();
  });
});

describe('setLastVoiceResult', () => {
  it('stores the transcript and the matched command title', () => {
    setLastVoiceResult('open studio', 'Open 3D Studio');
    expect(appStore.get().lastVoiceTranscript).toBe('open studio');
    expect(appStore.get().lastVoiceCommandTitle).toBe('Open 3D Studio');
  });

  it('records a null matched title when nothing matched', () => {
    setLastVoiceResult('gibberish nonsense', null);
    expect(appStore.get().lastVoiceTranscript).toBe('gibberish nonsense');
    expect(appStore.get().lastVoiceCommandTitle).toBeNull();
  });
});
