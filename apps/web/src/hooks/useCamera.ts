import { useCallback, useEffect, useRef } from 'react';
import { cameraManager } from '@/vision/camera/CameraManager';
import { appStore, setInputSource, type CameraErrorReason } from '@/state/appStore';
import { CAMERA_ERROR_MESSAGES } from '@/vision/camera/errors';
import { useStoreSelector } from './useStore';

export interface UseCameraResult {
  state: 'off' | 'starting' | 'active' | 'stopping' | 'error';
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Attach the live camera feed into a <video> the caller renders, e.g. for a preview. */
  attach: (target: HTMLVideoElement) => void;
}

/**
 * Every preview <video> element currently attached, shared module-wide
 * rather than kept in a per-hook-instance ref. `CameraStage` and
 * `CameraPreview` each call `useCamera()` independently, so each used to
 * get its own private `attachedVideoRef` — clicking Stop from
 * `CameraStage`'s own hook instance only ever nulled a ref that was never
 * actually attached to anything (`CameraStage` doesn't render a `<video>`
 * itself), leaving whatever `CameraPreview` had attached through its own
 * separate hook instance completely untouched. Stopping the camera stops
 * the tracks, but a `<video>` element doesn't clear its own currently
 * displayed frame just because its source track ended — without
 * explicitly nulling `srcObject`, the last live frame stays frozen on
 * screen indefinitely after Stop. Tracking every attachment here means
 * `stop()`, called from *any* hook instance, clears every preview
 * currently showing the feed.
 */
const attachedVideos = new Set<HTMLVideoElement>();

/**
 * The one React entry point to the camera. Wraps `cameraManager` (a plain
 * class with no React dependency) so components get reactive state without
 * the camera lifecycle itself being tied to any component's mount/unmount —
 * stopping tracking is always an explicit action, never an effect cleanup
 * side effect that could fire on an unrelated re-render.
 */
export function useCamera(): UseCameraResult {
  const state = useStoreSelector(appStore, (s) => s.cameraState);
  const cameraError = useStoreSelector(appStore, (s) => s.cameraError);
  // This hook instance's own attached element, tracked only so unmount
  // cleanup knows which single entry to remove from the shared set above.
  const ownedVideoRef = useRef<HTMLVideoElement | null>(null);

  const start = useCallback(async () => {
    setInputSource('camera');
    const video = await cameraManager.start();
    for (const el of attachedVideos) {
      el.srcObject = video.srcObject;
      void el.play();
    }
  }, []);

  const stop = useCallback(() => {
    cameraManager.stop();
    for (const el of attachedVideos) {
      el.srcObject = null;
    }
  }, []);

  const attach = useCallback((target: HTMLVideoElement) => {
    ownedVideoRef.current = target;
    attachedVideos.add(target);
    const source = cameraManager.getVideoElement();
    if (source) {
      target.srcObject = source.srcObject;
      void target.play();
    }
  }, []);

  // Safety net, not the primary mechanism: if a user navigates away entirely
  // (closes the tab) browsers already revoke the stream. This effect exists
  // only to drop this instance's element from the shared set on unmount so
  // a detached <video> doesn't keep receiving srcObject writes; it never
  // calls stop().
  useEffect(() => {
    return () => {
      if (ownedVideoRef.current) attachedVideos.delete(ownedVideoRef.current);
      ownedVideoRef.current = null;
    };
  }, []);

  const errorMessage =
    state === 'error' && cameraError ? CAMERA_ERROR_MESSAGES[cameraError as CameraErrorReason] : null;

  return { state, errorMessage, start, stop, attach };
}
