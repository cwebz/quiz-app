"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "approve" | "reject" | "move-to-pending" | "dismiss";

const LABELS: Record<Action, string> = {
  approve: "Approve",
  reject: "Reject",
  "move-to-pending": "Move to pending",
  dismiss: "Dismiss",
};

const VARIANTS: Record<Action, "ok" | "no" | "ghost"> = {
  approve: "ok",
  reject: "no",
  "move-to-pending": "no",
  dismiss: "ghost",
};

export function QuestionActions({
  questionId,
  actions,
}: {
  questionId: number;
  actions: Action[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (action: Action) => {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/admin/api/questions/${questionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="admin-actions">
      {err && (
        <span
          style={{
            color: "var(--coral-dark)",
            fontSize: 11,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            alignSelf: "center",
          }}
        >
          {err}
        </span>
      )}
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          className={`admin-btn ${VARIANTS[action]}`}
          disabled={busy !== null}
          onClick={() => run(action)}
        >
          {busy === action ? "…" : LABELS[action]}
        </button>
      ))}
    </div>
  );
}
