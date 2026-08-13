/**
 * WCAG 2.4.1 bypass block. Nine sidebar links sit ahead of every route's
 * content with nothing to skip them (CLAUDE.md finding #13) — visually
 * hidden until it receives focus (the first Tab stop in the whole app),
 * then jumps straight to `#main-content` (see AppShell's `<main>`).
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[10000] focus-visible:rounded-lg focus-visible:bg-signal-500 focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-surface-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
    >
      Skip to content
    </a>
  );
}
