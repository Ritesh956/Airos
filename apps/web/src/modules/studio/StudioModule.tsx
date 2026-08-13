import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { CameraStage } from '@/modules/shared/CameraStage';
import { StudioScene } from './StudioScene';
import { useStudioEngine } from '@/hooks/useStudioEngine';
import { useStudioKeyboardCommands } from './useStudioKeyboardCommands';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useStoreSelector } from '@/hooks/useStore';
import { interactionStore, setSelectedObjectId } from '@/state/interactionStore';
import { getAllStudioTransforms, initStudioTransforms } from './studioTransforms';
import { getStudioObjectSpec } from './studioObjects';
import { Panel } from '@/ui/Panel';
import { Readout } from '@/ui/Readout';
import { Button } from '@/ui/Button';

const HAND_TASK = { hand: true, face: false, pose: false };

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-0">
      {children}
    </kbd>
  );
}

/**
 * A Three.js scene manipulated with real gestures: pinch to select and
 * drag, bring in a second hand while pinching to scale and rotate — plus
 * full mouse/keyboard parity (IMPLEMENTATION.md §1.6), since Demo Mode's
 * single synthetic hand can select but can't demonstrate the two-hand
 * gesture (see CLAUDE.md's Phase 6 write-up for why, and why that's an
 * honest limitation rather than something to paper over).
 */
export default function StudioModule() {
  useVisionTask(HAND_TASK);
  useStudioEngine();
  useStudioKeyboardCommands();

  // Object transforms live in a module-level singleton (studioTransforms),
  // not React state — initialize once per app session, not on every
  // remount, so navigating away and back preserves whatever arrangement
  // the user built rather than resetting it as a surprise.
  useEffect(() => {
    if (getAllStudioTransforms().size === 0) initStudioTransforms();
  }, []);

  const selectedId = useStoreSelector(interactionStore, (s) => s.selectedObjectId);
  const selectedSpec = selectedId ? getStudioObjectSpec(selectedId) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-slow" />
          Pinch to grab · two hands to scale and rotate
        </div>
        <h1 className="mt-3 text-2xl font-medium text-ink-0">3D Studio</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-2">
          Pinch to select and drag an object; bring in a second hand while pinching to scale and
          rotate it. No camera handy? Click with a mouse or use the keyboard — same object, same
          controls.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="flex flex-col gap-5">
          <CameraStage demoDescription="Explore 3D Studio with a synthetic recorded hand — no camera access needed." />

          <Panel eyebrow="Selection" title="Selected Object">
            <Readout label="Object" value={selectedSpec ? selectedSpec.label : 'None'} method="DERIVED" />
            {selectedId && (
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => setSelectedObjectId(null)}>
                Deselect
              </Button>
            )}
          </Panel>

          <Panel eyebrow="Controls" title="Keyboard & Mouse">
            <ul className="flex flex-col gap-2 text-xs text-ink-2">
              <li className="flex items-center gap-2">
                <Key>Click</Key> select an object
              </li>
              <li className="flex items-center gap-2">
                <Key>[</Key> <Key>]</Key> cycle selection
              </li>
              <li className="flex items-center gap-2">
                <Key>↑</Key> <Key>↓</Key> <Key>←</Key> <Key>→</Key> move selected object
              </li>
              <li className="flex items-center gap-2">
                <Key>+</Key> <Key>-</Key> scale selected object
              </li>
              <li className="flex items-center gap-2">
                <Key>Q</Key> <Key>E</Key> rotate selected object
              </li>
              <li className="flex items-center gap-2">
                <Key>Esc</Key> deselect
              </li>
              <li>Drag with the mouse to orbit the camera.</li>
            </ul>
          </Panel>
        </div>

        <Panel eyebrow="Scene" title="Viewport" padded={false} className="overflow-hidden">
          <div style={{ height: 560 }}>
            <Canvas camera={{ position: [0, 2.2, 6], fov: 45 }} dpr={[1, 2]}>
              <StudioScene />
            </Canvas>
          </div>
        </Panel>
      </section>
    </div>
  );
}
