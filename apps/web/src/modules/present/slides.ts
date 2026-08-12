/**
 * Presentation's demo deck — a short pitch for AIR OS itself, presented
 * with AIR OS's own gesture engine. Plain data, same reasoning as
 * `studioObjects.ts`: no editor to author slides is in scope for this
 * phase (the placeholder's brief is "drive a deck with swipes," not "build
 * a slide editor"), so a fixed deck is the honest scope.
 */
export interface Slide {
  id: string;
  title: string;
  bullets: string[];
  /** Shown only when the presenter HUD's notes panel is toggled on. */
  notes: string;
}

export const SLIDES: Slide[] = [
  {
    id: 'title',
    title: 'AIR OS',
    bullets: ['Interact with your computer without touching it.'],
    notes: 'Open with the tagline. This deck is itself being driven by the gesture engine you\'re about to describe.',
  },
  {
    id: 'pipeline',
    title: 'The Pipeline',
    bullets: [
      'Camera frame → MediaPipe Hand Landmarker → 21 landmarks',
      'Landmarks → rule-based geometry → a named gesture',
      'Gesture → Interaction Engine → real app behavior',
    ],
    notes: 'Every arrow in this pipeline runs entirely on-device. No frame ever leaves the browser.',
  },
  {
    id: 'heuristic',
    title: 'Rule-Based, Not a Trained Model',
    bullets: [
      '11 gestures from joint angles and distance thresholds',
      'Every result carries method: HEURISTIC — never MODEL',
      'The type system makes mislabeling a heuristic impossible',
    ],
    notes: 'This is the single most-repeated principle in the project brief — say it plainly, don\'t hedge.',
  },
  {
    id: 'architecture',
    title: 'Hot Path vs. Cold Path',
    bullets: [
      'Per-frame data (landmarks, cursor position) — refs, never React state',
      'Human-readable data (FPS, gesture name) — throttled to ~10Hz',
      'The reason this app doesn\'t become a slideshow at 60fps of input',
    ],
    notes: 'This slide is currently on screen because a swipe was detected — that event went through the cold path, exactly as described.',
  },
  {
    id: 'cursor',
    title: 'Air Cursor',
    bullets: ['Point to move, pinch to click or drag', 'One-Euro filtered — smooth while still, responsive while fast'],
    notes: 'Demo Air Cursor next if there\'s time — it clicks real DOM elements, not a decorative dot.',
  },
  {
    id: 'studio',
    title: '3D Studio',
    bullets: ['One hand selects and drags', 'A second hand while pinching scales and rotates'],
    notes: 'The two-hand gesture needs a real camera — Demo Mode can only show the single-hand half.',
  },
  {
    id: 'draw',
    title: 'Air Draw',
    bullets: ['Pinch paints a smoothed stroke', 'A fist erases', 'Undo/redo, PNG export, a local gallery'],
    notes: 'Clear is itself undoable — worth mentioning as a small design decision that mattered.',
  },
  {
    id: 'thanks',
    title: 'Thanks',
    bullets: ['Swipe left brought you here.', 'Swipe right to go back through it all.'],
    notes: 'Closing slide. Let the swipe speak for itself.',
  },
];
