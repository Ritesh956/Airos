import { useEffect } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { interactionStore, setSelectedObjectId } from '@/state/interactionStore';
import { STUDIO_OBJECTS } from './studioObjects';
import { nudgeStudioPosition, nudgeStudioRotationY, nudgeStudioScale } from './studioTransforms';

const POSITION_STEP = 0.2;
const ROTATION_STEP = Math.PI / 12; // 15 degrees
const SCALE_STEP_FACTOR = 1.1;

function cycleSelection(direction: 1 | -1): void {
  const ids = STUDIO_OBJECTS.map((o) => o.id);
  const current = interactionStore.get().selectedObjectId;
  const index = current ? ids.indexOf(current) : -1;
  const nextIndex = index === -1 ? 0 : (index + direction + ids.length) % ids.length;
  setSelectedObjectId(ids[nextIndex]!);
}

function withSelected(fn: (id: string) => void): () => void {
  return () => {
    const id = interactionStore.get().selectedObjectId;
    if (id) fn(id);
  };
}

/**
 * The keyboard half of Phase 6's gesture-driven manipulation, per
 * IMPLEMENTATION.md §1.6: every gesture-driven action gets a keyboard
 * equivalent, both because it's an accessibility requirement and because
 * it's the way this module stays demoable without a camera or two hands
 * (the gesture path's two-hand scale/rotate has no camera-only Demo Mode
 * story — see CLAUDE.md's Phase 6 write-up).
 *
 * True parity, not a lesser stand-in: keyboard commands mutate the exact
 * same `studioTransforms` map StudioScene's gesture loop damps toward, so
 * a keyboard nudge eases in smoothly too, and translate is deliberately
 * XY-only (arrows), matching the gesture path's own fixed-depth drag
 * plane — same degrees of freedom either way.
 */
export function useStudioKeyboardCommands(): void {
  useEffect(() => {
    const unregisters = [
      commandRouter.register({
        id: 'studio.select-next',
        title: 'Select Next Object',
        phrases: ['select next object', 'next object'],
        keys: [']'],
        category: '3D Studio',
        run: () => cycleSelection(1),
      }),
      commandRouter.register({
        id: 'studio.select-prev',
        title: 'Select Previous Object',
        phrases: ['select previous object', 'previous object'],
        keys: ['['],
        category: '3D Studio',
        run: () => cycleSelection(-1),
      }),
      commandRouter.register({
        id: 'studio.deselect',
        title: 'Deselect',
        phrases: ['deselect'],
        keys: ['Escape'],
        category: '3D Studio',
        run: () => setSelectedObjectId(null),
      }),
      commandRouter.register({
        id: 'studio.move-left',
        title: 'Move Selected Object Left',
        phrases: ['move left'],
        keys: ['ArrowLeft'],
        category: '3D Studio',
        run: withSelected((id) => nudgeStudioPosition(id, -POSITION_STEP, 0)),
      }),
      commandRouter.register({
        id: 'studio.move-right',
        title: 'Move Selected Object Right',
        phrases: ['move right'],
        keys: ['ArrowRight'],
        category: '3D Studio',
        run: withSelected((id) => nudgeStudioPosition(id, POSITION_STEP, 0)),
      }),
      commandRouter.register({
        id: 'studio.move-up',
        title: 'Move Selected Object Up',
        phrases: ['move up'],
        keys: ['ArrowUp'],
        category: '3D Studio',
        run: withSelected((id) => nudgeStudioPosition(id, 0, POSITION_STEP)),
      }),
      commandRouter.register({
        id: 'studio.move-down',
        title: 'Move Selected Object Down',
        phrases: ['move down'],
        keys: ['ArrowDown'],
        category: '3D Studio',
        run: withSelected((id) => nudgeStudioPosition(id, 0, -POSITION_STEP)),
      }),
      commandRouter.register({
        id: 'studio.scale-up',
        title: 'Scale Selected Object Up',
        phrases: ['scale up', 'make bigger'],
        keys: ['=', '+'],
        category: '3D Studio',
        run: withSelected((id) => nudgeStudioScale(id, SCALE_STEP_FACTOR)),
      }),
      commandRouter.register({
        id: 'studio.scale-down',
        title: 'Scale Selected Object Down',
        phrases: ['scale down', 'make smaller'],
        keys: ['-', '_'],
        category: '3D Studio',
        run: withSelected((id) => nudgeStudioScale(id, 1 / SCALE_STEP_FACTOR)),
      }),
      commandRouter.register({
        id: 'studio.rotate-left',
        title: 'Rotate Selected Object Left',
        phrases: ['rotate left'],
        keys: ['q'],
        category: '3D Studio',
        run: withSelected((id) => nudgeStudioRotationY(id, -ROTATION_STEP)),
      }),
      commandRouter.register({
        id: 'studio.rotate-right',
        title: 'Rotate Selected Object Right',
        phrases: ['rotate right'],
        keys: ['e'],
        category: '3D Studio',
        run: withSelected((id) => nudgeStudioRotationY(id, ROTATION_STEP)),
      }),
    ];

    return () => unregisters.forEach((fn) => fn());
  }, []);
}
