import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, toggleCommandPalette } from '@/state/appStore';
import { cn } from '@/utils/cn';

const LISTBOX_ID = 'command-palette-listbox';
const optionId = (commandId: string) => `command-palette-option-${commandId}`;

/** Every element type a keyboard user could plausibly reach inside the
 *  dialog — used only to implement the Tab-wrapping focus trap below, not
 *  a general-purpose focusable-element query. */
const FOCUSABLE_SELECTOR = 'input, button, [href], [tabindex]:not([tabindex="-1"])';

/**
 * The text/keyboard face of the Command Router (IMPLEMENTATION.md §8).
 * Everything this dispatches also works from a gesture or a voice utterance
 * once those land in later phases — none of it is special-cased here.
 *
 * A real modal dialog, not just a styled `<div>`: `role="dialog"` +
 * `aria-modal="true"` so assistive tech announces it as one, a Tab-wrapping
 * focus trap so keyboard focus can't silently land on `Nav`/`StatusBar`
 * elements still present behind the backdrop, and focus returned to
 * whatever opened it on close — the standard modal-dialog contract, added
 * in Phase 14's accessibility pass (this file predates it and had none of
 * this).
 */
export function CommandPalette() {
  const open = useStoreSelector(appStore, (s) => s.commandPaletteOpen);
  const commands = useSyncExternalStore(commandRouter.subscribe, () => commandRouter.list());
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const filtered = commands.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.title.toLowerCase().includes(q) || c.phrases.some((p) => p.includes(q));
  });

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setHighlighted(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toggleCommandPalette(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        const command = filtered[highlighted];
        if (command) {
          command.run();
          toggleCommandPalette(false);
        }
      } else if (e.key === 'Tab') {
        // Focus trap: wrap Tab/Shift+Tab within the dialog instead of
        // letting it escape to whatever's behind the backdrop.
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, highlighted]);

  if (!open) return null;

  const activeOption = filtered[highlighted];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-surface-0/70 pt-[15vh] backdrop-blur-sm"
      onClick={() => toggleCommandPalette(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="glass-panel w-full max-w-lg overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          placeholder="Type a command…"
          role="combobox"
          aria-expanded={filtered.length > 0}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? optionId(activeOption.id) : undefined}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-ink-0 outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal-400/50"
        />
        <div id={LISTBOX_ID} role="listbox" aria-label="Commands" className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-ink-3">No matching commands.</div>
          )}
          {filtered.map((command, i) => (
            <button
              key={command.id}
              id={optionId(command.id)}
              role="option"
              aria-selected={i === highlighted}
              onClick={() => {
                command.run();
                toggleCommandPalette(false);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                i === highlighted ? 'bg-surface-3 text-ink-0' : 'text-ink-2',
              )}
            >
              <span>{command.title}</span>
              {command.keys && (
                <kbd className="rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                  {command.keys[0]}
                </kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
