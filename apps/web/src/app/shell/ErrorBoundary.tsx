import { Component, type ErrorInfo, type ReactNode } from 'react';
import { cameraManager } from '@/vision/camera/CameraManager';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  showDetails: boolean;
}

/**
 * A last-resort boundary. IMPLEMENTATION.md §12: "No silent failures." —
 * this exists so a render-time crash (a bad model response, a WebGL
 * context loss, anything) surfaces as a visible, recoverable screen
 * instead of a blank white page.
 *
 * The raw `error.message` used to be the entire user-facing explanation
 * (CLAUDE.md UI/UX audit finding #27) — honest, but a WebGL context-loss
 * string or a bare `undefined is not an object` isn't something a visitor
 * can act on, and "Try to recover" didn't say what it would do. Now leads
 * with a plain sentence and a concrete next step, with the raw message
 * available behind a disclosure for anyone (a developer, or a user filing
 * a bug) who actually wants it — the honesty stays, just not as the
 * headline.
 *
 * The screen's own copy asserts the camera has already been stopped —
 * previously that was aspirational, not actual: nothing here ever called
 * `cameraManager.stop()`, so a render crash while tracking was live left the
 * stream (and the OS camera indicator) running behind this full-screen
 * overlay. `componentDidCatch` now makes the sentence true instead of
 * deleting it; `cameraManager.stop()` is idempotent (see its own doc
 * comment) so calling it when nothing was running is a harmless no-op.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, showDetails: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AIR OS] Unhandled error in render tree:', error, info.componentStack);
    cameraManager.stop();
  }

  private reset = () => this.setState({ error: null, showDetails: false });
  private toggleDetails = () => this.setState((s) => ({ ...s, showDetails: !s.showDetails }));

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-surface-0 px-6 text-center text-ink-0"
        >
          <div className="text-sm font-medium uppercase tracking-widest text-danger-500">
            AIR OS hit an unexpected error
          </div>
          <p className="max-w-md text-sm text-ink-2">
            Something in this screen crashed while rendering. Your camera, if it was running, has already been
            stopped — reloading is the most reliable way to recover.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-signal-500 px-4 py-2 text-sm font-medium text-surface-0 hover:bg-signal-400"
            >
              Reload AIR OS
            </button>
            <button
              onClick={this.reset}
              className="rounded-lg border border-border-strong bg-surface-2 px-4 py-2 text-sm text-ink-0 hover:bg-surface-3"
            >
              Try to recover without reloading
            </button>
          </div>
          <button
            onClick={this.toggleDetails}
            aria-expanded={this.state.showDetails}
            className="mt-2 text-xs text-ink-3 underline decoration-border underline-offset-4 hover:text-ink-1"
          >
            {this.state.showDetails ? 'Hide technical details' : 'Show technical details'}
          </button>
          {this.state.showDetails && (
            <p className="max-w-md text-mono-tabular text-xs text-ink-3">{this.state.error.message}</p>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
