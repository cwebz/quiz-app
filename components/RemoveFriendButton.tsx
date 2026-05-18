"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemoveFriendButton({
  friendId,
  friendName,
}: {
  friendId: number;
  friendName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    if (loading) return;
    if (!confirm(`Remove ${friendName} from your friends?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/friends", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ friendId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to remove friend");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        className="admin-btn no"
        onClick={handleRemove}
        disabled={loading}
      >
        {loading ? "…" : "Remove"}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "var(--coral-dark)" }}>{error}</span>
      )}
    </div>
  );
}
