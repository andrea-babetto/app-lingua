import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/tajawal/arabic-400.css";
import "@fontsource/tajawal/arabic-500.css";
import "@fontsource/tajawal/arabic-700.css";
import "@/index.css";
import App from "@/App";
import { queryClient } from "@/lib/queryClient";

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#e5e5e5" }}>
        <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
        <p style={{ opacity: 0.8 }}>Please reload the page. If it keeps happening, send us this message:</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "8px 16px" }}>Reload</button>
      </div>
    );
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary><App /></ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
