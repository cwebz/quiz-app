import { and, eq, like, or, type SQL } from "drizzle-orm";
import { questions } from "@/db/schema";
import { Ico } from "@/components/Icons";
import { QuestionEditButton } from "@/components/QuestionEditButton";
import { getDb } from "@/lib/db";

type QuestionRow = typeof questions.$inferSelect;

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
type Difficulty = (typeof DIFFICULTIES)[number];

async function search({
  q,
  category,
  difficulty,
}: {
  q: string;
  category: string;
  difficulty: Difficulty | "";
}): Promise<QuestionRow[]> {
  if (!q.trim() && !category && !difficulty) return [];
  const db = await getDb();

  const conditions: SQL[] = [];
  if (q.trim()) {
    const trimmed = q.trim();
    const numericId = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
    const pattern = `%${trimmed}%`;
    conditions.push(
      numericId !== null
        ? or(eq(questions.id, numericId), like(questions.text, pattern))!
        : like(questions.text, pattern),
    );
  }
  if (category) conditions.push(eq(questions.category, category));
  if (difficulty) conditions.push(eq(questions.difficulty, difficulty));

  return await db
    .select()
    .from(questions)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .limit(50);
}

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; difficulty?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.toString() ?? "";
  const categoryRaw = params.category?.toString() ?? "";
  const difficultyRaw = params.difficulty?.toString() ?? "";
  const category = (CATEGORIES as readonly string[]).includes(categoryRaw)
    ? categoryRaw
    : "";
  const difficulty: Difficulty | "" = (DIFFICULTIES as readonly string[]).includes(
    difficultyRaw,
  )
    ? (difficultyRaw as Difficulty)
    : "";

  const hasSearch = !!q || !!category || !!difficulty;
  const rows = await search({ q, category, difficulty });

  const selectStyle = {
    border: "1px solid var(--hairline)",
    borderRadius: 8,
    padding: "5px 8px",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    background: "var(--bg, #fff)",
    color: "var(--ink)",
    cursor: "pointer",
  } as const;

  return (
    <>
      <div className="admin-h">
        <h1>Question search</h1>
      </div>

      <form
        action="/admin/search"
        method="get"
        className="card"
        style={{ display: "flex", gap: 10, alignItems: "center" }}
      >
        <Ico.Search
          style={{ width: 18, height: 18, color: "var(--ink-soft)" }}
        />
        <input
          name="q"
          placeholder="Search by text or ID…"
          defaultValue={q}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: 16,
            background: "transparent",
            color: "var(--ink)",
          }}
        />
        <select name="category" defaultValue={category} style={selectStyle}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="difficulty" defaultValue={difficulty} style={selectStyle}>
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {hasSearch && (
          <span className="chip chip--ghost">
            {rows.length} result{rows.length === 1 ? "" : "s"}
          </span>
        )}
        <button type="submit" className="admin-btn ghost">
          Search
        </button>
      </form>

      {hasSearch && rows.length > 0 && (
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Status</th>
                <th>Category</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="q-text">{r.text}</div>
                    <div className="q-meta">
                      #{r.id} · {r.difficulty} · {r.source}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <StatusChip status={r.status} />
                      {r.manuallyEdited && (
                        <span className="chip chip--yellow">Edited</span>
                      )}
                    </div>
                  </td>
                  <td
                    style={{
                      color: "var(--ink-soft)",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                    }}
                  >
                    {r.category}
                  </td>
                  <td>
                    <QuestionEditButton question={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasSearch && rows.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14,
              maxWidth: 380,
              margin: "0 auto",
            }}
          >
            No questions match. Try a different word, a numeric question ID, or
            adjust the filters.
          </p>
        </div>
      )}

      {!hasSearch && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14,
              maxWidth: 380,
              margin: "0 auto",
            }}
          >
            Type a phrase, paste a question ID, or pick a category or
            difficulty to find a question in the pool.
          </p>
        </div>
      )}
    </>
  );
}

function StatusChip({ status }: { status: "pending" | "approved" | "rejected" }) {
  if (status === "approved") {
    return <span className="chip chip--mint">Approved</span>;
  }
  if (status === "pending") {
    return <span className="chip chip--yellow">Pending</span>;
  }
  return <span className="chip chip--coral">Rejected</span>;
}
