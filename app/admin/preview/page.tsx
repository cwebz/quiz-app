import { eq, inArray, sql } from "drizzle-orm";
import { dailyQuizzes, questions } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getUtcDateString } from "@/lib/quiz/select";
import { SelectQuizButton } from "./SelectQuizButton";
import { SwapButton } from "./SwapButton";

type QuestionRow = typeof questions.$inferSelect;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function loadQuiz(date: string): Promise<{
  date: string;
  questions: QuestionRow[];
} | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, date))
    .limit(1);
  if (!row) return null;
  const qs = await db
    .select()
    .from(questions)
    .where(inArray(questions.id, row.questionIds));
  // Preserve the quiz's order
  const byId = new Map(qs.map((q) => [q.id, q]));
  const ordered = row.questionIds
    .map((id) => byId.get(id))
    .filter((q): q is QuestionRow => !!q);
  return { date: row.quizDate, questions: ordered };
}

async function loadPoolSize(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questions)
    .where(eq(questions.status, "approved"));
  return row?.count ?? 0;
}

export default async function AdminPreviewPage() {
  const today = getUtcDateString();
  const tomorrow = addDays(today, 1);

  const [tomorrowQuiz, todayQuiz, poolSize] = await Promise.all([
    loadQuiz(tomorrow),
    loadQuiz(today),
    loadPoolSize(),
  ]);

  return (
    <>
      <div className="admin-h">
        <div>
          <h1>Tomorrow&apos;s quiz</h1>
          <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            Locks in at 23:55 UTC · selected from {poolSize.toLocaleString()}{" "}
            approved · weighted by recency
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div className="section-h" style={{ marginBottom: 0 }}>
            {fmtDateLong(tomorrow)} · UTC
          </div>
          {tomorrowQuiz ? (
            <span className="chip chip--mint">Queued</span>
          ) : (
            <SelectQuizButton date={tomorrow} label="Pre-select now" />
          )}
        </div>

        {tomorrowQuiz ? (
          <div style={{ marginTop: 12 }}>
            {tomorrowQuiz.questions.map((q, i) => (
              <QuestionRowDisplay
                key={q.id}
                index={i}
                question={q}
                first={i === 0}
                date={tomorrowQuiz.date}
              />
            ))}
          </div>
        ) : (
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14,
              marginTop: 14,
              marginBottom: 0,
            }}
          >
            Tomorrow&apos;s quiz hasn&apos;t been queued yet. Until the cron is
            wired up (Phase 5 follow-up), use the button above to pre-select
            it.
          </p>
        )}
      </div>

      <div className="admin-h" style={{ marginTop: 8 }}>
        <h1 style={{ fontSize: 22 }}>Live now</h1>
      </div>
      <div className="card">
        <div className="row between">
          <div className="section-h" style={{ marginBottom: 0 }}>
            {fmtDateLong(today)} · UTC
          </div>
          {todayQuiz ? (
            <span className="chip chip--mint">Live</span>
          ) : (
            <SelectQuizButton date={today} label="Select today's quiz" />
          )}
        </div>
        {todayQuiz ? (
          <div style={{ marginTop: 12 }}>
            {todayQuiz.questions.map((q, i) => (
              <QuestionRowDisplay
                key={q.id}
                index={i}
                question={q}
                first={i === 0}
                date={todayQuiz.date}
              />
            ))}
          </div>
        ) : (
          <p
            style={{
              color: "var(--ink-soft)",
              fontSize: 14,
              marginTop: 14,
              marginBottom: 0,
            }}
          >
            No quiz selected for today yet.
          </p>
        )}
      </div>
    </>
  );
}

function QuestionRowDisplay({
  index,
  question,
  first,
  date,
}: {
  index: number;
  question: QuestionRow;
  first: boolean;
  date: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 14,
        padding: "14px 0",
        borderTop: first ? "none" : "1px solid var(--hairline)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          background: "var(--primary-soft)",
          color: "var(--primary-dark)",
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
        }}
      >
        {index + 1}
      </div>
      <div>
        <div className="q-text">{question.text}</div>
        <div className="q-meta">
          <span
            className="chip chip--blue"
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            {question.category}
          </span>
          · {question.difficulty} · #{question.id}
        </div>
        {date > getUtcDateString() && (
          <SwapButton date={date} outId={question.id} outText={question.text} />
        )}
      </div>
    </div>
  );
}
