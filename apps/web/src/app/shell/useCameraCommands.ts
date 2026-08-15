import { useEffect } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { cameraManager } from '@/vision/camera/CameraManager';
import { appStore, setInputSource } from '@/state/appStore';

/**
 * Registers "start camera" / "stop camera" / "demo mode" as real commands,
 * mounted once at the app shell like `useNavigationCommands`. Settings'
 * own Voice control panel has always told the user to try saying "'open 3d
 * studio', 'start camera'" as examples — but until this hook existed,
 * nothing ever registered a command whose phrases included "start camera"
 * at all, so that specific example in the app's own UI did nothing when
 * followed (CLAUDE.md UI/UX audit finding #05). `cameraManager` is a plain
 * class with no React dependency (the same one `useCamera()` wraps for
 * component use), so it's safe to call directly here outside any
 * component tied to a specific module's mount state — camera control is
 * app-wide, not scoped to whichever page happens to be open.
 */
export function useCameraCommands(): void {
  useEffect(() => {
    const unregisters = [
      commandRouter.register({
        id: 'camera.start',
        title: 'Start Camera',
        phrases: ['start camera', 'turn on camera', 'enable camera'],
        category: 'Camera',
        run: () => {
          setInputSource('camera');
          void cameraManager.start();
        },
      }),
      commandRouter.register({
        id: 'camera.stop',
        title: 'Stop Camera',
        phrases: ['stop camera', 'turn off camera', 'disable camera'],
        category: 'Camera',
        run: () => cameraManager.stop(),
      }),
      commandRouter.register({
        id: 'camera.demo-mode',
        title: 'Toggle Demo Mode',
        phrases: ['demo mode', 'toggle demo mode', 'enable demo mode'],
        category: 'Camera',
        run: () => {
          const next = appStore.get().inputSource === 'replay' ? 'camera' : 'replay';
          setInputSource(next);
        },
      }),
    ];

    return () => unregisters.forEach((fn) => fn());
  }, []);
}
