# Development Guide

## Prerequisites

- Node.js 20+ (developed against Node 22)
- A recent Chromium-based browser (Chrome or Edge) for testing camera/vision
  features — see IMPLEMENTATION.md §21 for the browser support policy
- No database, no external services, no API keys needed for anything in
  this repo so far

## Getting started

```bash
npm install        # installs all three workspaces from the repo root
npm run dev         # starts the web app (Vite) at http://localhost:5173
```

The backend is optional for everything built so far — the app works fully
without it. To run it anyway (health endpoint + WebSocket relay):

```bash
npm run dev:server  # starts @airos/server at http://localhost:8787
```

## Workspace layout

This is an npm-workspaces monorepo. Root-level scripts fan out to each
workspace:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server for `@airos/web` |
| `npm run dev:server` | tsx watch mode for `@airos/server` |
| `npm run typecheck` | `tsc --noEmit` across shared, web, server |
| `npm run lint` | ESLint (flat config) across web and server |
| `npm run test` | Vitest in watch mode (web only — the only package with tests so far) |
| `npm run test:run` | Vitest, single run, for CI |
| `npm run build` | Production build of all three packages, in dependency order |

Run a single workspace's script directly with `-w`, e.g.
`npm run lint -w @airos/web`.

## The gate every phase must pass

Before moving to the next phase (see IMPLEMENTATION.md §11), all of these
must be clean:

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```

Plus a manual check in an actual browser: navigate every route, confirm no
console errors, and if the phase touches the camera, confirm the OS camera
indicator turns off when tracking stops.

## Deployment

There's no separate static host and API host to coordinate — `@airos/server`
serves both from one process (IMPLEMENTATION.md §10):

```bash
npm run build   # builds @airos/shared, then @airos/web's dist/, then @airos/server
npm run start   # node apps/server/dist/index.js — serves the built client,
                # /api/health, and the WS relay from one port
```

`PORT` (defaults to `8787`) is the only environment variable anything in
this repo reads — there's no database, no API keys, nothing else to
configure. Any platform that can run `npm install && npm run build && npm
run start` and exposes one port works: a single Node service (Render,
Fly.io, Railway, a plain VPS) is the natural fit, since the server process
*is* the whole deployment — no separate CDN/static-host step is needed for
the client. **The one thing worth remembering before choosing a host**:
this app needs no backend at all to demo — every module works fully
against Demo Mode's synthetic fixture with the server offline (see
IMPLEMENTATION.md §10's "the app is fully functional with the server
offline"). A static host serving just `apps/web/dist/` also works if the
health endpoint and WS relay aren't needed for a given deployment.

No containerization or CI config exists yet — deliberately out of scope
for this pass rather than an oversight; add one when a specific target
platform is chosen, since the right Dockerfile/workflow shape depends on
which host's conventions it needs to match.

## Path aliases

`@/*` resolves to `apps/web/src/*` (configured in both `tsconfig.app.json`
and `vite.config.ts` — if you add a new alias, it needs to go in both
places or the dev server and the type checker will disagree).

## Adding a module

Don't hand-edit the nav, the router, or the command list. Add one entry to
`app/moduleRegistry.tsx` — the id, route, label, icon, keyboard shortcut,
phase number, and a lazy-loaded component — and the sidebar, the router,
the Home module grid, and the keyboard/voice navigation commands all pick
it up automatically.

## Testing conventions

Tests live next to the code they test (`Foo.ts` + `Foo.test.ts`), run by
Vitest with a jsdom environment. `gestures/` and `interaction/` are the
priority for coverage — they're pure logic and the highest-value place for
a regression to be caught before it reaches the UI. Vitest config is split
into `vite.config.ts` (build/dev config) and `vitest.config.ts` (merges the
former with test-only settings) so the two don't fight over the `test`
field's types.

## Code style

- `App.tsx` is routing and providers only, permanently — feature logic
  belongs in `modules/`, `vision/`, `gestures/`, `interaction/`, or
  `state/`.
- No `any` without a comment explaining why it's unavoidable.
- Every value shown in the UI that comes from tracking or gesture
  recognition carries a `Method` (`'MODEL' | 'HEURISTIC' | 'DERIVED'`) —
  see `ui/MethodBadge.tsx` and IMPLEMENTATION.md §1.4. If you're adding a
  new readout, it takes a `method` prop; there's no path around it.
- `gestures/` and `vision/` have import boundaries enforced by
  `eslint-plugin-boundaries` — see `eslint.config.js` and
  `docs/ARCHITECTURE.md`'s "Architectural boundaries" section.
