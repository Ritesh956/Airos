import { useEffect, useRef } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { VoiceRecognitionController } from '@/interaction/voice/VoiceRecognitionController';
import { appStore, setLastVoiceResult, setVoiceState } from '@/state/appStore';

/**
 * Mounted once at the app shell (like `useNavigationCommands`/
 * `useGlobalKeyboardCommands`) — voice isn't scoped to any one module, so
 * it needs to work no matter which page is active, the same way a
 * keyboard shortcut does.
 *
 * Starts/stops `VoiceRecognitionController` in step with
 * `AppSettings.voiceEnabled` (persisted, toggled from Settings) by
 * subscribing directly to `appStore` — the same "recompute on every
 * appStore change, let idempotent start()/stop() calls make repeats free"
 * pattern `VisionEngine.recompute()` and `CameraLandmarkSource
 * .syncWithCameraState()` already use for camera/source switching.
 */
export function useVoiceCommands(): void {
  const controllerRef = useRef<VoiceRecognitionController | null>(null);

  useEffect(() => {
    const controller = new VoiceRecognitionController(
      (transcript) => {
        const matched = commandRouter.dispatchPhrase(transcript);
        setLastVoiceResult(transcript, matched?.title ?? null);
      },
      (state, error) => setVoiceState(state, error),
    );
    controllerRef.current = controller;

    const sync = () => {
      if (appStore.get().settings.voiceEnabled) {
        controller.start();
      } else {
        controller.stop();
      }
    };

    const unsubscribe = appStore.subscribe(sync);
    sync();

    return () => {
      unsubscribe();
      controller.stop();
      controllerRef.current = null;
    };
  }, []);
}
