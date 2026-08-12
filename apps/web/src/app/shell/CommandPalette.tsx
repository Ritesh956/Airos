import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { useStoreSelector } from '@/hooks/useStore';
import { appStore, toggleCommandPalette } from '@/state/appStore';
import { cn } from '@/utils/cn';

/**
 * The text/keyboard face of the Command Router (IMPLEMENTATION.md §8).
 * Everything this dispatches also works from a gesture or a voice utterance
 * once those land in later phases — none of it is special-cased here.
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

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
      requestAnimationFrame(() => inputRef.current?.focus());
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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, highlighted]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-surface-0/70 pt-[15vh] backdrop-blur-sm"
      onClick={() => toggleCommandPalette(false)}
    >
      <div
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
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-ink-0 outline-none placeholder:text-ink-3"
        />
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-ink-3">No matching commands.</div>
          )}
          {filtered.map((command, i) => (
            <button
              key={command.id}
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
