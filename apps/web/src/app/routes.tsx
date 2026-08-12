import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './shell/AppShell';
import { MODULE_REGISTRY } from './moduleRegistry';

/**
 * Routing built directly from MODULE_REGISTRY — the single source of nav
 * truth described there. Adding a module means adding one entry to that
 * array; this file never needs to change.
 */
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      ...MODULE_REGISTRY.map((module) => ({
        path: module.path,
        Component: module.component,
      })),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
