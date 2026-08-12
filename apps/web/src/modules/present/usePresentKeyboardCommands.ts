import { useEffect } from 'react';
import { commandRouter } from '@/interaction/commands/CommandRouter';
import { nextSlide, prevSlide, resetTimer, startTimer, pauseTimer, toggleLegend, toggleNotes } from './presentStore';

/**
 * Keyboard parity for every gesture-driven action in this module
 * (IMPLEMENTATION.md §1.6): SWIPE_LEFT/RIGHT, THUMBS_UP, FIST, and
 * OPEN_PALM each get a real keyboard equivalent, plus a Reset Timer
 * command no gesture maps to (mirroring Studio/Draw's pattern of adding a
 * plain keyboard-only action where one is genuinely useful). Single-key
 * bindings only, per `useGlobalKeyboardCommands`'s own Ctrl/Cmd/Alt-chord
 * exclusion — arrows for slide nav match how every slide-deck tool on the
 * market already binds them, so this isn't just parity, it's the more
 * discoverable of the two paths.
 */
export function usePresentKeyboardCommands(): void {
  useEffect(() => {
    const unregisters = [
      commandRouter.register({
        id: 'present.next-slide',
        title: 'Next Slide',
        phrases: ['next slide'],
        keys: ['ArrowRight'],
        category: 'Presentation',
        run: nextSlide,
      }),
      commandRouter.register({
        id: 'present.prev-slide',
        title: 'Previous Slide',
        phrases: ['previous slide'],
        keys: ['ArrowLeft'],
        category: 'Presentation',
        run: prevSlide,
      }),
      commandRouter.register({
        id: 'present.start-timer',
        title: 'Start Timer',
        phrases: ['start timer'],
        keys: ['s'],
        category: 'Presentation',
        run: () => startTimer(),
      }),
      commandRouter.register({
        id: 'present.pause-timer',
        title: 'Pause Timer',
        phrases: ['pause timer'],
        keys: ['p'],
        category: 'Presentation',
        run: () => pauseTimer(),
      }),
      commandRouter.register({
        id: 'present.reset-timer',
        title: 'Reset Timer',
        phrases: ['reset timer'],
        keys: ['r'],
        category: 'Presentation',
        run: resetTimer,
      }),
      commandRouter.register({
        id: 'present.toggle-legend',
        title: 'Toggle Gesture Legend',
        phrases: ['toggle legend', 'show controls'],
        keys: ['h'],
        category: 'Presentation',
        run: toggleLegend,
      }),
      commandRouter.register({
        id: 'present.toggle-notes',
        title: 'Toggle Speaker Notes',
        phrases: ['toggle notes', 'speaker notes'],
        keys: ['n'],
        category: 'Presentation',
        run: toggleNotes,
      }),
    ];

    return () => unregisters.forEach((fn) => fn());
  }, []);
}
