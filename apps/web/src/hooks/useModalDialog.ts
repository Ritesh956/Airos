import { useEffect, useRef, type RefObject } from 'react';

/** Every element type a keyboard user could plausibly Tab to inside a
 *  dialog. Excludes `[tabindex="-1"]` throughout so a "last focusable
 *  element" computed here always agrees with what Tab can actually reach —
 *  see CommandPalette's option buttons for why that distinction matters. */
const FOCUSABLE_SELECTOR =
  'input:not([tabindex="-1"]), button:not([tabindex="-1"]), [href]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

interface UseModalDialogOptions {
  open: boolean;
  onClose: () => void;
  /** Focused once the dialog opens. Defaults to the first focusable
   *  descendant of the returned `dialogRef`. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Focus is returned here on close instead of to `document.activeElement`
   *  at open time — needed when the trigger might not have real DOM focus
   *  when clicked (e.g. Safari/Firefox's default "don't focus a button on
   *  mouse click" behavior), which `document.activeElement` alone can't
   *  recover from. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * The standard modal-dialog contract — Tab-wrapping focus trap, Escape to
 * close, focus moved in on open and returned to the trigger on close, and
 * the page behind it locked from scrolling — extracted after CLAUDE.md's
 * UI/UX audit (finding #26) found it implemented three separate times with
 * three different subsets of this behavior: `CommandPalette` had the trap
 * and restore-focus but never locked scroll; `SlideStage`'s gesture legend
 * had Escape and restore-focus but no trap; `CalibrationFlow` had neither
 * restore-focus nor a scroll lock. One hook, one contract, three call sites.
 *
 * Deliberately narrow: it owns only what every dialog in this app needs
 * identically. A caller with its own extra keyboard behavior (the command
 * palette's ArrowUp/ArrowDown/Enter over its result list) still wires that
 * up itself, in its own effect — this hook doesn't try to be a generic
 * keyboard-router.
 */
export function useModalDialog<T extends HTMLElement>({
  open,
  onClose,
  initialFocusRef,
  restoreFocusRef,
}: UseModalDialogOptions): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Captured now, not read from the ref at cleanup time: `restoreFocusRef`
    // points at a caller-owned element (e.g. SlideStage's legend-trigger
    // Button) that could in principle be reassigned or unmounted by the
    // time this cleanup runs, same reasoning as every other "ref accessed
    // in a cleanup" case react-hooks/exhaustive-deps flags.
    const elementToRestore = restoreFocusRef?.current ?? null;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focused synchronously in the effect, not deferred to a
    // requestAnimationFrame callback. The deferral had no real layout
    // reason — the dialog's already in the DOM by the time this effect
    // runs — and it meant focus depended on rAF actually firing at all: if
    // a dialog opens while the tab is backgrounded or otherwise not
    // compositing frames, rAF never runs, so focus never enters and the
    // trap below has nothing to trap (CLAUDE.md UI/UX audit finding #29).
    const target = initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    target?.focus();

    return () => {
      document.body.style.overflow = originalOverflow;
      (elementToRestore ?? previouslyFocused.current)?.focus();
      previouslyFocused.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return dialogRef;
}
