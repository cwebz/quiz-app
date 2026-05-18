"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchResult = {
  id: number;
  text: string;
  category: string;
  difficulty: string;
  status: string;
};

type Mode = "idle" | "searching" | "confirming" | "submitting";

const CATEGORIES = [
  "Music",
  "Sport & Leisure",
  "Film & TV",
  "Arts & Literature",
  "History",
  "Society & Culture",
  "Science",
  "Geography",
  "Food & Drink",
  "General Knowledge",
] as const;

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function SwapButton({
  date,
  outId,
  outText,
}: {
  date: string;
  outId: number;
  outText: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === "searching") {
      inputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "searching") return;
    const trimmed = query.trim();
    const hasFilter = !!trimmed || !!category || !!difficulty;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      if (!hasFilter) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "15");
        if (trimmed) params.set("q", trimmed);
        if (category) params.set("category", category);
        if (difficulty) params.set("difficulty", difficulty);
        const res = await fetch(`/admin/api/questions?${params.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setResults([]);
          setSearching(false);
          return;
        }
        const data = (await res.json()) as { questions: SearchResult[] };
        setResults(data.questions.filter((q) => q.id !== outId));
        setSearching(false);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setSearching(false);
        }
      }
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [query, category, difficulty, mode, outId]);

  function reset() {
    setMode("idle");
    setQuery("");
    setCategory("");
    setDifficulty("");
    setResults([]);
    setSelected(null);
    setError(null);
  }

  async function confirmSwap() {
    if (!selected) return;
    setMode("submitting");
    setError(null);
    try {
      const res = await fetch("/admin/api/quiz-swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, outId, inId: selected.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? `swap failed (${res.status})`);
        setMode("confirming");
        return;
      }
      router.refresh();
      reset();
    } catch (err) {
      setError(String(err));
      setMode("confirming");
    }
  }

  if (mode === "idle") {
    return (
      <div style={{ marginTop: 6 }}>
        <button
          type="button"
          className="admin-btn ghost"
          style={{ padding: "2px 10px", fontSize: 12 }}
          onClick={() => setMode("searching")}
        >
          Swap
        </button>
      </div>
    );
  }

  const hasFilter = !!query.trim() || !!category || !!difficulty;
  const selectStyle = {
    border: "1px solid var(--hairline)",
    borderRadius: 8,
    padding: "5px 8px",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    background: "transparent",
    color: "var(--ink)",
    cursor: "pointer",
  } as const;

  return (
    <div
      style={{
        marginTop: 8,
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: 12,
        background: "var(--surface, #fff)",
      }}
    >
      {mode === "searching" && (
        <>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by text or ID…"
              style={{
                flex: 1,
                border: "1px solid var(--hairline)",
                borderRadius: 8,
                padding: "6px 10px",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                background: "transparent",
                color: "var(--ink)",
                outline: "none",
              }}
            />
            <button
              type="button"
              className="admin-btn ghost"
              style={{ padding: "2px 10px", fontSize: 12 }}
              onClick={reset}
              aria-label="Close search"
            >
              ×
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={selectStyle}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              style={selectStyle}
            >
              <option value="">All difficulties</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              marginTop: 8,
            }}
          >
            Replacing: <span style={{ color: "var(--ink)" }}>{outText}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            {!hasFilter && (
              <div
                style={{
                  color: "var(--ink-soft)",
                  fontSize: 13,
                  padding: "8px 0",
                }}
              >
                Use the filters above or type to search…
              </div>
            )}
            {hasFilter && searching && (
              <div
                style={{
                  color: "var(--ink-soft)",
                  fontSize: 13,
                  padding: "8px 0",
                }}
              >
                Searching…
              </div>
            )}
            {hasFilter && !searching && results.length === 0 && (
              <div
                style={{
                  color: "var(--ink-soft)",
                  fontSize: 13,
                  padding: "8px 0",
                }}
              >
                No questions match.
              </div>
            )}
            {hasFilter &&
              !searching &&
              results.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderTop:
                      i === 0 ? "none" : "1px solid var(--hairline)",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.text.length > 120
                        ? `${r.text.slice(0, 120)}…`
                        : r.text}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--ink-soft)",
                        marginTop: 2,
                      }}
                    >
                      {r.category} · {r.difficulty} · #{r.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="admin-btn"
                    style={{ padding: "2px 10px", fontSize: 12 }}
                    onClick={() => {
                      setSelected(r);
                      setMode("confirming");
                    }}
                  >
                    Use
                  </button>
                </div>
              ))}
          </div>
        </>
      )}

      {(mode === "confirming" || mode === "submitting") && selected && (
        <>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              marginBottom: 4,
            }}
          >
            Replacing:
          </div>
          <div style={{ fontSize: 13, color: "var(--ink)" }}>{outText}</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              marginTop: 10,
              marginBottom: 4,
            }}
          >
            With:
          </div>
          <div style={{ fontSize: 13, color: "var(--ink)" }}>
            {selected.text}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-soft)",
              marginTop: 2,
            }}
          >
            {selected.category} · {selected.difficulty} · #{selected.id}
          </div>
          {error && (
            <div
              style={{
                color: "var(--coral-dark, #c0392b)",
                fontSize: 12,
                marginTop: 8,
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 12,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              className="admin-btn"
              onClick={confirmSwap}
              disabled={mode === "submitting"}
            >
              {mode === "submitting" ? "Swapping…" : "Confirm swap"}
            </button>
            <button
              type="button"
              className="admin-btn ghost"
              onClick={() => {
                setSelected(null);
                setError(null);
                setMode("searching");
              }}
              disabled={mode === "submitting"}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
