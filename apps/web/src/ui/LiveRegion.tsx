/**
 * A visually-hidden `aria-live` region for announcing discrete, meaningful
 * state transitions to screen reader users — game status changes, tracking
 * lost/regained, and similar. Deliberately NOT applied to `Readout` itself
 * (the app's generic labelled-value atom): most readouts update several
 * times a second (FPS, inference time) via visionStore's throttled publish,
 * and a live region re-announcing a number ten times a second is a worse
 * experience than no announcement at all — a chatty live region is its own
 * accessibility anti-pattern, not a lesser version of a correct one. This
 * component exists for the narrower, genuinely discrete events call sites
 * choose deliberately, not as something every value in the app gets for
 * free.
 *
 * `aria-atomic="true"` so the whole message is re-read on each change,
 * not just whatever text differs from the previous content.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
