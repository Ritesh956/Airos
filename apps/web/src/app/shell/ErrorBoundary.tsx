import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A last-resort boundary. IMPLEMENTATION.md §12: "No silent failures." —
 * this exists so a render-time crash (a bad model response, a WebGL
 * context loss, anything) surfaces as a visible, recoverable screen
 * instead of a blank white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AIR OS] Unhandled error in render tree:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-surface-0 px-6 text-center text-ink-0">
          <div className="text-sm font-medium uppercase tracking-widest text-danger-500">
            AIR OS hit an unexpected error
          </div>
          <p className="max-w-md text-sm text-ink-2">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="rounded-lg border border-border-strong bg-surface-2 px-4 py-2 text-sm text-ink-0 hover:bg-surface-3"
          >
            Try to recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
