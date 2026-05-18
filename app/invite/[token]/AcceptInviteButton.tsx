"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInviteButton({
  token,
  inviterName,
}: {
  token: string;
  inviterName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/friends/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/leaderboard");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        className="btn btn--lg"
        onClick={handleAccept}
        disabled={loading}
      >
        {loading ? "Adding…" : `Add ${inviterName} as a friend`}
      </button>
      {error && (
        <p
          style={{
            color: "var(--coral-dark)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
