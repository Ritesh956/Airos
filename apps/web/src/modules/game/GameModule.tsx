import { CameraStage } from '@/modules/shared/CameraStage';
import { GameCanvas } from './GameCanvas';
import { useGameEngine } from '@/hooks/useGameEngine';
import { useGameGestureCommands } from './useGameGestureCommands';
import { useGameKeyboardCommands } from './useGameKeyboardCommands';
import { useVisionTask } from '@/hooks/useVisionTask';
import { useStore } from '@/hooks/useStore';
import { gameStore } from './gameStore';
import { pause, restart, startOrResume } from './gameState';
import { Panel } from '@/ui/Panel';
import { Readout } from '@/ui/Readout';
import { Button } from '@/ui/Button';

const HAND_TASK = { hand: true, face: false, pose: false };

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ready',
  playing: 'Playing',
  paused: 'Paused',
  gameover: 'Game Over',
};

/**
 * A small vertical shooter proving the tracking pipeline is fast and
 * precise enough to actually play with: point to steer the ship, pinch to
 * fire, hold an open palm to raise a shield. `GameEngine` only reports a
 * filtered fingertip pointer + raw gesture (see its doc comment); turning
 * that into gameplay lives in `GameCanvas.tsx` and `gameState.ts` — this
 * component just composes the camera stage, the canvas, and a HUD that
 * reads `gameStore`'s cold-path summary, the same shape `DrawModule.tsx`
 * uses for Air Draw.
 */
export default function GameModule() {
  useVisionTask(HAND_TASK);
  useGameEngine();
  useGameGestureCommands();
  useGameKeyboardCommands();

  const game = useStore(gameStore);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-slow" />
          Phase 12 — Game Mode
        </div>
        <h1 className="mt-3 text-2xl font-medium text-ink-0">Game Mode</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-2">
          Point to steer, pinch to fire, hold an open palm to shield. No camera handy? Mouse and
          keyboard play identically — steer with the pointer or arrow keys, click or Space to
          fire, hold Shift to shield.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="flex flex-col gap-5">
          <CameraStage demoDescription="Try Game Mode with a synthetic recorded hand — no camera access needed." />

          <Panel eyebrow="Game" title="Live State">
            <Readout label="Status" value={STATUS_LABEL[game.status] ?? game.status} method="DERIVED" />
            <Readout label="Score" value={game.score} method="DERIVED" />
            <Readout label="Lives" value={game.lives} method="DERIVED" />
            <Readout label="Best" value={game.highScore} method="DERIVED" />
          </Panel>

          <Panel eyebrow="Controls" title="Gesture &amp; Keyboard">
            <ul className="space-y-2 text-sm text-ink-1">
              <li className="flex items-center justify-between">
                <span>Steer the ship</span>
                <span className="text-ink-3">Point / mouse / ←→</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Fire</span>
                <span className="text-ink-3">Pinch / click / Space</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Shield</span>
                <span className="text-ink-3">Open palm / Shift</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Start / Resume</span>
                <span className="text-ink-3">Thumbs up / S</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Pause</span>
                <span className="text-ink-3">Fist / P</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Restart</span>
                <span className="text-ink-3">R</span>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={startOrResume}>
                {game.status === 'paused' ? 'Resume' : game.status === 'gameover' ? 'Play Again' : 'Start'}
              </Button>
              <Button variant="secondary" size="sm" onClick={pause} disabled={game.status !== 'playing'}>
                Pause
              </Button>
              <Button variant="secondary" size="sm" onClick={restart} disabled={game.status === 'idle'}>
                Restart
              </Button>
            </div>
          </Panel>
        </div>

        <Panel eyebrow="Arena" title="Game Mode" padded={false} className="overflow-hidden">
          <div className="relative" style={{ height: 560 }}>
            <GameCanvas />
            {game.status !== 'playing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-0/70 text-center backdrop-blur-sm">
                {game.status === 'gameover' ? (
                  <>
                    <div className="text-lg font-medium text-ink-0">Game Over</div>
                    <div className="text-sm text-ink-2">
                      Score {game.score}
                      {game.score >= game.highScore && game.score > 0 ? ' — new best!' : ` · Best ${game.highScore}`}
                    </div>
                  </>
                ) : game.status === 'paused' ? (
                  <div className="text-lg font-medium text-ink-0">Paused</div>
                ) : (
                  <div className="text-lg font-medium text-ink-0">Point, pinch, and shoot</div>
                )}
                <Button variant="primary" onClick={startOrResume}>
                  {game.status === 'paused' ? 'Resume' : game.status === 'gameover' ? 'Play Again' : 'Start Game'}
                </Button>
              </div>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}
