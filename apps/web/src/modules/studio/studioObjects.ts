/**
 * The fixed set of manipulable objects promised in the Phase 6 placeholder
 * (`ModulePlaceholder`'s `willInclude` list): a cube, a sphere, a torus,
 * and a "holographic centerpiece." Plain data — no Three.js import here —
 * so it's trivial to read at a glance and reuse from both StudioScene
 * (rendering) and studioTransforms (initial state) without either owning
 * the other.
 */

export type StudioObjectType = 'cube' | 'sphere' | 'torus' | 'centerpiece';

export interface StudioObjectSpec {
  id: string;
  type: StudioObjectType;
  label: string;
  /** World-space initial position [x, y, z]. */
  position: [number, number, number];
  color: string;
}

// The centerpiece sits at the world origin deliberately — that's also
// where the camera looks by default, keeping it the visual anchor its name
// promises. The other three are arranged around it, not in a row. Demo
// Mode's synthetic hand pinches with its index fingertip well off-center
// (verified with a real THREE.Raycaster against the demo fixture's actual
// PINCH-frame coordinates — see StudioScene.tsx's HIT_RADIUS comment), so
// it's the cube it reliably lands on, not the centerpiece — a real object
// still gets selected, which is the part that matters for demonstrating
// "pinch to select" without a camera.
export const STUDIO_OBJECTS: StudioObjectSpec[] = [
  { id: 'centerpiece', type: 'centerpiece', label: 'Centerpiece', position: [0, 0.3, 0], color: '#5eead4' },
  { id: 'cube', type: 'cube', label: 'Cube', position: [-1.9, 0, 0.5], color: '#f4f6fb' },
  { id: 'sphere', type: 'sphere', label: 'Sphere', position: [0.3, 0, -2], color: '#93c5fd' },
  { id: 'torus', type: 'torus', label: 'Torus', position: [1.9, 0, 0.5], color: '#fca5a5' },
];

export function getStudioObjectSpec(id: string): StudioObjectSpec | undefined {
  return STUDIO_OBJECTS.find((o) => o.id === id);
}
