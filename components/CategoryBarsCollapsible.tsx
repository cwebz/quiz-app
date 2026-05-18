"use client";

import { useState } from "react";

type Category = { name: string; correct: number; seen: number; color: string };

const MASTERY_THRESHOLD = 100;
const DEFAULT_SHOWN = 3;

function prettyCategory(slug: string): string {
  return slug
    .split(/[_\s]+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function CategoryBarsCollapsible({ categories }: { categories: Category[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? categories : categories.slice(0, DEFAULT_SHOWN);
  const hiddenCount = categories.length - DEFAULT_SHOWN;

  if (categories.length === 0) {
    return (
      <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
        No category data yet. Finish a few quizzes to start populating this.
      </p>
    );
  }

  return (
    <div>
      <div className="category-bars">
        {visible.map((c) => {
          const pct = Math.min(100, (c.correct / MASTERY_THRESHOLD) * 100);
          const accuracy = c.seen > 0 ? Math.round((c.correct / c.seen) * 100) : 0;
          return (
            <div className="cat-row" key={c.name}>
              <div className="cat-name">{prettyCategory(c.name)}</div>
              <div className="cat-track">
                <div className="cat-fill" style={{ width: `${pct}%`, background: c.color }} />
              </div>
              <div className="cat-count">{c.correct}/{MASTERY_THRESHOLD} · {accuracy}%</div>
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginTop: 14,
            background: "none",
            border: "none",
            color: "var(--primary)",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {expanded ? "Show less" : `Show all ${categories.length} categories`}
        </button>
      )}
    </div>
  );
}
