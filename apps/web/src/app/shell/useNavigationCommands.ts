import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MODULE_REGISTRY } from '@/app/moduleRegistry';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { toggleCommandPalette } from '@/state/appStore';

/**
 * Registers one navigation command per module, generated from the module
 * registry rather than hand-written per module (IMPLEMENTATION.md §8: "no
 * component hard-codes a voice string"). Also registers the command
 * palette's own open/close shortcut through the same router, so it isn't a
 * special case either.
 */
export function useNavigationCommands(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const unregisters = MODULE_REGISTRY.map((module) =>
      commandRouter.register({
        id: `nav.${module.id}`,
        title: `Open ${module.label}`,
        phrases: [`open ${module.label.toLowerCase()}`, `go to ${module.label.toLowerCase()}`],
        keys: [module.shortcut],
        category: 'Navigation',
        run: () => navigate(module.path),
      }),
    );

    unregisters.push(
      commandRouter.register({
        id: 'palette.open',
        title: 'Open Command Palette',
        phrases: ['open command palette', 'show commands'],
        keys: ['/'],
        category: 'System',
        run: () => toggleCommandPalette(true),
      }),
    );

    return () => unregisters.forEach((fn) => fn());
  }, [navigate]);
}
