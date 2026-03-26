"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: "60vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--cfg-mono)",
      color: "var(--cfg-text)",
    }}>
      <div style={{ textAlign: "center", maxWidth: "28rem" }}>
        <h2 style={{
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "#ef4444",
          marginBottom: "0.75rem",
        }}>
          Something went wrong
        </h2>
        <p style={{
          fontSize: "0.75rem",
          color: "var(--cfg-text-muted)",
          marginBottom: "1.5rem",
          lineHeight: 1.5,
        }}>
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          style={{
            fontFamily: "var(--cfg-mono)",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--cfg-bg)",
            background: "var(--cfg-accent)",
            border: "none",
            borderRadius: "4px",
            padding: "0.5rem 1.25rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
