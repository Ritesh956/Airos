import { useEffect, useState } from 'react';
import { visionEngine } from '@/vision/engine/VisionEngine';
import { throttle } from '@/state/createStore';
import { interactionStore } from '@/state/interactionStore';
import { useStoreSelector } from '@/hooks/useStore';
import { mirrorHandedness, mirrorLandmark } from '@/utils/coords';
import type { HandObservation } from '@/vision/types';
import { Panel } from '@/ui/Panel';
import { MethodBadge } from '@/ui/MethodBadge';

// MediaPipe's fixed 21-point hand landmark ordering — see docs/COMPUTER_VISION.md.
const LANDMARK_NAMES = [
  'WRIST',
  'THUMB_CMC',
  'THUMB_MCP',
  'THUMB_IP',
  'THUMB_TIP',
  'INDEX_MCP',
  'INDEX_PIP',
  'INDEX_DIP',
  'INDEX_TIP',
  'MIDDLE_MCP',
  'MIDDLE_PIP',
  'MIDDLE_DIP',
  'MIDDLE_TIP',
  'RING_MCP',
  'RING_PIP',
  'RING_DIP',
  'RING_TIP',
  'PINKY_MCP',
  'PINKY_PIP',
  'PINKY_DIP',
  'PINKY_TIP',
] as const;

// This is a table a human reads, not a canvas a human watches track the
// camera in real time — 10Hz is plenty (see the hot-path/cold-path note in
// CLAUDE.md's Phase 5 section) and keeps React from re-rendering a 21-row
// table 30-60x/sec.
const TABLE_PUBLISH_INTERVAL_MS = 100;

function formatCoord(n: number): string {
  return n.toFixed(3);
}

/**
 * Renders every currently-tracked hand's raw landmark array as a table —
 * the "exactly what the model sees" promise in the Gesture Lab placeholder.
 * X/Y/Z/Visibility are MediaPipe's unmirrored output (MODEL, per
 * vision/types.ts's coordinate convention); Mirrored X is the one
 * presentation-space transform utils/coords.ts applies before anything is
 * drawn on screen, shown here as DERIVED so the table doubles as a live
 * demonstration of that convention rather than just asserting it in docs.
 */
export function LandmarkTable() {
  const [hands, setHands] = useState<HandObservation[]>([]);
  const trackingState = useStoreSelector(interactionStore, (s) => s.trackingState);

  useEffect(() => {
    const publish = throttle((next: HandObservation[]) => setHands(next), TABLE_PUBLISH_INTERVAL_MS);
    const unsubscribe = visionEngine.subscribe((frame) => publish(frame.hands));
    return () => {
      unsubscribe();
      publish.cancel();
    };
  }, []);

  // Frames stop arriving entirely when tracking stops (camera off, no
  // task acquired elsewhere) — without this, the table would keep showing
  // the last hand seen indefinitely instead of reflecting that nothing is
  // tracking. Same staleness bug class as visionStore's Phase 2 fix.
  useEffect(() => {
    if (trackingState !== 'tracking') setHands([]);
  }, [trackingState]);

  return (
    <Panel eyebrow="Model Output" title="Landmark Table" action={<MethodBadge method="MODEL" />}>
      {hands.length === 0 ? (
        <p className="text-sm text-ink-3">No hand detected. Start the camera, show your hand, or enable Demo Mode.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {hands.map((hand, handIndex) => (
            <div key={handIndex}>
              <div className="mb-2 flex items-center gap-2 text-xs text-ink-2">
                <span className="font-medium text-ink-0">{mirrorHandedness(hand.handedness)} hand</span>
                <span className="text-mono-tabular">score {hand.handednessScore.toFixed(2)}</span>
              </div>
              <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-lg border border-border">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <caption className="sr-only">
                    All 21 tracked landmarks for the {mirrorHandedness(hand.handedness).toLowerCase()} hand
                  </caption>
                  <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-ink-3">
                    <tr>
                      <th scope="col" className="px-2 py-1.5">#</th>
                      <th scope="col" className="px-2 py-1.5">Landmark</th>
                      <th scope="col" className="px-2 py-1.5">X</th>
                      <th scope="col" className="px-2 py-1.5">Y</th>
                      <th scope="col" className="px-2 py-1.5">Z</th>
                      <th scope="col" className="px-2 py-1.5">Mirrored X</th>
                      <th scope="col" className="px-2 py-1.5">Visibility</th>
                    </tr>
                  </thead>
                  <tbody className="text-mono-tabular text-ink-1">
                    {hand.landmarks.map((landmark, idx) => (
                      <tr key={idx} className="border-t border-border/60">
                        <td className="px-2 py-1 text-ink-3">{idx}</td>
                        <td className="px-2 py-1">{LANDMARK_NAMES[idx] ?? `#${idx}`}</td>
                        <td className="px-2 py-1">{formatCoord(landmark.x)}</td>
                        <td className="px-2 py-1">{formatCoord(landmark.y)}</td>
                        <td className="px-2 py-1">{formatCoord(landmark.z)}</td>
                        <td className="px-2 py-1">{formatCoord(mirrorLandmark(landmark).x)}</td>
                        <td className="px-2 py-1">
                          {landmark.visibility !== undefined ? landmark.visibility.toFixed(2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        X/Y/Z/Visibility are MediaPipe's raw output, unmirrored, normalized to [0, 1]. Mirrored X is the
        presentation-space value used everywhere the hand is drawn on screen — the one place mirroring
        happens (utils/coords.ts).
      </p>
    </Panel>
  );
}
