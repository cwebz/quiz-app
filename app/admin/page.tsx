import { and, eq, gt, sql } from "drizzle-orm";
import { dailyQuizzes, questions, quizAttempts } from "@/db/schema";
import { Sparkline } from "@/components/Sparkline";
import { getDb } from "@/lib/db";
import { getUtcDateString } from "@/lib/quiz/select";

type DashboardData = {
  todayDate: string;
  totalQuestions: number;
  approvedQuestions: number;
  pendingQuestions: number;
  rejectedQuestions: number;
  flaggedActive: number;
  todayAttempts: number;
  todayAvgScore: number | null;
  todayDistribution: number[];
  hasTodayQuiz: boolean;
};

async function loadDashboard(): Promise<DashboardData> {
  const db = await getDb();
  const today = getUtcDateString();

  const [
    [totalRow],
    [approvedRow],
    [pendingRow],
    [rejectedRow],
    [flaggedRow],
    [todayQuiz],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(questions),
    db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(eq(questions.status, "approved")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(eq(questions.status, "pending")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(eq(questions.status, "rejected")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(questions)
      .where(and(eq(questions.status, "approved"), gt(questions.flagCount, 0))),
    db
      .select()
      .from(dailyQuizzes)
      .where(eq(dailyQuizzes.quizDate, today))
      .limit(1),
  ]);

  let todayAttempts = 0;
  let todayAvgScore: number | null = null;
  const distribution = [0, 0, 0, 0, 0, 0];
  if (todayQuiz) {
    const attempts = await db
      .select({ score: quizAttempts.score })
      .from(quizAttempts)
      .where(eq(quizAttempts.dailyQuizId, todayQuiz.id));
    todayAttempts = attempts.length;
    if (attempts.length > 0) {
      const total = attempts.reduce((s, a) => s + a.score, 0);
      todayAvgScore = total / attempts.length;
      for (const a of attempts) {
        const idx = Math.max(0, Math.min(5, a.score));
        distribution[idx]++;
      }
    }
  }

  return {
    todayDate: today,
    totalQuestions: totalRow?.count ?? 0,
    approvedQuestions: approvedRow?.count ?? 0,
    pendingQuestions: pendingRow?.count ?? 0,
    rejectedQuestions: rejectedRow?.count ?? 0,
    flaggedActive: flaggedRow?.count ?? 0,
    todayAttempts,
    todayAvgScore,
    todayDistribution: distribution,
    hasTodayQuiz: !!todayQuiz,
  };
}

function fmtDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function AdminDashboardPage() {
  const data = await loadDashboard();

  // TODO Phase 3+: replace stubbed time series with real D1 rollups.
  const stubAttemptSpark = [820, 910, 870, 1100, 1240, 1180, 1290, 1340];
  const stubAvgSpark = [2.6, 2.7, 2.8, 2.7, 2.9, 2.85, 2.8, 2.84];
  const stubSignupSpark = [14, 18, 22, 28, 30, 38, 42];
  const stubPoolSpark = [1390, 1395, 1402, 1410, 1420, 1425, data.approvedQuestions];

  return (
    <>
      <div className="admin-h">
        <div>
          <h1>Operations</h1>
          <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            {fmtDateLong(data.todayDate)} ·{" "}
            {data.hasTodayQuiz
              ? "today's quiz is live"
              : "no quiz scheduled for today"}
          </div>
        </div>
        <div className="row">
          <a href="/admin/preview" className="admin-btn ghost">
            See tomorrow&apos;s quiz
          </a>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="lbl">Today&apos;s attempts</div>
          <div className="num">{data.todayAttempts.toLocaleString()}</div>
          <div>
            <span className="delta flat">live</span>
          </div>
          <Sparkline values={stubAttemptSpark} color="var(--primary)" />
        </div>
        <div className="kpi">
          <div className="lbl">Avg score today</div>
          <div className="num">
            {data.todayAvgScore !== null
              ? data.todayAvgScore.toFixed(2)
              : "—"}
          </div>
          <div>
            <span className="delta flat">/ 5 correct</span>
          </div>
          <Sparkline values={stubAvgSpark} color="var(--mint)" />
        </div>
        <div className="kpi">
          <div className="lbl">Pending review</div>
          <div className="num">{data.pendingQuestions.toLocaleString()}</div>
          <div>
            <span
              className={
                data.pendingQuestions > 0 ? "delta down" : "delta flat"
              }
            >
              {data.pendingQuestions > 0
                ? `${data.pendingQuestions} to review`
                : "nothing waiting"}
            </span>
          </div>
          <Sparkline values={stubSignupSpark} color="var(--pink)" />
        </div>
        <div className="kpi">
          <div className="lbl">Approved pool</div>
          <div className="num">{data.approvedQuestions.toLocaleString()}</div>
          <div>
            <span
              className={
                data.approvedQuestions >= 1000
                  ? "delta up"
                  : data.approvedQuestions >= 500
                    ? "delta flat"
                    : "delta down"
              }
            >
              {data.approvedQuestions >= 1000
                ? "healthy"
                : data.approvedQuestions >= 500
                  ? "watch"
                  : "low — top up"}
            </span>
          </div>
          <Sparkline values={stubPoolSpark} color="var(--orange)" />
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div className="section-h" style={{ marginBottom: 0 }}>
            Operating cost — this month
          </div>
          <span className="chip chip--mint">Phase 5</span>
        </div>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 13,
            marginTop: 8,
            marginBottom: 0,
          }}
        >
          Real spend data lands in Phase 5 once we have a deploy hitting
          Cloudflare APIs.
        </p>
      </div>

      <div className="card">
        <div className="row between">
          <div className="section-h" style={{ marginBottom: 0 }}>
            Today&apos;s score distribution
          </div>
          <span className="chip chip--ghost">
            {data.todayAttempts === 0
              ? "no attempts yet"
              : `${data.todayAttempts} attempt${data.todayAttempts === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="histogram" style={{ marginTop: 14 }}>
          {(() => {
            // Scale relative to the bucket with the most attempts so the
            // tallest bar fills the card and the rest are proportional.
            const maxBucket = Math.max(...data.todayDistribution, 1);
            const maxBarPx = 80;
            return data.todayDistribution.map((p, i) => {
              const pct =
                data.todayAttempts === 0
                  ? 0
                  : Math.round((p / data.todayAttempts) * 100);
              const barPx =
                data.todayAttempts === 0
                  ? 8
                  : Math.max(8, Math.round((p / maxBucket) * maxBarPx));
              return (
                <div
                  // biome-ignore lint: deterministic
                  key={i}
                  className="histogram-col"
                >
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 12,
                      color: "var(--ink-soft)",
                    }}
                  >
                    {pct}%
                  </div>
                  <div
                    className="histogram-bar"
                    style={{
                      height: `${barPx}px`,
                      background: i === 5 ? "var(--mint)" : "var(--primary)",
                    }}
                  />
                  <div className="histogram-label">{i}/5</div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div className="section-h" style={{ marginBottom: 0 }}>
            Question pool breakdown
          </div>
          <span className="chip chip--ghost">{data.totalQuestions} total</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 14,
            flexWrap: "wrap",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
          }}
        >
          <PoolStat
            label="Approved"
            value={data.approvedQuestions}
            color="var(--mint-dark)"
          />
          <PoolStat
            label="Pending"
            value={data.pendingQuestions}
            color="var(--orange)"
          />
          <PoolStat
            label="Rejected"
            value={data.rejectedQuestions}
            color="var(--coral-dark)"
          />
          <PoolStat
            label="Flagged"
            value={data.flaggedActive}
            color="var(--ink-soft)"
          />
        </div>
      </div>
    </>
  );
}

function PoolStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 24, color }}>{value.toLocaleString()}</div>
    </div>
  );
}
