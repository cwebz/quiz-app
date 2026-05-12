"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SelectQuizButton({
  date,
  label,
}: {
  date: string;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/admin/select-quiz?date=${encodeURIComponent(date)}`,
        {
          method: "POST",
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "selection failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {err && (
        <span
          style={{
            color: "var(--coral-dark)",
            fontSize: 12,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
          }}
        >
          {err}
        </span>
      )}
      <button
        type="button"
        className="admin-btn ghost"
        disabled={busy}
        onClick={handleClick}
      >
        {busy ? "Selecting…" : label}
      </button>
    </div>
  );
}
