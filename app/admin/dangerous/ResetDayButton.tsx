"use client";

import { useState } from "react";

type Stage = "idle" | "confirm" | "busy" | "done" | "error";

export function ResetDayButton() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<string | null>(null);

  const handleReset = async () => {
    setStage("busy");
    setResult(null);
    try {
      const res = await fetch(`/admin/reset-day?date=${encodeURIComponent(date)}`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error((body.error as string) ?? `HTTP ${res.status}`);
      }
      setResult(`Done — new quiz ID ${body.newQuizId ?? "?"} for ${date}`);
      setStage("done");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "request failed");
      setStage("error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label
          htmlFor="reset-date"
          style={{ fontSize: 14, color: "var(--ink-soft)", whiteSpace: "nowrap" }}
        >
          Date (UTC)
        </label>
        <input
          id="reset-date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setStage("idle");
            setResult(null);
          }}
          disabled={stage === "busy"}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            padding: "4px 10px",
            border: "1px solid var(--hairline)",
            borderRadius: 8,
            background: "var(--bg-card)",
            color: "var(--ink)",
          }}
        />
      </div>

      {stage === "idle" && (
        <div>
          <button
            type="button"
            className="admin-btn no"
            onClick={() => setStage("confirm")}
          >
            Reset day
          </button>
        </div>
      )}

      {stage === "confirm" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "var(--coral-dark)", fontWeight: 700 }}>
            Delete all play records for {date} and re-roll questions?
          </span>
          <button
            type="button"
            className="admin-btn no"
            onClick={handleReset}
          >
            Yes, reset
          </button>
          <button
            type="button"
            className="admin-btn ghost"
            onClick={() => setStage("idle")}
          >
            Cancel
          </button>
        </div>
      )}

      {stage === "busy" && (
        <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
          Resetting…
        </p>
      )}

      {stage === "done" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <p style={{ fontSize: 14, color: "var(--mint-dark)", margin: 0, fontWeight: 700 }}>
            {result}
          </p>
          <button
            type="button"
            className="admin-btn ghost"
            onClick={() => { setStage("idle"); setResult(null); }}
          >
            Reset again
          </button>
        </div>
      )}

      {stage === "error" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <p style={{ fontSize: 14, color: "var(--coral-dark)", margin: 0, fontWeight: 700 }}>
            Error: {result}
          </p>
          <button
            type="button"
            className="admin-btn ghost"
            onClick={() => { setStage("idle"); setResult(null); }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
