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

  const handleRemove = async () => {
    if (loading) return;
    if (!confirm(`Remove ${friendName} from your friends?`)) return;
    setLoading(true);
    try {
      await fetch("/api/friends", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ friendId }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="admin-btn no"
      onClick={handleRemove}
      disabled={loading}
    >
      {loading ? "…" : "Remove"}
    </button>
  );
}
