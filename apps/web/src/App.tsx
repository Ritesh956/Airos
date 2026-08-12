import { RouterProvider } from 'react-router-dom';
import { router } from './app/routes';
import { ErrorBoundary } from './app/shell/ErrorBoundary';

/**
 * Routing and providers only — permanently. Feature logic belongs in
 * modules/, vision/, gestures/, interaction/, or state/. See
 * IMPLEMENTATION.md §12.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
