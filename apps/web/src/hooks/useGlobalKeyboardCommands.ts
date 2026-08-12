import { useEffect } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

/**
 * Mounted once at the app shell. Matches a single keydown against every
 * registered command's `keys` (single-key bindings only — e.g. a module's
 * shortcut is one key, not a chord). This is the keyboard half of §1.6:
 * every gesture-driven action has a keyboard equivalent, and both paths
 * dispatch through the same CommandRouter so neither is a special case.
 */
export function useGlobalKeyboardCommands(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      for (const command of commandRouter.list()) {
        if (command.keys?.includes(event.key)) {
          event.preventDefault();
          command.run();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
