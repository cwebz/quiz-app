"use client";

import { useEffect, useState } from "react";

type InviteResponse = { token: string; url: string } | { error: string };

export function InviteLinkBox() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch("/api/friends/invite");
        const data = (await res.json()) as InviteResponse;
        if (aborted) return;
        if ("url" in data) {
          setUrl(data.url);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => undefined);
  };

  const handleReset = async () => {
    if (resetting) return;
    if (
      !confirm(
        "Reset your invite link? The old one will stop working immediately.",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/friends/invite", { method: "DELETE" });
      if (res.ok) {
        const data = (await res.json()) as InviteResponse;
        if ("url" in data) setUrl(data.url);
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          background: "var(--bg)",
          border: "2px solid var(--hairline)",
          borderRadius: 12,
          padding: "12px 14px",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          fontSize: 13,
          color: "var(--ink)",
          wordBreak: "break-all",
          minHeight: 22,
        }}
      >
        {loading ? "Loading…" : (url ?? "Unable to load invite link")}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          style={{ flex: 1, minWidth: 140 }}
          onClick={handleCopy}
          disabled={!url}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={handleReset}
          disabled={!url || resetting}
        >
          {resetting ? "Resetting…" : "Reset link"}
        </button>
      </div>
    </div>
  );
}
