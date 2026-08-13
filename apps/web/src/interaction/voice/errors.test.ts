import { describe, expect, it } from 'vitest';
import { classifyVoiceError, isBenignVoiceError, VOICE_ERROR_MESSAGES } from './errors';

describe('isBenignVoiceError', () => {
  it('treats no-speech and aborted as benign', () => {
    expect(isBenignVoiceError('no-speech')).toBe(true);
    expect(isBenignVoiceError('aborted')).toBe(true);
  });

  it('treats every other error code as non-benign', () => {
    expect(isBenignVoiceError('not-allowed')).toBe(false);
    expect(isBenignVoiceError('audio-capture')).toBe(false);
    expect(isBenignVoiceError('network')).toBe(false);
    expect(isBenignVoiceError('some-unknown-code')).toBe(false);
  });
});

describe('classifyVoiceError', () => {
  it('maps not-allowed and service-not-allowed to permission-denied', () => {
    expect(classifyVoiceError('not-allowed')).toBe('permission-denied');
    expect(classifyVoiceError('service-not-allowed')).toBe('permission-denied');
  });

  it('maps audio-capture to no-microphone', () => {
    expect(classifyVoiceError('audio-capture')).toBe('no-microphone');
  });

  it('maps network to network', () => {
    expect(classifyVoiceError('network')).toBe('network');
  });

  it('maps anything unrecognized to unknown', () => {
    expect(classifyVoiceError('bad-grammar')).toBe('unknown');
    expect(classifyVoiceError('language-not-supported')).toBe('unknown');
    expect(classifyVoiceError('')).toBe('unknown');
  });

  it('has a human message for every possible classification, including unsupported', () => {
    const reasons = ['permission-denied', 'no-microphone', 'network', 'unsupported', 'unknown'] as const;
    for (const reason of reasons) {
      expect(VOICE_ERROR_MESSAGES[reason].length).toBeGreaterThan(0);
    }
  });
});
