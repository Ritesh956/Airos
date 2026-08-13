import { useEffect, useState } from 'react';
import { visionEngine } from '@/vision/engine/VisionEngine';
import { throttle } from '@/state/createStore';
import { interactionStore } from '@/state/interactionStore';
import { useStoreSelector } from '@/hooks/useStore';
import { computePoseAngles, NO_POSE_ANGLES, type PoseAngles } from '@/vision/pose/poseAngles';

// A readout a human reads doesn't need frame-rate updates — same reasoning
// as LandmarkTable.tsx's identical throttle.
const PUBLISH_INTERVAL_MS = 100;

/** Live pose joint angles (elbow/knee, degrees), throttled to ~10Hz. */
export function usePoseAngles(): PoseAngles {
  const [angles, setAngles] = useState<PoseAngles>(NO_POSE_ANGLES);
  const trackingState = useStoreSelector(interactionStore, (s) => s.trackingState);

  useEffect(() => {
    const publish = throttle((next: PoseAngles) => setAngles(next), PUBLISH_INTERVAL_MS);
    const unsubscribe = visionEngine.subscribe((frame) => {
      publish(frame.pose ? computePoseAngles(frame.pose) : NO_POSE_ANGLES);
    });
    return () => {
      unsubscribe();
      publish.cancel();
    };
  }, []);

  // Frames stop arriving entirely when tracking stops (camera off, no task
  // acquired) — without this, the readout would keep showing the last
  // angles seen indefinitely instead of reflecting that nothing is
  // tracking. Same staleness bug class as LandmarkTable.tsx's identical
  // effect (CLAUDE.md bug #9's family: a hot-path consumer that isn't
  // state-driven needs its own explicit "stop seeing frames" handling).
  useEffect(() => {
    if (trackingState !== 'tracking') setAngles(NO_POSE_ANGLES);
  }, [trackingState]);

  return angles;
}
