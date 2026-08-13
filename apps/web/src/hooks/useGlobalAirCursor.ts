import { useLocation } from 'react-router-dom';
import { useVisionTask } from './useVisionTask';
import { useCursorEngine } from './useCursorEngine';
import { useStoreSelector } from './useStore';
import { appStore } from '@/state/appStore';

/**
 * Mounted once, at the app shell, so the Air Cursor pointer is a system
 * pointer rather than a per-page demo (see CLAUDE.md finding #1 — the
 * module's own copy says "try pinching on a nav link in the sidebar," but
 * before this hook the pointer unmounted the instant that pinch navigated
 * away). The hand task is acquired here whenever either is true:
 *   - the user is on /cursor itself (preserves the exact prior behavior
 *     for anyone who never touches the new setting), or
 *   - `settings.airCursorEverywhere` is on (Settings > Air Cursor).
 *
 * This only ever requests the *task* — it never starts the camera itself.
 * `CameraManager.start()` stays reachable only from a real click handler
 * (docs/ARCHITECTURE.md's camera-lifecycle rule), so turning this setting
 * on before the camera is running simply does nothing until the user
 * starts tracking from Home or Settings, same as visiting /cursor cold
 * always has.
 */
export function useGlobalAirCursor(): void {
  const location = useLocation();
  const airCursorEverywhere = useStoreSelector(appStore, (s) => s.settings.airCursorEverywhere);
  const wantHandTask = airCursorEverywhere || location.pathname === '/cursor';

  useVisionTask({ hand: wantHandTask, face: false, pose: false });
  useCursorEngine();
}
