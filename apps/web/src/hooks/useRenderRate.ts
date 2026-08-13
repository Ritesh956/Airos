import { useEffect, useRef, useState } from 'react';

/**
 * Counts how many times the *calling* component actually renders, once a
 * second — a real measurement (a ref incremented in the render body itself,
 * per IMPLEMENTATION.md §9's "no metric is ever estimated, faked, or
 * smoothed"), not React DevTools' Profiler API (not available at runtime)
 * and not a guess. Deliberately scoped to one component rather than framed
 * as an app-wide number: this codebase's render-rate discipline (see
 * docs/PERFORMANCE.md's "Why React renders are a line item") is about
 * keeping any one subscriber's re-renders capped near visionStore's ~10Hz
 * throttle instead of the camera's 30-60Hz capture rate, and that's exactly
 * what watching one subscribing component's own render count demonstrates.
 *
 * The 1/sec sample interval's own setState is itself one real render, so
 * the reported rate never drops below 1 even when nothing else changed —
 * an honest artifact of how the measurement works, not a bug.
 */
export function useRenderRate(): number {
  const countRef = useRef(0);
  const [rate, setRate] = useState(0);
  countRef.current += 1;

  useEffect(() => {
    const id = window.setInterval(() => {
      setRate(countRef.current);
      countRef.current = 0;
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return rate;
}
