"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="landing" style={{ textAlign: "center" }}>
      <p style={{ color: "var(--ink-soft)", marginBottom: 16 }}>
        Something went wrong loading the page.
      </p>
      <button className="btn btn--ghost" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
