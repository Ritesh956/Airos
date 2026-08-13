# AIR OS

**Interact with your computer without touching it.**

AIR OS is a browser-based, touchless computer interface controlled by
real-time hand gestures, with face tracking, pose tracking, and voice
control alongside it. All computer-vision inference runs locally in the
browser via pretrained MediaPipe models; camera frames are never uploaded,
recorded, or sent to a server.

This is a portfolio-level engineering project, built in phases, with each
phase verified before the next begins. See **[IMPLEMENTATION.md](IMPLEMENTATION.md)**
for the full architecture, phase plan, and the reasoning behind every major
decision — start there.

## Current status

**Phases 1–13 of 14: Architecture & Camera, Hand Tracking, Gesture Engine,
Air Cursor, Gesture Lab, 3D Studio, Air Draw, Presentation, Face
Tracking, Pose Tracking, Voice + Command Center, Game Mode, Analytics +
Perf** — complete. See IMPLEMENTATION.md §11 for the full phase plan.

Working today: the app shell, routing, the design system, the camera
lifecycle (start/stop/error handling, verified against the OS camera
indicator), the Command Router with keyboard shortcuts and a command
palette, a minimal backend (health check + a WebSocket relay reserved for
future multiplayer gesture state — no camera data ever touches it),
real-time hand tracking via MediaPipe's Hand Landmarker with a live
skeleton overlay, a rule-based gesture engine recognizing all 11 supported
gestures (OPEN_PALM, FIST, POINT, PEACE, THUMBS_UP, THUMBS_DOWN, PINCH, and
four swipe directions) with pinch hysteresis and a frame-debounce window so
it doesn't flicker, and a working Air Cursor — point to move, pinch to
click or drag, open palm to pause, with One-Euro-filtered smoothing, a
2-corner reach calibration, and a real virtual pointer that dispatches
genuine DOM events, so pinching over any button or link in the app actually
activates it. A Demo Mode toggle lets you see all of this work with a
synthetic recorded hand and no camera permission at all — the same
`VisionEngine` runs either source, so nothing downstream treats them
differently. See docs/COMPUTER_VISION.md, docs/GESTURES.md, and
docs/ARCHITECTURE.md's Interaction Engine section.

The Gesture Lab makes the whole pipeline inspectable: a live per-hand
landmark table (raw MediaPipe output plus the one place mirroring happens),
a gesture timeline logging every stable-gesture transition with a
wall-clock timestamp, real FPS/inference readouts, and toggleable skeleton
and landmark-index overlays — every number labelled Model, Heuristic, or
Derived, per the project's provenance rule. An opt-in "Track Face" toggle
adds a second MediaPipe model — Face Landmarker — drawing a face
oval/eyes/eyebrows/lips overlay. Deliberately tracking-only: no expression,
emotion, age, or identity inference anywhere, and the underlying model is
never even asked for the blendshape scores that would make that possible.

3D Studio puts real objects in your hands: pinch to select and drag a cube,
sphere, torus, or the glowing wireframe centerpiece across a camera-facing
plane, then bring in a second hand while pinching to scale and rotate
whatever's selected — a two-finger pinch-to-zoom-and-rotate, just in 3D.
Every transform eases in with frame-rate-independent damping, never
snapping. Full mouse (click to select, drag to orbit) and keyboard
(`[`/`]` cycle, arrows translate, `+`/`-` scale, `Q`/`E` rotate, `Esc`
deselect) parity means it's just as capable without a camera — genuinely
useful, since Demo Mode's single synthetic hand can demonstrate selecting
and dragging but not the two-hand gesture.

Air Draw turns the fingertip into a brush: pinch to paint a smoothed
stroke, make a fist to erase whatever the fingertip passes near, open the
palm to lift the brush without losing your place. Undo/redo/clear (Clear
is itself undoable — it moves the whole canvas onto the redo stack rather
than discarding it), a six-color palette, and an adjustable brush size sit
alongside a one-click PNG export and a local IndexedDB gallery of saved
drawings. Full mouse parity (click-drag to draw) means it's just as usable
without a camera.

Presentation drives a slide deck hands-free: swipe left or right to move
through the deck, thumbs up starts a presenter timer, a fist pauses it,
and an open palm toggles a gesture-legend overlay — all edge-triggered off
the same gesture classifications every other module publishes, with no
per-frame tracking of its own. Demo Mode can fully exercise the core
interaction here (unlike 3D Studio's two-hand gesture): the synthetic
fixture's swipe keyframe advances slides through the real code path. Full
mouse and keyboard parity throughout.

Analytics is a real performance dashboard, not a placeholder: live FPS
(smoothed and a rolling 3-second median), inference/frame-time readouts,
an FPS history graph plotted from the same measured samples the
degradation ladder itself acts on, and a Debug Mode that reuses Gesture
Lab's landmark table and gesture timeline. The degradation ladder from
IMPLEMENTATION.md §9 is fully wired, not just documented: sustained low
FPS automatically drops capture resolution, then hand count, then halves
the inference rate, then disables face/pose tracking, then recommends
Demo Mode — each step reversible with hysteresis, each one module-gated
(3D Studio always keeps both hands, Gesture Lab's face/pose toggles are
never overridden), and every step's real on/off state is readable from
one function (`getAppliedEffects()`) shared by the controller and the UI
so the dashboard can never claim a step is active that isn't.
`Analytics` was the last module still showing `ui/ModulePlaceholder.tsx`
— the whole app is now real, navigable functionality end to end.

## Getting started

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. See
**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for the full workflow,
scripts, and conventions.

## Documentation

- [IMPLEMENTATION.md](IMPLEMENTATION.md) — architecture, phase plan, and
  the reasoning behind every major decision. Start here.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the codebase is put
  together and why.
- [docs/COMPUTER_VISION.md](docs/COMPUTER_VISION.md) — the MediaPipe
  pipeline (Phase 2+).
- [docs/GESTURES.md](docs/GESTURES.md) — how gestures are recognized
  (Phase 3+).
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) — the performance budget and
  measurement approach.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, scripts, and
  conventions.

## Stack

React, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Three.js /
React Three Fiber / Drei, MediaPipe Tasks Vision, Node.js + Express + ws,
Vitest.

## Privacy

Camera processing happens entirely locally in your browser. Video frames
are never uploaded, recorded, or transmitted anywhere. Camera access is
requested only when you explicitly start tracking — never automatically.
