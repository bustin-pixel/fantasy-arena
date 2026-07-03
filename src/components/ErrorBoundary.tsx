import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches a render-time crash in its subtree and shows a recoverable fallback
 * instead of letting React unmount the whole app (the blank screen). Wraps the
 * app in App.tsx.
 *
 * Scope (React's contract): it catches errors thrown during **render / lifecycle**
 * of its descendants — the UI shell, screens, and detail panels. It does NOT catch
 * errors in event handlers, async code, or the canvas requestAnimationFrame + fixed
 * -timestep sim loops in useBattleEngine (those run in refs/callbacks, outside the
 * render path). Those are pure, deterministic engine code and the least likely to
 * throw; this boundary is the safety net for the React UI around them.
 *
 * Styling is inline with hardcoded fallbacks behind the theme CSS vars, so the
 * fallback still renders legibly even if the failure is stylesheet-related.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it for debugging; the fallback keeps the app recoverable.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] render crash:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "var(--forest-deep, #1d2f17)",
          color: "var(--parchment, #ece3cf)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display, "Trebuchet MS"), serif',
            color: "var(--gold, #f5b301)",
          }}
        >
          Something went wrong
        </h1>
        <p style={{ margin: 0, maxWidth: "30rem", color: "var(--stone, #9aa3ad)" }}>
          The arena hit an unexpected snag. Your collection is saved — reloading
          should get you back in.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "0.6rem 1.5rem",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: "8px",
            color: "var(--ink, #1a140d)",
            background: "var(--gold, #f5b301)",
            border: "1px solid var(--gold, #f5b301)",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
