import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/vision/camera/CameraManager', () => ({
  cameraManager: {
    downgradeResolution: vi.fn().mockResolvedValue(undefined),
    restoreDefaultResolution: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/vision/hand/HandLandmarkerService', () => ({
  setHandLandmarkerNumHands: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/vision/engine/VisionEngine', () => ({
  visionEngine: {
    setFrameSkipEnabled: vi.fn(),
    setSuppressSecondaryTasks: vi.fn(),
  },
}));

import { setActiveModule, setCameraState, setInputSource } from '@/state/appStore';
import { PUBLISH_INTERVAL_MS, visionStore } from '@/state/visionStore';
import { cameraManager } from '@/vision/camera/CameraManager';
import { setHandLandmarkerNumHands } from '@/vision/hand/HandLandmarkerService';
import { visionEngine } from '@/vision/engine/VisionEngine';
import { SUSTAIN_MS } from './degradationLadder';
import { degradationController } from './DegradationController';

const SAMPLE_WINDOW = Math.round(SUSTAIN_MS / PUBLISH_INTERVAL_MS);
const LOW_FPS_SAMPLES = new Array(SAMPLE_WINDOW).fill(8);
const RECOVERED_FPS_SAMPLES = new Array(SAMPLE_WINDOW).fill(30);

let now = 0;

function setClock(ms: number) {
  now = ms;
}

