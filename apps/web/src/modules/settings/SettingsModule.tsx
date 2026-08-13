import { useMemo } from 'react';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, updateSettings } from '@/state/appStore';
import { Panel } from '@/ui/Panel';
import { Toggle } from '@/ui/Toggle';
import { StatusPill } from '@/ui/StatusPill';
import { Readout } from '@/ui/Readout';
import { Button } from '@/ui/Button';
import { Slider } from '@/ui/Slider';
import { useCamera } from '@/hooks/useCamera';
import { checkBrowserSupport } from '@/utils/browserSupport';
import { VOICE_ERROR_MESSAGES } from '@/interaction/voice/errors';
import { BUILD_STATUS_SUMMARY } from '@/app/buildStatus';

const VOICE_STATUS_LABEL: Record<'off' | 'listening' | 'error', string> = {
  off: 'Off',
  listening: 'Listening',
  error: 'Error',
};

export default function SettingsModule() {
  const settings = useStoreSelector(appStore, (s) => s.settings);
  const voiceState = useStoreSelector(appStore, (s) => s.voiceState);
  const voiceError = useStoreSelector(appStore, (s) => s.voiceError);
  const lastVoiceTranscript = useStoreSelector(appStore, (s) => s.lastVoiceTranscript);
  const lastVoiceCommandTitle = useStoreSelector(appStore, (s) => s.lastVoiceCommandTitle);
  const voiceSupported = useMemo(() => checkBrowserSupport().speechRecognition, []);
  const { state, start, stop } = useCamera();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-medium text-ink-0">Settings</h1>
        <p className="mt-1 text-sm text-ink-2">
          Only settings that are actually wired up in this build are shown here. Cursor smoothing
          lives inside Air Cursor itself, next to the readouts it affects — this panel covers
          cross-cutting, app-wide settings only.
        </p>
      </div>

      <Panel eyebrow="Privacy" title="Camera data handling">
        <p className="text-sm leading-relaxed text-ink-2">
          Camera processing happens locally in your browser. Video frames are never uploaded,
          recorded, or transmitted to any server. The backend used by AIR OS never receives an
          image or a camera frame — only, in future multiplayer scenarios, small classified
          gesture events (a name and a confidence number).
        </p>
      </Panel>

      <Panel eyebrow="Tracking Source" title="Camera" action={<StatusPill state={state} />}>
        <p className="text-sm text-ink-2">
          Camera access is requested only when you start it here or on the Home screen — never
          automatically on page load.
        </p>
        <div className="mt-3">
          {state === 'active' || state === 'starting' ? (
            <Button variant="secondary" onClick={stop}>
              Stop Camera
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void start()}>
              Start Camera
            </Button>
          )}
        </div>
      </Panel>

      <Panel eyebrow="Gesture Recognition" title="Stability window">
        <Slider
          label="Frames to confirm a gesture"
          description="How many consecutive frames a pose must hold before it's reported — higher resists flicker near a decision boundary but adds lag; lower reacts faster but can misfire. Applies to every module (Cursor, Draw, Studio, Game, Presentation), not just one — see IMPLEMENTATION.md §7."
          value={settings.gestureStabilityFrames}
          min={1}
          max={8}
          step={1}
          formatValue={(v) => `${v} frame${v === 1 ? '' : 's'}`}
          onChange={(v) => updateSettings({ gestureStabilityFrames: v })}
        />
      </Panel>

      <Panel eyebrow="Air Cursor" title="System-wide pointer">
        <Toggle
          checked={settings.airCursorEverywhere}
          onChange={(airCursorEverywhere) => updateSettings({ airCursorEverywhere })}
          label="Air Cursor everywhere"
          description="Keep the pointer live on every page, not just Air Cursor's own — point and pinch to click or drag anywhere in AIR OS, including the sidebar nav. Still needs the camera (or Demo Mode) started first."
        />
      </Panel>

      <Panel eyebrow="Voice" title="Voice control">
        {!voiceSupported ? (
          <p className="text-sm leading-relaxed text-ink-2">{VOICE_ERROR_MESSAGES.unsupported}</p>
        ) : (
          <>
            <Toggle
              checked={settings.voiceEnabled}
              onChange={(voiceEnabled) => updateSettings({ voiceEnabled })}
              label="Voice control"
              description="Say a command's name — 'open 3d studio', 'start camera' — to trigger it through the same Command Router keyboard and gestures use. Requires microphone access."
            />
            {settings.voiceEnabled && (
              <div className="mt-3 border-t border-border pt-3">
                <Readout label="Status" value={VOICE_STATUS_LABEL[voiceState]} method="DERIVED" />
                {voiceState === 'error' && voiceError && (
                  <p role="alert" className="mt-1 text-xs text-danger-500">{VOICE_ERROR_MESSAGES[voiceError]}</p>
                )}
                <Readout label="Last heard" value={lastVoiceTranscript ?? '—'} method="MODEL" />
                <Readout
                  label="Matched command"
                  value={lastVoiceCommandTitle ?? (lastVoiceTranscript ? 'No match' : '—')}
                  method="HEURISTIC"
                />
              </div>
            )}
          </>
        )}
      </Panel>

      <Panel eyebrow="Accessibility" title="Motion">
        <Toggle
          checked={settings.reduceMotion}
          onChange={(reduceMotion) => updateSettings({ reduceMotion })}
          label="Reduce motion"
          description="Disables page-transition and ambient animation throughout the shell."
        />
      </Panel>

      <Panel eyebrow="About" title="Build">
        <div className="space-y-1 text-sm text-ink-2">
          <p>AIR OS — {BUILD_STATUS_SUMMARY}</p>
          <p className="text-ink-3">
            See IMPLEMENTATION.md in the project root for the full phase plan and architectural
            decisions.
          </p>
        </div>
      </Panel>
    </div>
  );
}
