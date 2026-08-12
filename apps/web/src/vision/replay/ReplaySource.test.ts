import { describe, expect, it, vi } from 'vitest';
import { ReplaySource } from './ReplaySource';
import type { HandObservation, VisionFrame } from '@/vision/types';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const STUB_HAND: HandObservation = {
  landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
  worldLandmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
  handedness: 'Left',
  handednessScore: 0.9,
};

/** ReplaySource is generic over frame *content* — its own tests shouldn't
 *  depend on the specific showcase sequence in fixtures.ts (that has its
 *  own dedicated tests). This builds a minimal, duration-controllable
 *  VisionFrame[] for exercising start/stop/looping/task-filtering. */
function makeFrames(durationMs: number, fps: number): VisionFrame[] {
  const frameCount = Math.round((durationMs / 1000) * fps);
  return Array.from({ length: frameCount }, (_, i) => ({
    timestamp: (i / fps) * 1000,
    hands: [STUB_HAND],
    face: null,
    pose: null,
    timings: { inferenceMs: 0, totalMs: 0 },
    source: 'replay' as const,
  }));
}

describe('ReplaySource', () => {
  it('reports its kind as replay', () => {
    const source = new ReplaySource(makeFrames(100, 30));
    expect(source.kind).toBe('replay');
    source.stop();
  });

  it('emits frames to subscribers once started', async () => {
    const source = new ReplaySource(makeFrames(200, 30));
    const onFrame = vi.fn();
    source.subscribe(onFrame);

    await source.start({ hand: true, face: false, pose: false });
    await wait(80);
    source.stop();

    expect(onFrame).toHaveBeenCalled();
    const frame = onFrame.mock.calls[0]![0];
    expect(frame.source).toBe('replay');
  });

  it('withholds hand data when the hand task is not requested', async () => {
    const source = new ReplaySource(makeFrames(200, 30));
    const onFrame = vi.fn();
    source.subscribe(onFrame);

    await source.start({ hand: false, face: false, pose: false });
    await wait(50);
    source.stop();

    expect(onFrame).toHaveBeenCalled();
    for (const [frame] of onFrame.mock.calls) {
      expect(frame.hands).toEqual([]);
    }
  });

  it('stops emitting after stop()', async () => {
    const source = new ReplaySource(makeFrames(200, 30));
    const onFrame = vi.fn();
    source.subscribe(onFrame);

    await source.start({ hand: true, face: false, pose: false });
    await wait(50);
    source.stop();
    const countAtStop = onFrame.mock.calls.length;

    await wait(80);
    expect(onFrame.mock.calls.length).toBe(countAtStop);
  });

  it('loops past the end of a short fixture instead of stopping', async () => {
    // A very short loop (100ms) so a 250ms observation window guarantees
    // at least one wraparound if looping works.
    const source = new ReplaySource(makeFrames(100, 30));
    const onFrame = vi.fn();
    source.subscribe(onFrame);

    await source.start({ hand: true, face: false, pose: false });
    await wait(250);
    source.stop();

    // At ~60fps (rAF shim) over 250ms we'd expect on the order of 15
    // callbacks; assert a conservative floor so this isn't flaky, while
    // still proving the loop kept running well past the 100ms fixture.
    expect(onFrame.mock.calls.length).toBeGreaterThan(5);
  });

  it('unsubscribe stops that listener from receiving further frames', async () => {
    const source = new ReplaySource(makeFrames(200, 30));
    const onFrame = vi.fn();
    const unsubscribe = source.subscribe(onFrame);

    await source.start({ hand: true, face: false, pose: false });
    await wait(30);
    unsubscribe();
    const countAtUnsubscribe = onFrame.mock.calls.length;

    await wait(50);
    source.stop();

    expect(onFrame.mock.calls.length).toBe(countAtUnsubscribe);
  });
});
