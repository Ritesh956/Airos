import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Nav } from './Nav';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import { useNavigationCommands } from './useNavigationCommands';
import { useGlobalKeyboardCommands } from '@/hooks/useGlobalKeyboardCommands';
import { useVoiceCommands } from '@/hooks/useVoiceCommands';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePerfDegradation } from '@/hooks/usePerfDegradation';
import { DegradationBanner } from './DegradationBanner';

function ModuleFallback() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-ink-3">
      Loading module…
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  useNavigationCommands();
  useGlobalKeyboardCommands();
  useVoiceCommands();
  usePerfDegradation();

  // Mirrors the combined OS-preference-or-Settings-toggle value onto
  // <html> so plain CSS keyframe animations (index.css's
  // animate-pulse-slow/animate-scan) can respect the in-app toggle too,
  // not just prefers-reduced-motion — the same "either source disables
  // it" contract useReducedMotion() already documents for the
  // framer-motion/Studio-damping consumers of this hook.
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-0 text-ink-0">
      <Nav />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar />
        <DegradationBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-6 py-8">
            <Suspense fallback={<ModuleFallback />}>
              {reduceMotion ? (
                <Outlet />
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    <Outlet />
                  </motion.div>
                </AnimatePresence>
              )}
            </Suspense>
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
