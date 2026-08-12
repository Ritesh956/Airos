import { useStoreSelector } from '@/hooks/useStore';
import { appStore, updateSettings } from '@/state/appStore';
import { Panel } from '@/ui/Panel';
import { Toggle } from '@/ui/Toggle';
import { StatusPill } from '@/ui/StatusPill';
import { Button } from '@/ui/Button';
import { useCamera } from '@/hooks/useCamera';

export default function SettingsModule() {
  const settings = useStoreSelector(appStore, (s) => s.settings);
  const { state, start, stop } = useCamera();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-medium text-ink-0">Settings</h1>
        <p className="mt-1 text-sm text-ink-2">
          Only settings that are actually wired up in this build are shown here. As later phases
          add cursor smoothing, gesture stability tuning, and voice control, their settings will
          appear in this panel — not before.
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
          <p>AIR OS — Phase 1: Architecture &amp; Camera.</p>
          <p className="text-ink-3">
            See IMPLEMENTATION.md in the project root for the full phase plan and architectural
            decisions.
          </p>
        </div>
      </Panel>
    </div>
  );
}
