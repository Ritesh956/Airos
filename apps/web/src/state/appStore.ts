import { createStore } from './createStore';

export type ModuleId =
  | 'home'
  | 'cursor'
  | 'lab'
  | 'studio'
  | 'draw'
  | 'present'
  | 'game'
  | 'analytics'
  | 'settings';

export type CameraState = 'off' | 'starting' | 'active' | 'stopping' | 'error';

export type CameraErrorReason =
  | 'permission-denied'
  | 'not-found'
  | 'in-use'
  | 'insecure-context'
  | 'unsupported'
  | 'model-load-failed'
  | 'unknown';

export type InputSourceKind = 'camera' | 'replay';

/** The "reach box": a region of the (mirrored-normalized) camera frame
 *  that maps to the full screen. Without this, the screen's corners would
 *  sit at the edge of the camera frame, where hand tracking is least
 *  reliable and the user's arm is fully extended — see IMPLEMENTATION.md
 *  §1.9. Coordinates are in the same mirrored-normalized [0,1] space the
 *  cursor visual is drawn in (see utils/coords.ts), not raw camera space. */
export interface ReachBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface AppSettings {
  /** One-Euro filter params for cursor smoothing. */
  cursorMinCutoff: number;
  cursorBeta: number;
  cursorReachBox: ReachBox;
  /** Consecutive frames a static gesture must hold before it's emitted. */
  gestureStabilityFrames: number;
  showSkeletonOverlay: boolean;
  showDebugOverlay: boolean;
  reduceMotion: boolean;
  voiceEnabled: boolean;
}

/** The default reach box: the center 60% x 60% of the frame. */
export const DEFAULT_REACH_BOX: ReachBox = { minX: 0.2, maxX: 0.8, minY: 0.2, maxY: 0.8 };

export const DEFAULT_SETTINGS: AppSettings = {
  cursorMinCutoff: 1.0,
  cursorBeta: 0.02,
  cursorReachBox: DEFAULT_REACH_BOX,
  gestureStabilityFrames: 3,
  showSkeletonOverlay: true,
  showDebugOverlay: false,
  reduceMotion: false,
  voiceEnabled: false,
};

export interface AppState {
  activeModule: ModuleId;
  cameraState: CameraState;
  cameraError: CameraErrorReason | null;
  inputSource: InputSourceKind;
  settings: AppSettings;
  commandPaletteOpen: boolean;
}

const SETTINGS_KEY = 'airos.settings.v1';

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const appStore = createStore<AppState>({
  activeModule: 'home',
  cameraState: 'off',
  cameraError: null,
  inputSource: 'camera',
  settings: loadSettings(),
  commandPaletteOpen: false,
});

export function setActiveModule(moduleId: ModuleId): void {
  appStore.update({ activeModule: moduleId });
}

export function setCameraState(state: CameraState, error: CameraErrorReason | null = null): void {
  appStore.update({ cameraState: state, cameraError: error });
}

export function setInputSource(kind: InputSourceKind): void {
  appStore.update({ inputSource: kind });
}

export function toggleCommandPalette(open?: boolean): void {
  appStore.update({
    commandPaletteOpen: open ?? !appStore.get().commandPaletteOpen,
  });
}

export function updateSettings(patch: Partial<AppSettings>): void {
  const next = { ...appStore.get().settings, ...patch };
  appStore.update({ settings: next });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }
}
