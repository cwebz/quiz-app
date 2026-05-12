import { desc, eq } from "drizzle-orm";
import { questions } from "@/db/schema";
import { QuestionActions } from "@/components/QuestionActionButtons";
import { getDb } from "@/lib/db";

type QuestionRow = typeof questions.$inferSelect;

async function loadPending(): Promise<QuestionRow[]> {
  const db = await getDb();
  return await db
    .select()
    .from(questions)
    .where(eq(questions.status, "pending"))
    .orderBy(desc(questions.flagCount), desc(questions.createdAt))
    .limit(50);
}

export default async function AdminPendingPage() {
  const rows = await loadPending();

  return (
    <>
      <div className="admin-h">
        <div>
          <h1>Pending review</h1>
          <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            {rows.length === 0
              ? "Nothing waiting. Questions land here once they hit 3+ flags."
              : `${rows.length} question${rows.length === 1 ? "" : "s"} auto-flagged from user reports · approve to return to pool`}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 12 }}>
            ⏳
          </div>
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14,
              maxWidth: 380,
              margin: "0 auto",
            }}
          >
            The pending queue is empty. As users flag questions during play,
            anything that accumulates 3+ flags will auto-move here for your
            review.
          </p>
        </div>
      ) : (
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th style={{ width: "55%" }}>Question</th>
                <th>Category</th>
                <th>Flags</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="q-text">{r.text}</div>
                    <div className="q-answers">
                      <span className="q-answer ok">✓ {r.correctAnswer}</span>
                      {r.incorrectAnswers.map((a) => (
                        <span key={a} className="q-answer">
                          {a}
                        </span>
                      ))}
                    </div>
                    <div className="q-meta">
                      #{r.id} · {r.difficulty}
                    </div>
                  </td>
                  <td>
                    <span className="chip chip--blue">{r.category}</span>
                  </td>
                  <td>
                    <span className="chip chip--coral">{r.flagCount}</span>
                  </td>
                  <td
                    style={{
                      color: "var(--ink-soft)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {r.source}
                  </td>
                  <td>
                    <QuestionActions
                      questionId={r.id}
                      actions={["approve", "reject"]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
