import { and, desc, eq, gt } from "drizzle-orm";
import { questions } from "@/db/schema";
import { Ico } from "@/components/Icons";
import { QuestionActions } from "@/components/QuestionActionButtons";
import { QuestionEditButton } from "@/components/QuestionEditButton";
import { getDb } from "@/lib/db";

type QuestionRow = typeof questions.$inferSelect;

async function loadFlagged(): Promise<QuestionRow[]> {
  const db = await getDb();
  return await db
    .select()
    .from(questions)
    .where(and(eq(questions.status, "approved"), gt(questions.flagCount, 0)))
    .orderBy(desc(questions.flagCount))
    .limit(50);
}

export default async function AdminFlaggedPage() {
  const rows = await loadFlagged();

  return (
    <>
      <div className="admin-h">
        <div>
          <h1>Flagged · not yet pending</h1>
          <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            Approved questions that have collected at least one flag but
            haven&apos;t hit the auto-move threshold of 3.
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <Ico.Flag
            style={{
              width: 36,
              height: 36,
              color: "var(--ink-mute)",
              marginBottom: 12,
            }}
          />
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14,
              maxWidth: 380,
              margin: "0 auto",
            }}
          >
            No flagged questions. As soon as a user taps the flag icon mid-quiz
            it&apos;ll show up here.
          </p>
        </div>
      ) : (
        rows.map((r) => (
          <div className="card" key={r.id}>
            <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
              <Ico.Flag
                style={{
                  width: 20,
                  height: 20,
                  color: "var(--coral)",
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div className="q-text">{r.text}</div>
                <div className="q-meta">
                  {r.flagCount} flag{r.flagCount === 1 ? "" : "s"} · #{r.id} ·{" "}
                  {r.category}
                  {r.manuallyEdited && (
                    <span className="chip chip--yellow" style={{ marginLeft: 6 }}>Edited</span>
                  )}
                </div>
              </div>
              <div className="admin-actions">
                <QuestionActions
                  questionId={r.id}
                  actions={["move-to-pending", "dismiss"]}
                />
                <QuestionEditButton question={r} />
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}
