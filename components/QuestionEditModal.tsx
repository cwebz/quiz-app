"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
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

type Difficulty = (typeof DIFFICULTIES)[number];

export type EditableQuestion = {
  id: number;
  text: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  category: string;
  difficulty: Difficulty;
  source: "the-trivia-api" | "opentdb";
  manuallyEdited: boolean;
};

type Props = {
  question: EditableQuestion;
  open: boolean;
  onClose: () => void;
};

export function QuestionEditModal({ question, open, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [text, setText] = useState(question.text);
  const [correctAnswer, setCorrectAnswer] = useState(question.correctAnswer);
  const [incorrectAnswers, setIncorrectAnswers] = useState<[string, string, string]>([
    question.incorrectAnswers[0] ?? "",
    question.incorrectAnswers[1] ?? "",
    question.incorrectAnswers[2] ?? "",
  ]);
  const [category, setCategory] = useState(question.category);
  const [difficulty, setDifficulty] = useState<Difficulty>(question.difficulty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  // Close on backdrop click
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      onClose();
    }
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/questions/${question.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          fields: { text, correctAnswer, incorrectAnswers, category, difficulty },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error((body.error as string) ?? `HTTP ${res.status}`);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        "Discard all manual edits and re-fetch this question from the source API?",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/questions/${question.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error((body.error as string) ?? `HTTP ${res.status}`);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    fontSize: 14,
    padding: "6px 10px",
    border: "1px solid var(--hairline)",
    borderRadius: 8,
    background: "var(--bg-card)",
    color: "var(--ink)",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--ink-soft)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      onClose={onClose}
      style={{
        padding: 0,
        border: "none",
        borderRadius: 16,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        background: "var(--bg-card)",
        maxWidth: 600,
        width: "calc(100vw - 32px)",
        maxHeight: "calc(100vh - 64px)",
        overflowY: "auto",
      }}
    >
      <div style={{ padding: "24px 28px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontFamily: "var(--font-display)",
              fontWeight: 700,
            }}
          >
            Edit Question #{question.id}
          </h2>
          {question.manuallyEdited && (
            <span className="chip chip--yellow">Edited</span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--coral-soft)",
              color: "var(--coral-dark)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Question text */}
          <div>
            <label htmlFor="eq-text" style={labelStyle}>
              Question
            </label>
            <textarea
              id="eq-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* Correct answer */}
          <div>
            <label htmlFor="eq-correct" style={labelStyle}>
              Correct Answer
            </label>
            <input
              id="eq-correct"
              type="text"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              disabled={busy}
              style={inputStyle}
            />
          </div>

          {/* Incorrect answers */}
          <div>
            <span style={labelStyle}>Incorrect Answers</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {([0, 1, 2] as const).map((i) => (
                <input
                  key={i}
                  type="text"
                  aria-label={`Incorrect answer ${i + 1}`}
                  value={incorrectAnswers[i]}
                  onChange={(e) => {
                    const next = [...incorrectAnswers] as [string, string, string];
                    next[i] = e.target.value;
                    setIncorrectAnswers(next);
                  }}
                  disabled={busy}
                  style={inputStyle}
                />
              ))}
            </div>
          </div>

          {/* Category + Difficulty row */}
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 2 }}>
              <label htmlFor="eq-category" style={labelStyle}>
                Category
              </label>
              <select
                id="eq-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={busy}
                style={inputStyle}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="eq-difficulty" style={labelStyle}>
                Difficulty
              </label>
              <select
                id="eq-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                disabled={busy}
                style={inputStyle}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 24,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="admin-btn ok"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            className="admin-btn ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="admin-btn no"
            onClick={handleReset}
            disabled={busy || question.source === "opentdb"}
            title={
              question.source === "opentdb"
                ? "Reset unavailable — opentdb questions use a hashed ID and cannot be re-fetched by ID"
                : "Discard manual edits and re-fetch from the-trivia-api"
            }
          >
            Reset to API Original
          </button>
        </div>
      </div>
    </dialog>
  );
}
