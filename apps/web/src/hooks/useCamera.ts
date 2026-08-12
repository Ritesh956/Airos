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
 * The one React entry point to the camera. Wraps `cameraManager` (a plain
 * class with no React dependency) so components get reactive state without
 * the camera lifecycle itself being tied to any component's mount/unmount —
 * stopping tracking is always an explicit action, never an effect cleanup
 * side effect that could fire on an unrelated re-render.
 */
export function useCamera(): UseCameraResult {
  const state = useStoreSelector(appStore, (s) => s.cameraState);
  const cameraError = useStoreSelector(appStore, (s) => s.cameraError);
  const attachedVideoRef = useRef<HTMLVideoElement | null>(null);

  const start = useCallback(async () => {
    setInputSource('camera');
    const video = await cameraManager.start();
    if (attachedVideoRef.current) {
      attachedVideoRef.current.srcObject = video.srcObject;
      void attachedVideoRef.current.play();
    }
  }, []);

  const stop = useCallback(() => {
    cameraManager.stop();
    if (attachedVideoRef.current) {
      attachedVideoRef.current.srcObject = null;
    }
  }, []);

  const attach = useCallback((target: HTMLVideoElement) => {
    attachedVideoRef.current = target;
    const source = cameraManager.getVideoElement();
    if (source) {
      target.srcObject = source.srcObject;
      void target.play();
    }
  }, []);

  // Safety net, not the primary mechanism: if a user navigates away entirely
  // (closes the tab) browsers already revoke the stream. This effect exists
  // only to null the preview's srcObject reference on unmount so a detached
  // <video> element doesn't hold a stale reference; it never calls stop().
  useEffect(() => {
    return () => {
      attachedVideoRef.current = null;
    };
  }, []);

  const errorMessage =
    state === 'error' && cameraError ? CAMERA_ERROR_MESSAGES[cameraError as CameraErrorReason] : null;

  return { state, errorMessage, start, stop, attach };
}
