import { describe, expect, it } from 'vitest';
import { generateSyntheticPose } from './poseSkeleton';
import { computePoseAngles } from '@/vision/pose/poseAngles';

describe('generateSyntheticPose', () => {
  it('produces a well-formed, in-bounds 33-point landmark array', () => {
    const pose = generateSyntheticPose(0);

    expect(pose.landmarks).toHaveLength(33);
    expect(pose.worldLandmarks).toHaveLength(33);
    for (const p of pose.landmarks) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for a given timestamp', () => {
    const a = generateSyntheticPose(777);
    const b = generateSyntheticPose(777);
    expect(a).toEqual(b);
  });

  it('actually animates the right wrist over time, in the spirit of bug #6', () => {
    // A regression guard against a fixture that "looks" animated but never
    // changes any point — see CLAUDE.md bug #6 (a demo fixture that didn't
    // actually demo anything, caught only by driving it through real
    // downstream logic, not by eyeballing it). The right *elbow* (index 14)
    // is deliberately fixed — only the forearm swings from it, so the
    // wrist (index 16) is the point that actually moves.
    const a = generateSyntheticPose(0);
    const b = generateSyntheticPose(1500);
    expect(Math.abs(a.landmarks[16]!.x - b.landmarks[16]!.x) + Math.abs(a.landmarks[16]!.y - b.landmarks[16]!.y)).not.toBe(0);
  });

  it('hits the fixture\'s two calibration extremes: ~180deg straight, ~90deg folded', () => {
    // The fixture is deliberately built so its right-elbow motion has two
    // literally verifiable instants (see poseSkeleton.ts's doc comment) —
    // this is the "manual check" Phase 10's gate asks for, expressed as an
    // automated regression rather than only a one-time eyeball check.
    const straight = computePoseAngles(generateSyntheticPose(0));
    const folded = computePoseAngles(generateSyntheticPose(1500));

    expect(straight.rightElbowDeg!).toBeCloseTo(180, 0);
    expect(folded.rightElbowDeg!).toBeCloseTo(90, 0);

    // The left arm stays at rest throughout — only the right elbow animates.
    const leftAtStart = straight.leftElbowDeg!;
    const leftAtFold = folded.leftElbowDeg!;
    expect(leftAtStart).toBeCloseTo(leftAtFold, 5);
  });
});
