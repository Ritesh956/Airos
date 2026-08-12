import { useRef, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { MathUtils, Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import { studioEngine } from '@/interaction/studio/StudioEngine';
import { computeTwoHandDelta, type TwoHandPoints } from '@/interaction/studio/twoHandGesture';
import { getStudioTransform, setStudioPosition, setStudioRotationY, setStudioScale } from './studioTransforms';
import { STUDIO_OBJECTS } from './studioObjects';
import { appStore } from '@/state/appStore';
import { interactionStore, setSelectedObjectId } from '@/state/interactionStore';
import { useStoreSelector } from '@/hooks/useStore';

const DAMP_LAMBDA = 10; // higher = snappier easing; see the module doc for why this isn't instant.
const REDUCED_MOTION_LAMBDA = 40;

// Raycasting hit target, in world units — deliberately larger than any
// object's visible geometry (the biggest, the cube, only reaches ~0.78 at
// its corners). Gesture pointing is far less precise than a mouse cursor
// (Fitts's Law hits harder when the "cursor" is a fingertip mapped through
// a camera and a reach box), so a generous invisible hitbox matters for
// real use, not just for Demo Mode's fixed-position synthetic pinch.
// Verified against the demo fixture's actual PINCH-frame NDC coordinates
// (computed via a throwaway Vitest diagnostic, not guessed) with a real
// THREE.Raycaster: at this radius the ray hits the cube's hitbox. Caught
// in browser verification, not by any automated check — see CLAUDE.md's
// Phase 6 bugs.
const HIT_RADIUS = 1.3;
// A coarse low-segment sphere is a faceted polyhedron, not a true sphere —
// THREE.Raycaster tests actual triangles, so a ray that mathematically
// grazes the ideal sphere at HIT_RADIUS can still miss a coarse
// approximation's flat facets. This was the second half of the same bug:
// HIT_RADIUS alone (previously 0.95, a mathematical near-hit on the cube)
// still missed in the browser against an 8x8-segment hitbox.
const HIT_SEGMENTS = 16;

interface TwoHandBaseline {
  points: TwoHandPoints;
  scale: number;
  rotationY: number;
}

/** Walks up from a raycast hit (which lands on the invisible hitbox or the
 *  visible mesh, either child of the registered group) to find the id
 *  tagged on their common parent. */
function resolveStudioId(object: Object3D | null): string | undefined {
  let current: Object3D | null = object;
  while (current) {
    const id = current.userData.studioId as string | undefined;
    if (id) return id;
    current = current.parent;
  }
  return undefined;
}

/**
 * The Three.js side of Phase 6's Interaction Engine — rendered inside
 * `<Canvas>`, where `camera`/`scene` actually exist (StudioEngine
 * deliberately doesn't know about either, see its module doc). Owns:
 *
 * - Single-hand pinch: raycast-hit-test to select, then drag the selected
 *   object across a camera-facing plane at its own depth while the pinch
 *   is held (grab-offset preserved, so the object doesn't snap its center
 *   to the fingertip).
 * - Two-hand pinch: scale/rotate the *currently selected* object, via
 *   `twoHandGesture.ts`'s pure vector-angle math — see its doc comment for
 *   why "vector angle" was chosen over "relative twist" per
 *   IMPLEMENTATION.md §13's open question.
 * - Every target transform (from either path, or the keyboard commands in
 *   useStudioKeyboardCommands.ts, which mutate the exact same
 *   studioTransforms map) is approached via `MathUtils.damp`, never
 *   snapped — the module's "no teleporting" gate, satisfied structurally
 *   rather than by careful discipline at each call site.
 *
 * Mouse/touch selection is free: R3F's own `onClick`/`onPointerMissed`
 * fire independently of the gesture raycast below, both converging on the
 * same `setSelectedObjectId`.
 */
export function StudioScene() {
  const selectedId = useStoreSelector(interactionStore, (s) => s.selectedObjectId);

  // Each entry is the *group* wrapping an object's visible mesh and its
  // (larger, invisible) raycasting hitbox — see HIT_RADIUS above. The
  // group is what gets damped toward studioTransforms' target each frame;
  // both children inherit its transform for free.
  const groupRefs = useRef(new Map<string, Object3D>());
  const raycaster = useRef(new Raycaster());
  const ndc = useRef(new Vector2());
  const dragPlane = useRef(new Plane());
  const grabOffset = useRef(new Vector3());
  const hitPoint = useRef(new Vector3());

  const dragObjectId = useRef<string | null>(null);
  const twoHandActive = useRef(false);
  const twoHandObjectId = useRef<string | null>(null);
  const twoHandBaseline = useRef<TwoHandBaseline | null>(null);

  useFrame((state, delta) => {
    const { primary, secondary } = studioEngine.latest;
    const camera = state.camera;
    const bothPinching = Boolean(primary?.pinching && secondary?.pinching);

    if (bothPinching && primary && secondary) {
      if (!twoHandActive.current) {
        // Rising edge into the two-hand gesture: only act on whatever is
        // already selected (select with one hand first, per the brief) —
        // if nothing's selected, two-hand pinching is a safe no-op.
        dragObjectId.current = null;
        if (selectedId) {
          const t = getStudioTransform(selectedId);
          if (t) {
            twoHandBaseline.current = {
              points: { ax: primary.x, ay: primary.y, bx: secondary.x, by: secondary.y },
              scale: t.scale,
              rotationY: t.rotationY,
            };
            twoHandObjectId.current = selectedId;
            twoHandActive.current = true;
          }
        }
      } else if (twoHandObjectId.current && twoHandBaseline.current) {
        const current: TwoHandPoints = { ax: primary.x, ay: primary.y, bx: secondary.x, by: secondary.y };
        const { scaleRatio, deltaAngleRad } = computeTwoHandDelta(twoHandBaseline.current.points, current);
        setStudioScale(twoHandObjectId.current, twoHandBaseline.current.scale * scaleRatio);
        setStudioRotationY(twoHandObjectId.current, twoHandBaseline.current.rotationY + deltaAngleRad);
      }
    } else {
      if (twoHandActive.current) {
        // Falling edge: stop updating. The transform is already wherever
        // it landed — nothing to "commit," this just stops tracking.
        twoHandActive.current = false;
        twoHandBaseline.current = null;
        twoHandObjectId.current = null;
      }

      if (primary) {
        ndc.current.set(primary.ndcX, primary.ndcY);
        raycaster.current.setFromCamera(ndc.current, camera);

        if (primary.pinching) {
          if (!dragObjectId.current) {
            const groups = [...groupRefs.current.values()];
            const hits = raycaster.current.intersectObjects(groups, true);
            const hit = hits[0];
            const id = hit ? resolveStudioId(hit.object) : undefined;
            if (hit && id) {
              setSelectedObjectId(id);
              const t = getStudioTransform(id);
              if (t) {
                const forward = new Vector3();
                camera.getWorldDirection(forward);
                dragPlane.current.setFromNormalAndCoplanarPoint(forward, new Vector3(t.x, t.y, t.z));
                grabOffset.current.set(t.x - hit.point.x, t.y - hit.point.y, t.z - hit.point.z);
                dragObjectId.current = id;
              }
            } else {
              setSelectedObjectId(null);
            }
          } else {
            const id = dragObjectId.current;
            if (raycaster.current.ray.intersectPlane(dragPlane.current, hitPoint.current)) {
              setStudioPosition(
                id,
                hitPoint.current.x + grabOffset.current.x,
                hitPoint.current.y + grabOffset.current.y,
                hitPoint.current.z + grabOffset.current.z,
              );
            }
          }
        } else {
          dragObjectId.current = null;
        }
      } else {
        // No tracked hand: freeze rather than carry a stale grab offset
        // into whatever the ray happens to hit once a hand reappears.
        dragObjectId.current = null;
      }
    }

    const lambda = appStore.get().settings.reduceMotion ? REDUCED_MOTION_LAMBDA : DAMP_LAMBDA;
    for (const [id, group] of groupRefs.current) {
      const target = getStudioTransform(id);
      if (!target) continue;
      group.position.x = MathUtils.damp(group.position.x, target.x, lambda, delta);
      group.position.y = MathUtils.damp(group.position.y, target.y, lambda, delta);
      group.position.z = MathUtils.damp(group.position.z, target.z, lambda, delta);
      group.rotation.y = MathUtils.damp(group.rotation.y, target.rotationY, lambda, delta);
      const scale = MathUtils.damp(group.scale.x, target.scale, lambda, delta);
      group.scale.setScalar(scale);
    }
  });

  const registerGroup = (id: string) => (object: Object3D | null) => {
    if (object) {
      object.userData.studioId = id;
      groupRefs.current.set(id, object);
    } else {
      groupRefs.current.delete(id);
    }
  };

  const handleClick = (id: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    setSelectedObjectId(id);
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <pointLight position={[0, 1.5, 0]} intensity={0.6} color="#5eead4" />

      <Grid
        position={[0, -1, 0]}
        args={[12, 12]}
        cellColor="#26314a"
        sectionColor="#3a4a6b"
        fadeDistance={16}
        infiniteGrid
      />

      {STUDIO_OBJECTS.map((spec) => {
        const isSelected = selectedId === spec.id;
        const highlight = isSelected ? 0.55 : 0;

        let visible: ReactNode;
        if (spec.type === 'cube') {
          visible = (
            <mesh>
              <boxGeometry args={[0.9, 0.9, 0.9]} />
              <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={highlight} />
            </mesh>
          );
        } else if (spec.type === 'sphere') {
          visible = (
            <mesh>
              <sphereGeometry args={[0.55, 32, 32]} />
              <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={highlight} />
            </mesh>
          );
        } else if (spec.type === 'torus') {
          visible = (
            <mesh>
              <torusGeometry args={[0.55, 0.2, 16, 48]} />
              <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={highlight} />
            </mesh>
          );
        } else {
          // centerpiece: a glowing wireframe icosahedron — visually
          // distinct from the three "regular" primitives on purpose.
          visible = (
            <mesh>
              <icosahedronGeometry args={[0.62, 1]} />
              <meshStandardMaterial
                color={spec.color}
                emissive={spec.color}
                emissiveIntensity={isSelected ? 1.4 : 0.9}
                wireframe
                transparent
                opacity={0.9}
              />
            </mesh>
          );
        }

        return (
          <group key={spec.id} ref={registerGroup(spec.id)} onClick={handleClick(spec.id)}>
            {visible}
            <mesh visible={false}>
              <sphereGeometry args={[HIT_RADIUS, HIT_SEGMENTS, HIT_SEGMENTS]} />
              <meshBasicMaterial />
            </mesh>
          </group>
        );
      })}

      <OrbitControls makeDefault enablePan={false} minDistance={3} maxDistance={12} maxPolarAngle={Math.PI / 2 - 0.05} />
    </>
  );
}
