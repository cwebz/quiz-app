import { and, count, desc, eq, like, or, type SQL } from "drizzle-orm";
import { questions } from "@/db/schema";
import { Ico } from "@/components/Icons";
import { QuestionActions } from "@/components/QuestionActionButtons";
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

const SOURCES = ["the-trivia-api", "opentdb", "claude-generated"] as const;
type Source = (typeof SOURCES)[number];

const SOURCE_LABELS: Record<Source, string> = {
  "the-trivia-api": "The Trivia API",
  "opentdb": "Open Trivia DB",
  "claude-generated": "Claude",
};

const PAGE_SIZE = 25;

async function search({
  q,
  category,
  difficulty,
  source,
  page,
}: {
  q: string;
  category: string;
  difficulty: Difficulty | "";
  source: Source | "";
  page: number;
}): Promise<{ rows: QuestionRow[]; total: number }> {
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
  if (source) conditions.push(eq(questions.source, source));

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(questions).where(where);
  const rows = await db
    .select()
    .from(questions)
    .where(where)
    .orderBy(desc(questions.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  return { rows, total };
}

function buildUrl(params: Record<string, string | number>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v !== 0) sp.set(k, String(v));
  }
  return `/admin/search?${sp.toString()}`;
}

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; difficulty?: string; source?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.toString() ?? "";
  const categoryRaw = params.category?.toString() ?? "";
  const difficultyRaw = params.difficulty?.toString() ?? "";
  const sourceRaw = params.source?.toString() ?? "";
  const pageRaw = Number.parseInt(params.page?.toString() ?? "0", 10);
  const page = Number.isNaN(pageRaw) || pageRaw < 0 ? 0 : pageRaw;

  const category = (CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : "";
  const difficulty: Difficulty | "" = (DIFFICULTIES as readonly string[]).includes(difficultyRaw)
    ? (difficultyRaw as Difficulty)
    : "";
  const source: Source | "" = (SOURCES as readonly string[]).includes(sourceRaw)
    ? (sourceRaw as Source)
    : "";

  const { rows, total } = await search({ q, category, difficulty, source, page });
  const totalPages = Math.ceil(total / PAGE_SIZE);

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

  const currentParams = { q, category, difficulty, source };

  return (
    <>
      <div className="admin-h">
        <h1>Question search</h1>
      </div>

      <form
        action="/admin/search"
        method="get"
        className="card"
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        {/* Search input row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Ico.Search style={{ width: 18, height: 18, color: "var(--ink-soft)", flexShrink: 0 }} />
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
        </div>
        {/* Filters row */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select name="category" defaultValue={category} style={selectStyle}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select name="difficulty" defaultValue={difficulty} style={selectStyle}>
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select name="source" defaultValue={source} style={selectStyle}>
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
            ))}
          </select>
          <button type="submit" className="admin-btn ghost">Search</button>
          {total > 0 && (
            <span className="chip chip--ghost" style={{ marginLeft: "auto" }}>
              {total.toLocaleString()} question{total === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </form>

      {rows.length > 0 && (
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
                      #{r.id} · {r.difficulty} · {SOURCE_LABELS[r.source as Source] ?? r.source}
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
                    <div className="admin-actions">
                      <QuestionActions
                        questionId={r.id}
                        actions={["reject"]}
                      />
                      <QuestionEditButton question={r} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, maxWidth: 380, margin: "0 auto" }}>
            No questions match. Try a different word, a numeric question ID, or adjust the filters.
          </p>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", padding: "8px 0" }}>
          {page > 0 ? (
            <a href={buildUrl({ ...currentParams, page: page - 1 })} className="admin-btn ghost">
              ← Prev
            </a>
          ) : (
            <span className="admin-btn ghost" style={{ opacity: 0.4, cursor: "default" }}>← Prev</span>
          )}
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            {page + 1} / {totalPages}
          </span>
          {page + 1 < totalPages ? (
            <a href={buildUrl({ ...currentParams, page: page + 1 })} className="admin-btn ghost">
              Next →
            </a>
          ) : (
            <span className="admin-btn ghost" style={{ opacity: 0.4, cursor: "default" }}>Next →</span>
          )}
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
