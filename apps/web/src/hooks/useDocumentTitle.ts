import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MODULE_REGISTRY } from '@/app/moduleRegistry';

const BASE_TITLE = 'AIR OS';

/**
 * Every route reported the same `<title>` (CLAUDE.md finding #6) — dead
 * weight for browser history/tab-switching, and a screen reader gets no
 * signal that navigation happened at all, since `MODULE_REGISTRY` already
 * has a per-route label sitting right there unused. Derives the title from
 * the same single source of truth the nav/router/command palette read.
 */
export function useDocumentTitle(): void {
  const location = useLocation();

  useEffect(() => {
    const current = MODULE_REGISTRY.find((m) => m.path === location.pathname);
    document.title = current && current.id !== 'home' ? `${current.label} — ${BASE_TITLE}` : `${BASE_TITLE} — Interact without touching`;
  }, [location.pathname]);
}
