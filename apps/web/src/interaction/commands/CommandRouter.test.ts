import { describe, expect, it, vi } from 'vitest';
import { commandRouter } from './CommandRouter';

// commandRouter is a module-level singleton (later phases register their
// own commands from within modules), so every test below registers its own
// command and unregisters it in the same test rather than relying on
// isolation between test files.
describe('CommandRouter', () => {
  it('runs a command by exact id', () => {
    const run = vi.fn();
    const unregister = commandRouter.register({
      id: 'test.one',
      title: 'Test One',
      phrases: ['test one'],
      run,
    });

    const dispatched = commandRouter.dispatch('test.one');

    expect(dispatched).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('returns false and does not throw for an unknown id', () => {
    expect(commandRouter.dispatch('nonexistent.command')).toBe(false);
  });

  it('matches a phrase case-insensitively via substring', () => {
    const run = vi.fn();
    const unregister = commandRouter.register({
      id: 'test.open-studio',
      title: 'Open 3D Studio',
      phrases: ['open 3d studio', 'open studio'],
      run,
    });

    const matched = commandRouter.dispatchPhrase('Please OPEN 3D STUDIO now');

    expect(matched?.id).toBe('test.open-studio');
    expect(run).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('unregister removes the command so it no longer dispatches', () => {
    const run = vi.fn();
    const unregister = commandRouter.register({
      id: 'test.removable',
      title: 'Removable',
      phrases: ['removable'],
      run,
    });

    unregister();

    expect(commandRouter.dispatch('test.removable')).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