async function pushFps(samples: number[]) {
  visionStore.update({ fpsHistory: samples });
  // Flush the microtask queue so applyEffects' internal awaits (the
  // mocked cameraManager calls resolve on the next microtask) settle
  // before assertions run.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('degradationController', () => {
  beforeEach(async () => {
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    setClock(0);
    // Clear stale samples *before* the camera goes live, so a leftover
    // fpsHistory from the previous test can't be read as real data during
    // the state transitions below.
    visionStore.update({ fpsHistory: [] });
    setActiveModule('cursor');
    setInputSource('camera');
    setCameraState('active');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    vi.clearAllMocks();
    degradationController.start();
  });

  afterEach(async () => {
    // Drive the controller back to its reset baseline so state doesn't
    // leak between tests — the singleton has no reset() of its own, but
    // "camera not live" always forces one via evaluate()'s reset() branch.
    setInputSource('replay');
    await pushFps([]);
    setInputSource('camera');
    setCameraState('off');
  });

  it('does nothing while the camera is not the live input source, even under sustained low FPS', async () => {
    setInputSource('replay');
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS + 100);
    await pushFps(LOW_FPS_SAMPLES);

    expect(visionStore.get().degradationLevel).toBe(0);
    expect(cameraManager.downgradeResolution).not.toHaveBeenCalled();
  });

  it('does not escalate before the low-FPS window has been sustained for 3 seconds', async () => {
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS - 200);
    await pushFps(LOW_FPS_SAMPLES);

    expect(visionStore.get().degradationLevel).toBe(0);
    expect(cameraManager.downgradeResolution).not.toHaveBeenCalled();
  });

  it('escalates to level 1 (resolution downgrade) after 3 sustained seconds of low median FPS', async () => {
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS);
    await pushFps(LOW_FPS_SAMPLES);

    expect(visionStore.get().degradationLevel).toBe(1);
    expect(cameraManager.downgradeResolution).toHaveBeenCalledWith(640, 480);
    expect(cameraManager.downgradeResolution).toHaveBeenCalledTimes(1);
  });

  it('escalates through every step in order as low FPS keeps sustaining, each requiring its own 3s window', async () => {
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS);
    await pushFps(LOW_FPS_SAMPLES); // -> level 1
    expect(visionStore.get().degradationLevel).toBe(1);

    setClock(SUSTAIN_MS * 2);
    await pushFps(LOW_FPS_SAMPLES); // -> level 2
    expect(visionStore.get().degradationLevel).toBe(2);
    expect(setHandLandmarkerNumHands).toHaveBeenCalledWith(1);

    setClock(SUSTAIN_MS * 3);
    await pushFps(LOW_FPS_SAMPLES); // -> level 3
    expect(visionStore.get().degradationLevel).toBe(3);
    expect(visionEngine.setFrameSkipEnabled).toHaveBeenCalledWith(true);

    setClock(SUSTAIN_MS * 4);
    await pushFps(LOW_FPS_SAMPLES); // -> level 4
    expect(visionStore.get().degradationLevel).toBe(4);
    expect(visionEngine.setSuppressSecondaryTasks).toHaveBeenCalledWith(true);

    setClock(SUSTAIN_MS * 5);
    await pushFps(LOW_FPS_SAMPLES); // -> level 5
    expect(visionStore.get().degradationLevel).toBe(5);

    setClock(SUSTAIN_MS * 6);
    await pushFps(LOW_FPS_SAMPLES); // already at MAX_LEVEL, stays put
    expect(visionStore.get().degradationLevel).toBe(5);
  });

  it('never reduces hands while 3D Studio is the active module', async () => {
    setActiveModule('studio');
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS);
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS * 2);
    await pushFps(LOW_FPS_SAMPLES); // would be level 2 (hands) for any other module

    expect(visionStore.get().degradationLevel).toBe(2);
    expect(setHandLandmarkerNumHands).not.toHaveBeenCalled();
  });

  it('never disables secondary tasks while Gesture Lab is the active module', async () => {
    setActiveModule('lab');
    await pushFps(LOW_FPS_SAMPLES); // seed belowSince at clock 0
    for (let step = 1; step <= 4; step++) {
      setClock(SUSTAIN_MS * step);
      await pushFps(LOW_FPS_SAMPLES);
    }

    expect(visionStore.get().degradationLevel).toBe(4);
    expect(visionEngine.setSuppressSecondaryTasks).not.toHaveBeenCalled();
  });

  it('de-escalates after 3 sustained seconds above the recovery threshold, reversing every applied effect', async () => {
    // Escalate to level 2 first.
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS);
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS * 2);
    await pushFps(LOW_FPS_SAMPLES);
    expect(visionStore.get().degradationLevel).toBe(2);
    vi.clearAllMocks();

    await pushFps(RECOVERED_FPS_SAMPLES);
    setClock(SUSTAIN_MS * 2 + SUSTAIN_MS);
    await pushFps(RECOVERED_FPS_SAMPLES); // level 2 -> 1
    expect(visionStore.get().degradationLevel).toBe(1);
    expect(setHandLandmarkerNumHands).toHaveBeenCalledWith(2);

    setClock(SUSTAIN_MS * 2 + SUSTAIN_MS * 2);
    await pushFps(RECOVERED_FPS_SAMPLES); // level 1 -> 0
    expect(visionStore.get().degradationLevel).toBe(0);
    expect(cameraManager.restoreDefaultResolution).toHaveBeenCalledTimes(1);
  });

  it('resets to level 0 immediately when the camera stops being active, regardless of timers', async () => {
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS);
    await pushFps(LOW_FPS_SAMPLES);
    expect(visionStore.get().degradationLevel).toBe(1);

    setCameraState('off');
    await pushFps(LOW_FPS_SAMPLES);

    expect(visionStore.get().degradationLevel).toBe(0);
    expect(cameraManager.restoreDefaultResolution).toHaveBeenCalledTimes(1);
  });

  it('does not stay in the hysteresis band forever partway between the two thresholds', async () => {
    await pushFps(LOW_FPS_SAMPLES);
    setClock(SUSTAIN_MS);
    await pushFps(LOW_FPS_SAMPLES);
    expect(visionStore.get().degradationLevel).toBe(1);

    // 22 fps sits between LOW_FPS_THRESHOLD(20) and RECOVERY_FPS_THRESHOLD(25) —
    // neither escalates nor recovers, however long it's sustained.
    const midBand = new Array(SAMPLE_WINDOW).fill(22);
    setClock(SUSTAIN_MS + 10000);
    await pushFps(midBand);

    expect(visionStore.get().degradationLevel).toBe(1);
  });
});
