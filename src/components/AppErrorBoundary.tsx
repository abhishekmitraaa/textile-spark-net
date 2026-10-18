import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { isChunkLoadError, reloadOnceForNewDeploy } from "@/lib/newDeploy";

// ─────────────────────────────────────────────────────────────
// What a crash looks like (2026-10-18 buyer audit). There was no error boundary anywhere: one error
// thrown while a page rendered unmounted the whole app and left a white screen, and so did a lazily
// loaded page (Video Close-Ups, video upload) whose file a deploy had replaced while the tab was open.
//
// Now a crash shows a short message with Try again / Go home, and the next page you open starts clean.
// A page file that's gone after a deploy reloads the app once, which fetches the new files
// (see also the vite:preloadError listener in main.tsx).
// ─────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  /** A change of this value clears the error (the route, for the in-app boundary). */
  resetKey?: string;
}

interface State {
  error: unknown;
  resetKey?: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Navigating away from the page that crashed starts the next one clean.
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnceForNewDeploy()) return;
    console.error("Page crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error == null) return this.props.children;
    const updated = isChunkLoadError(this.state.error);
    return (
      <div role="alert" className="min-h-screen bg-white grid place-items-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-bold text-gray-900">
            {updated ? "Cosora has been updated" : "Something went wrong on this page"}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {updated
              ? "Reload to get the latest version."
              : "Try again, or go back to the home page. If it keeps happening, tell us from Help & Support."}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => (updated ? window.location.reload() : this.setState({ error: null }))}
              className="w-full rounded-xl bg-brand-buyer py-3 text-sm font-bold text-white hover:bg-brand-buyer/90"
            >
              {updated ? "Reload" : "Try again"}
            </button>
            <button
              onClick={() => { window.location.href = "/"; }}
              className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Go to the home page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** The in-app boundary: inside the router, cleared on every route change. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <AppErrorBoundary resetKey={location.pathname}>{children}</AppErrorBoundary>;
}
