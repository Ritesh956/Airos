/**
 * Minimal ambient types for the Web Speech API's `SpeechRecognition`
 * interface. TypeScript's `lib.dom.d.ts` already types the event/result
 * payloads (`SpeechRecognitionEvent`, `SpeechRecognitionErrorEvent`,
 * `SpeechRecognitionResult`, `SpeechRecognitionResultList`,
 * `SpeechRecognitionAlternative`) but not the recognizer interface itself
 * or its constructor — the API still isn't a finished W3C standard, which
 * is also why Chrome/Edge only expose it under the `webkitSpeechRecognition`
 * vendor prefix (typed here too, via the `Window` augmentation below).
 */
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

interface Window {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}
