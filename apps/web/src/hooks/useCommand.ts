import { useEffect } from 'react';
import { commandRouter, type Command } from '@/interaction/commands/CommandRouter';

/** Register a command for the lifetime of the calling component. */
export function useRegisterCommand(command: Command, deps: unknown[] = []): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => commandRouter.register(command), deps);
}
