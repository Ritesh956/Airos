import { useEffect } from 'react';
import { degradationController } from '@/vision/perf/DegradationController';

/**
 * Starts the performance degradation ladder (IMPLEMENTATION.md §9) once,
 * for the app's lifetime — mounted from AppShell alongside
 * useVoiceCommands/useNavigationCommands, the same "one always-on hook per
 * cross-cutting concern" pattern those use. `degradationController.start()`
 * is idempotent, so this is safe even if AppShell ever remounts.
 */
export function usePerfDegradation(): void {
  useEffect(() => {
    degradationController.start();
  }, []);
}
