/**
 * The single funnel every input modality dispatches through — gesture,
 * voice, keyboard, and the text command palette. See IMPLEMENTATION.md §8.
 *
 * Phase 1 only wires navigation commands (the module switcher) and
 * keyboard bindings. Later phases register their own commands (e.g. "clear
 * canvas", "next slide") from within their module — nothing outside a
 * module hard-codes that module's command strings, which is the whole
 * point of routing everything through one registry instead of scattering
 * `if (transcript.includes('next slide'))` checks across components.
 *
 * Matching is deliberately simple, deterministic phrase/substring matching
 * — not an LLM call — because the brief requires the app to work fully
 * without one. `phrases` is designed so a future free-text/LLM layer could
 * map an arbitrary utterance to a command id and call `dispatch(id)`
 * without this file changing at all.
 */

export interface Command {
  id: string;
  title: string;
  /** Lowercase phrases this command matches for voice/text input. */
  phrases: string[];
  /** Keyboard shortcut, e.g. ['g', 'h'] for a chord, or ['Escape']. */
  keys?: string[];
  category?: string;
  run: () => void;
}

type Unregister = () => void;

class CommandRouterImpl {
  private commands = new Map<string, Command>();
  private listeners = new Set<() => void>();
  /** Cached array view of `commands`, invalidated only on register/unregister.
   *  `list()` is called from `useSyncExternalStore` getSnapshot — returning a
   *  fresh array on every call would make every render see a "changed"
   *  snapshot and loop forever. Rebuilding only on actual mutation keeps the
   *  reference stable across reads that see no change. */
  private listSnapshot: Command[] = [];

  // Every public method here is a bound arrow field rather than a
  // prototype method. They're routinely passed as bare callback
  // references (e.g. `useSyncExternalStore(commandRouter.subscribe, ...)`
  // in CommandPalette.tsx) — a prototype method would lose its `this`
  // binding the moment it's detached from the instance like that.

  register = (command: Command): Unregister => {
    this.commands.set(command.id, command);
    this.refreshSnapshot();
    this.notify();
    return () => {
      this.commands.delete(command.id);
      this.refreshSnapshot();
      this.notify();
    };
  };

  list = (): Command[] => {
    return this.listSnapshot;
  };

  get = (id: string): Command | undefined => {
    return this.commands.get(id);
  };

  /** Dispatch by exact command id — the path gestures and keyboard use. */
  dispatch = (id: string): boolean => {
    const command = this.commands.get(id);
    if (!command) return false;
    command.run();
    return true;
  };

  /** Dispatch by matching free text against registered phrases — the path
   *  voice and the text palette use. Case-insensitive substring match. */
  dispatchPhrase = (text: string): Command | null => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;
    for (const command of this.commands.values()) {
      if (command.phrases.some((p) => normalized.includes(p))) {
        command.run();
        return command;
      }
    }
    return null;
  };

  subscribe = (listener: () => void): Unregister => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private refreshSnapshot(): void {
    this.listSnapshot = [...this.commands.values()];
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const commandRouter = new CommandRouterImpl();
