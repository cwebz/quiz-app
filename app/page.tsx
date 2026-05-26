import { eq } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { HomeDateSync } from "@/components/HomeDateSync";
import { ScoreRing } from "@/components/ScoreRing";
import { Ico } from "@/components/Icons";
import { Mascot } from "@/components/Mascot";
import { dailyQuizzes } from "@/db/schema";
import { getDb } from "@/lib/db";
import { findExistingAttempt, type QuizResults } from "@/lib/quiz/play";
import { resolveQuizDate } from "@/lib/quiz/select";

/**
 * Format a YYYY-MM-DD string as a long human label.
 * Parsed at UTC noon so timezone math can't shift the displayed day.
 */
function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function subtractOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function loadHomeState(today: string) {
  const session = await auth();
  const userId = session?.userId ?? null;
  const yesterday = subtractOneDay(today);

  const db = await getDb();
  const [quiz] = await db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, today))
    .limit(1);

  let alreadyPlayed = null;
  if (quiz && userId !== null) {
    alreadyPlayed = await findExistingAttempt({
      db,
      dailyQuizId: quiz.id,
      userId,
      guestId: null,
    });
  }

  let yesterdayResult: QuizResults | null = null;
  if (userId !== null && !alreadyPlayed) {
    const [yQuiz] = await db
      .select()
      .from(dailyQuizzes)
      .where(eq(dailyQuizzes.quizDate, yesterday))
      .limit(1);
    if (yQuiz) {
      yesterdayResult = await findExistingAttempt({
        db,
        dailyQuizId: yQuiz.id,
        userId,
        guestId: null,
      });
    }
  }

  return { today, hasQuiz: !!quiz, alreadyPlayed, yesterdayResult };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // Resolve the user's local date in this order:
  //   1. ?date= URL param (set by the client redirect on first visit)
  //   2. stti.local_date cookie (set by the client on every mount)
  //   3. UTC fallback (first visit before any client JS runs)
  // resolveQuizDate validates the value is within ±1 day of UTC so we never
  // honor a stale or malicious date.
  const params = await searchParams;
  const cookieDate = (await cookies()).get("stti.local_date")?.value;
  const today = resolveQuizDate(params.date ?? cookieDate ?? null);

  let state: Awaited<ReturnType<typeof loadHomeState>>;
  try {
    state = await loadHomeState(today);
  } catch {
    state = { today, hasQuiz: false, alreadyPlayed: null, yesterdayResult: null };
  }
  const { hasQuiz, alreadyPlayed, yesterdayResult } = state;

  return (
    <div className="landing">
      <HomeDateSync serverDate={today} />
      <div className="landing-date">
        <Ico.Calendar
          style={{
            width: 14,
            height: 14,
            verticalAlign: "-2px",
            marginRight: 6,
            display: "inline-block",
          }}
        />
        Daily quiz · {fmtDate(today)}
      </div>

      <div className="landing-mascot">
        <Mascot size={160} />
      </div>

      <h1>
        Are you smarter than <em>the internet?</em>
      </h1>
      <p className="landing-sub">
        Five questions. Twenty seconds each. See where you rank against everyone
        else who plays today.
      </p>

      {yesterdayResult && <YesterdayBadge result={yesterdayResult} />}

      {!hasQuiz ? (
        <p
          style={{
            background: "var(--bg-card)",
            border: "2px solid var(--hairline)",
            borderRadius: "var(--r-md)",
            padding: "12px 18px",
            color: "var(--ink-soft)",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Today&apos;s quiz hasn&apos;t been queued yet. Check back shortly.
        </p>
      ) : alreadyPlayed ? (
        <PlayedTodayCard
          correct={alreadyPlayed.correctCount}
          total={alreadyPlayed.perQuestion.length}
          percentile={alreadyPlayed.percentile}
          totalPlayersToday={alreadyPlayed.totalPlayersToday}
        />
      ) : (
        <Link href="/quiz/play" className="btn btn--xl">
          Start today&apos;s quiz{" "}
          <Ico.ArrowRight style={{ width: 22, height: 22 }} />
        </Link>
      )}
    </div>
  );
}

function YesterdayBadge({ result }: { result: QuizResults }) {
  const top = Math.max(1, 100 - result.percentile);
  const label =
    result.percentile >= 50
      ? `Yesterday · Top ${top}%`
      : `Yesterday · you beat ${result.percentile}% of players`;
  return (
    <div style={{ marginBottom: 24 }}>
      <span className="chip chip--ghost">{label}</span>
    </div>
  );
}

function PlayedTodayCard({
  correct,
  total,
  percentile,
  totalPlayersToday,
}: {
  correct: number;
  total: number;
  percentile: number;
  totalPlayersToday: number;
}) {
  return (
    <div
      className="card"
      style={{
        marginTop: 4,
        marginBottom: 18,
        width: "100%",
        maxWidth: 460,
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <ScoreRing score={correct} total={total} size={88} />
        <div>
          <div className="chip chip--mint">Played today</div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              marginTop: 6,
            }}
          >
            You scored {correct}/{total}
          </div>
          <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            {totalPlayersToday <= 1
              ? "First player today. Come back later to see how others did."
              : `Top ${Math.max(1, 100 - percentile)}% so far · come back at midnight UTC for a new quiz`}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Link href="/quiz/play" className="btn btn--ghost">
          See results
        </Link>
        <Link href="/profile" className="btn btn--ghost">
          View stats
        </Link>
      </div>
    </div>
  );
}
