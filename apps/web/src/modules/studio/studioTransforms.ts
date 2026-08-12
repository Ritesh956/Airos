import { STUDIO_OBJECTS, type StudioObjectSpec } from './studioObjects';

/**
 * Hot-path transform state for every Studio object — the 3D-Studio
 * equivalent of `cursorEngine.latest`: plain numbers a `useFrame` loop
 * reads and damps toward every frame, never React state (see
 * ARCHITECTURE.md's hot-path/cold-path split; a mesh's position changing
 * 60x/sec has no business going through `useSyncExternalStore`).
 *
 * Deliberately has no Three.js import — this is *target* state (where an
 * object should end up), not the actual rendered transform. StudioScene
 * owns the actual `THREE.Object3D`s and eases them toward these targets
 * with `THREE.MathUtils.damp` each frame, which is what makes translate/
 * scale/rotate — from either the gesture path or the keyboard path below —
 * smooth instead of teleporting.
 *
 * Both input paths (StudioScene's gesture-driven raycast loop, and
 * useStudioKeyboardCommands' CommandRouter handlers) mutate through the
 * same setters here, so "how a transform changes" has exactly one
 * implementation regardless of which input drove it.
 */
export interface StudioTransform {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
}

const POSITION_BOUNDS = { x: 4, yMin: -1, yMax: 3, z: 4 };
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 3;

const transforms = new Map<string, StudioTransform>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** (Re)initializes every object to its spec's starting transform. Called
 *  once when the Studio module mounts — see studioObjects.ts for the
 *  starting positions. */
export function initStudioTransforms(objects: StudioObjectSpec[] = STUDIO_OBJECTS): void {
  transforms.clear();
  for (const obj of objects) {
    transforms.set(obj.id, {
      x: obj.position[0],
      y: obj.position[1],
      z: obj.position[2],
      rotationY: 0,
      scale: 1,
    });
  }
}

export function getStudioTransform(id: string): StudioTransform | undefined {
  return transforms.get(id);
}

export function getAllStudioTransforms(): ReadonlyMap<string, StudioTransform> {
  return transforms;
}

export function setStudioPosition(id: string, x: number, y: number, z: number): void {
  const t = transforms.get(id);
  if (!t) return;
  t.x = clamp(x, -POSITION_BOUNDS.x, POSITION_BOUNDS.x);
  t.y = clamp(y, POSITION_BOUNDS.yMin, POSITION_BOUNDS.yMax);
  t.z = clamp(z, -POSITION_BOUNDS.z, POSITION_BOUNDS.z);
}

export function nudgeStudioPosition(id: string, dx: number, dy: number, dz = 0): void {
  const t = transforms.get(id);
  if (!t) return;
  setStudioPosition(id, t.x + dx, t.y + dy, t.z + dz);
}

export function setStudioScale(id: string, scale: number): void {
  const t = transforms.get(id);
  if (!t) return;
  t.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
}

export function nudgeStudioScale(id: string, factor: number): void {
  const t = transforms.get(id);
  if (!t) return;
  setStudioScale(id, t.scale * factor);
}

export function setStudioRotationY(id: string, rotationY: number): void {
  const t = transforms.get(id);
  if (!t) return;
  t.rotationY = rotationY;
}

export function nudgeStudioRotationY(id: string, deltaRad: number): void {
  const t = transforms.get(id);
  if (!t) return;
  t.rotationY += deltaRad;
}
