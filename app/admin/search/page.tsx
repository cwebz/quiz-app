import { sql } from "drizzle-orm";
import { questions } from "@/db/schema";
import { Ico } from "@/components/Icons";
import { getDb } from "@/lib/db";

type QuestionRow = typeof questions.$inferSelect;

async function search(q: string): Promise<QuestionRow[]> {
  if (!q.trim()) return [];
  const db = await getDb();
  const numericId = /^\d+$/.test(q.trim()) ? Number.parseInt(q.trim(), 10) : null;
  const like = `%${q.trim()}%`;
  return await db
    .select()
    .from(questions)
    .where(
      numericId !== null
        ? sql`${questions.id} = ${numericId} OR ${questions.text} LIKE ${like}`
        : sql`${questions.text} LIKE ${like}`,
    )
    .limit(50);
}

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.toString() ?? "";
  const rows = await search(q);

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
        {q && (
          <span className="chip chip--ghost">
            {rows.length} result{rows.length === 1 ? "" : "s"}
          </span>
        )}
        <button type="submit" className="admin-btn ghost">
          Search
        </button>
      </form>

      {q && rows.length > 0 && (
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
                    <StatusChip status={r.status} />
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
                    {/* TODO Phase 5: question detail/edit modal */}
                    <button type="button" className="admin-btn ghost">
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {q && rows.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14,
              maxWidth: 380,
              margin: "0 auto",
            }}
          >
            No questions match <strong>{q}</strong>. Try a different word or a
            numeric question ID.
          </p>
        </div>
      )}

      {!q && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14,
              maxWidth: 380,
              margin: "0 auto",
            }}
          >
            Type a phrase or paste a question ID to find a question in the
            pool.
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
