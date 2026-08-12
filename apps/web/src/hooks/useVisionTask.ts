import { useEffect, useId } from 'react';
import { visionEngine } from '@/vision/engine/VisionEngine';
import type { VisionTaskRequest } from '@/vision/types';

/**
 * Acquires vision tasks (hand/face/pose) for the lifetime of the calling
 * component. This is the one line a module needs to start being tracked —
 * `useVisionTask({ hand: true })` — and releasing on unmount is automatic,
 * so navigating away from a module stops the work it required without it
 * having to remember to clean up itself.
 */
export function useVisionTask(tasks: VisionTaskRequest): void {
  const consumerId = useId();

  useEffect(() => {
    return visionEngine.acquire(consumerId, tasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumerId, tasks.hand, tasks.face, tasks.pose]);
}
