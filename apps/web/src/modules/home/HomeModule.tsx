import { MODULE_REGISTRY } from '@/app/moduleRegistry';
import { ModuleCard } from '@/ui/ModuleCard';
import { CameraControlPanel } from './CameraControlPanel';
import { BrowserSupportPanel } from './BrowserSupportPanel';

export default function HomeModule() {
  const otherModules = MODULE_REGISTRY.filter((m) => m.id !== 'home');

  return (
    <div className="flex flex-col gap-10">
      <section className="pt-6 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-slow" />
          Phase 1 — Architecture &amp; Camera
        </div>
        <h1 className="mt-4 text-4xl font-medium tracking-tight text-ink-0 sm:text-5xl">
          AIR&nbsp;OS
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-ink-2 sm:text-base">
          Interact with your computer without touching it.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <CameraControlPanel />
        <BrowserSupportPanel />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-ink-0">Modules</h2>
          <span className="text-xs text-ink-3">Press a shortcut key, or click through</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {otherModules.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      </section>
    </div>
  );
}
