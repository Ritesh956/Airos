/**
 * The One-Euro filter (Casiez, Roussel & Vogel, CHI 2012). Chosen over a
 * plain exponential moving average because EMA has one fixed smoothing
 * factor: crank it up and a still hand stops jittering but a fast swipe
 * lags noticeably behind; back it off and the lag disappears but so does
 * the jitter suppression. One-Euro instead adapts its cutoff frequency to
 * the signal's own speed — heavy smoothing while the hand is nearly
 * still (kills jitter), light smoothing while it moves fast (kills lag) —
 * which is why it's the standard answer for this exact problem in HCI
 * pointer-input work. See IMPLEMENTATION.md §1.3.
 *
 * `minCutoff` and `beta` are exposed as live-tunable settings
 * (AppSettings.cursorMinCutoff/cursorBeta): minCutoff controls how much
 * smoothing applies when nearly still (lower = smoother, more lag),
 * beta controls how aggressively the filter opens up as speed increases
 * (higher = less lag at speed, less jitter suppression while moving).
 */

function smoothingFactor(dtSeconds: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

class LowPassFilter {
  private y: number | null = null;

  filter(value: number, alpha: number): number {
    this.y = this.y === null ? value : lerp(this.y, value, alpha);
    return this.y;
  }

  reset(): void {
    this.y = null;
  }
}

export interface OneEuroFilterOptions {
  minCutoff?: number;
  beta?: number;
  /** Fixed cutoff for the derivative's own low-pass filter. Rarely needs
   *  tuning — 1.0 is the value the original paper settles on. */
  derivativeCutoff?: number;
}

/** Filters a single scalar signal over time. Timestamps are in seconds. */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private derivativeCutoff: number;

  private valueFilter = new LowPassFilter();
  private derivativeFilter = new LowPassFilter();
  private lastValue: number | null = null;
  private lastTimestamp: number | null = null;

  constructor(options: OneEuroFilterOptions = {}) {
    this.minCutoff = options.minCutoff ?? 1.0;
    this.beta = options.beta ?? 0.02;
    this.derivativeCutoff = options.derivativeCutoff ?? 1.0;
  }

  /** Updates live-tunable parameters without losing filter history —
   *  dragging a sensitivity slider shouldn't make the cursor jump. */
  setParams(minCutoff: number, beta: number): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  filter(value: number, timestampSeconds: number): number {
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestampSeconds;
      this.lastValue = value;
      this.valueFilter.filter(value, 1);
      return value;
    }

    const dt = Math.max(1e-6, timestampSeconds - this.lastTimestamp);
    this.lastTimestamp = timestampSeconds;

    const derivative = (value - (this.lastValue ?? value)) / dt;
    this.lastValue = value;

    const dAlpha = smoothingFactor(dt, this.derivativeCutoff);
    const filteredDerivative = this.derivativeFilter.filter(derivative, dAlpha);

    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);
    const alpha = smoothingFactor(dt, cutoff);
    return this.valueFilter.filter(value, alpha);
  }

  /** Drops all history — call when the cursor reappears after tracking
   *  was lost, so the filter doesn't smooth *into* the new position from
   *  wherever it last was. */
  reset(): void {
    this.valueFilter.reset();
    this.derivativeFilter.reset();
    this.lastValue = null;
    this.lastTimestamp = null;
  }
}

/** Two independent OneEuroFilter instances for a 2D point. Filtering x and
 *  y independently (rather than filtering speed as a single magnitude) is
 *  the standard approach and keeps the math simple; the adaptive cutoff
 *  still responds correctly to diagonal motion since both axes see the
 *  same elevated per-axis derivative together. */
export class Point2DFilter {
  private x: OneEuroFilter;
  private y: OneEuroFilter;

  constructor(options: OneEuroFilterOptions = {}) {
    this.x = new OneEuroFilter(options);
    this.y = new OneEuroFilter(options);
  }

  setParams(minCutoff: number, beta: number): void {
    this.x.setParams(minCutoff, beta);
    this.y.setParams(minCutoff, beta);
  }

  filter(point: { x: number; y: number }, timestampSeconds: number): { x: number; y: number } {
    return {
      x: this.x.filter(point.x, timestampSeconds),
      y: this.y.filter(point.y, timestampSeconds),
    };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
  }
}
