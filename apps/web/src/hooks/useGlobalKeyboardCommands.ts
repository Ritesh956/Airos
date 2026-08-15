import { useEffect } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

/** True while any modal dialog (Command Palette, Presentation's gesture
 *  legend, Air Cursor's calibration overlay) is open. Every one of them
 *  renders through `useModalDialog`'s shared `role="dialog"
 *  aria-modal="true"` contract, so checking for that pair once here covers
 *  all of them without this hook needing to know each dialog by name.
 *  Without this, single-key module shortcuts stayed live underneath an
 *  open dialog and could navigate the page out from under it — e.g.
 *  pressing "4" while the gesture legend was open jumped to 3D Studio with
 *  the legend still (visually) open behind it (CLAUDE.md UI/UX audit
 *  finding #03). The Command Palette itself is unaffected either way,
 *  since its first focusable descendant is a text `<input>`, which
 *  `isEditableTarget` already excludes. */
function isModalDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * Mounted once at the app shell. Matches a single keydown against every
 * registered command's `keys` (single-key bindings only — e.g. a module's
 * shortcut is one key, not a chord). This is the keyboard half of §1.6:
 * every gesture-driven action has a keyboard equivalent, and both paths
 * dispatch through the same CommandRouter so neither is a special case.
 *
 * Letter keys are matched case-insensitively — `event.key` reflects
 * whatever Caps Lock or Shift produced (`'Z'` rather than `'z'`), so a
 * binding declared as `['z']` silently stopped matching with Caps Lock on
 * (CLAUDE.md UI/UX audit finding #27). Non-letter keys (`'ArrowLeft'`,
 * `'Escape'`, `'['`) are unaffected by Caps Lock and compare unchanged.
 */
export function useGlobalKeyboardCommands(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isModalDialogOpen()) return;

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      for (const command of commandRouter.list()) {
        if (command.keys?.some((k) => (k.length === 1 ? k.toLowerCase() : k) === key)) {
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
