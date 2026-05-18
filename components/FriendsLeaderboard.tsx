export type FriendEntry = {
  displayName: string;
  finalScore: number | null;
  totalTimeMs: number | null;
  isCurrentUser: boolean;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function FriendsLeaderboard({ entries }: { entries: FriendEntry[] }) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}
    >
      {entries.map((entry, i) => {
        const rank = i + 1;
        const hasPlayed = entry.finalScore !== null;
        const isYou = entry.isCurrentUser;
        return (
          <div
            // biome-ignore lint: deterministic
            key={`${entry.displayName}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "32px 44px 1fr auto",
              gap: 12,
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: 12,
              background: isYou ? "var(--primary-soft)" : "var(--bg)",
              border: `2px solid ${isYou ? "var(--primary)" : "transparent"}`,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 14,
                color: isYou ? "var(--primary-dark)" : "var(--ink-soft)",
                textAlign: "center",
              }}
            >
              {hasPlayed ? `#${rank}` : "—"}
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: isYou ? "var(--primary)" : "var(--ink-soft)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 13,
                border: "2px solid var(--ink)",
              }}
            >
              {initials(entry.displayName)}
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry.displayName}
              {isYou && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    color: "var(--primary-dark)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  You
                </span>
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 14,
                color: hasPlayed ? "var(--ink)" : "var(--ink-mute)",
              }}
            >
              {hasPlayed ? `${entry.finalScore} pts` : "Not played yet"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
