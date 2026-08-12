import { lazy } from 'react';
import type { ComponentType, SVGProps } from 'react';
import type { ModuleId } from '@/state/appStore';
import {
  HomeIcon,
  CursorIcon,
  FlaskIcon,
  CubeIcon,
  PencilIcon,
  PresentIcon,
  GameIcon,
  AnalyticsIcon,
  SettingsIcon,
} from '@/ui/icons';

/**
 * The single source of nav truth (IMPLEMENTATION.md §"polished navigation
 * system"). Nav, routing, the command palette, and voice module-switching
 * all read this one array — a module added here is automatically
 * navigable, keyboard-reachable, and voice-reachable without touching any
 * of those four call sites individually.
 */
export interface ModuleDescriptor {
  id: ModuleId;
  path: string;
  label: string;
  tagline: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Single-key shortcut, matched by useGlobalKeyboardCommands. */
  shortcut: string;
  /** Phase this module ships in, per IMPLEMENTATION.md §11. */
  phase: number;
  status: 'ready' | 'planned';
  component: ComponentType;
}

export const MODULE_REGISTRY: ModuleDescriptor[] = [
  {
    id: 'home',
    path: '/',
    label: 'Home',
    tagline: 'System overview and quick launch',
    icon: HomeIcon,
    shortcut: '1',
    phase: 1,
    status: 'ready',
    component: lazy(() => import('@/modules/home/HomeModule')),
  },
  {
    id: 'cursor',
    path: '/cursor',
    label: 'Air Cursor',
    tagline: 'Index finger as a pointing device',
    icon: CursorIcon,
    shortcut: '2',
    phase: 4,
    status: 'ready',
    component: lazy(() => import('@/modules/cursor/CursorModule')),
  },
  {
    id: 'lab',
    path: '/lab',
    label: 'Gesture Lab',
    tagline: 'Live landmarks, gesture timeline, FPS',
    icon: FlaskIcon,
    shortcut: '3',
    phase: 5,
    status: 'ready',
    component: lazy(() => import('@/modules/lab/LabModule')),
  },
  {
    id: 'studio',
    path: '/studio',
    label: '3D Studio',
    tagline: 'Manipulate 3D objects with gestures',
    icon: CubeIcon,
    shortcut: '4',
    phase: 6,
    status: 'ready',
    component: lazy(() => import('@/modules/studio/StudioModule')),
  },
  {
    id: 'draw',
    path: '/draw',
    label: 'Air Draw',
    tagline: 'Draw in the air with your fingertip',
    icon: PencilIcon,
    shortcut: '5',
    phase: 7,
    status: 'ready',
    component: lazy(() => import('@/modules/draw/DrawModule')),
  },
  {
    id: 'present',
    path: '/present',
    label: 'Presentation',
    tagline: 'Swipe through slides hands-free',
    icon: PresentIcon,
    shortcut: '6',
    phase: 8,
    status: 'ready',
    component: lazy(() => import('@/modules/present/PresentModule')),
  },
  {
    id: 'game',
    path: '/game',
    label: 'Game Mode',
    tagline: 'A gesture-controlled arcade game',
    icon: GameIcon,
    shortcut: '7',
    phase: 12,
    status: 'planned',
    component: lazy(() => import('@/modules/game/GameModule')),
  },
  {
    id: 'analytics',
    path: '/analytics',
    label: 'Analytics',
    tagline: 'Real performance and usage metrics',
    icon: AnalyticsIcon,
    shortcut: '8',
    phase: 13,
    status: 'planned',
    component: lazy(() => import('@/modules/analytics/AnalyticsModule')),
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    tagline: 'Tracking, calibration, and privacy',
    icon: SettingsIcon,
    shortcut: '9',
    phase: 1,
    status: 'ready',
    component: lazy(() => import('@/modules/settings/SettingsModule')),
  },
];

export function getModuleById(id: ModuleId): ModuleDescriptor {
  const found = MODULE_REGISTRY.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown module id: ${id}`);
  return found;
}
