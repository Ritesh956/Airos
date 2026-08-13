import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { useStoreSelector } from '@/hooks/useStore';
import { useModalDialog } from '@/hooks/useModalDialog';
import { appStore, toggleCommandPalette } from '@/state/appStore';
import { cn } from '@/utils/cn';

const LISTBOX_ID = 'command-palette-listbox';
const optionId = (commandId: string) => `command-palette-option-${commandId}`;

/**
 * The text/keyboard face of the Command Router (IMPLEMENTATION.md §8).
 * Everything this dispatches also works from a gesture or a voice utterance
 * once those land in later phases — none of it is special-cased here.
 *
 * A real modal dialog, not just a styled `<div>`: `role="dialog"` +
 * `aria-modal="true"` so assistive tech announces it as one, the standard
 * trap/Escape/restore-focus/scroll-lock contract via `useModalDialog`
 * (shared with `SlideStage`'s gesture legend and `CalibrationFlow` — see
 * that hook's doc comment, CLAUDE.md UI/UX audit finding #26), plus this
 * dialog's own extra keyboard behavior layered on top: ArrowUp/ArrowDown
 * moves the highlighted result and Enter runs it, neither of which a
 * generic dialog hook should know about.
 */
export function CommandPalette() {
  const open = useStoreSelector(appStore, (s) => s.commandPaletteOpen);
  const commands = useSyncExternalStore(commandRouter.subscribe, () => commandRouter.list());
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.title.toLowerCase().includes(q) || c.phrases.some((p) => p.includes(q));
  });

  const close = () => toggleCommandPalette(false);
  const dialogRef = useModalDialog<HTMLDivElement>({ open, onClose: close, initialFocusRef: inputRef });

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
    }
  }, [open]);

  // Keeps the highlighted option in view as ArrowUp/ArrowDown moves past
  // the visible ~8 rows (`max-h-72`) — without this, the highlight could
  // scroll out of the clipped list entirely while Enter still silently
  // ran whatever it landed on (CLAUDE.md UI/UX audit finding #12).
  useLayoutEffect(() => {
    if (!open) return;
    const option = filtered[highlighted];
    if (!option) return;
    document.getElementById(optionId(option.id))?.scrollIntoView({ block: 'nearest' });
  }, [open, filtered, highlighted]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        const command = filtered[highlighted];
        if (command) {
          command.run();
          close();
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
      onClick={close}
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
              tabIndex={-1}
              aria-selected={i === highlighted}
              onClick={() => {
                command.run();
                close();
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
