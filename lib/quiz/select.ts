import { eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { dailyQuizzes, questions } from "../../db/schema";

export type DB = DrizzleD1Database<Record<string, never>>;

const QUESTIONS_PER_QUIZ = 5;
const REUSE_AVOIDANCE_DAYS = 90;

export type SelectionResult = {
  id: number;
  quizDate: string;
  questionIds: number[];
  reused: boolean;
};

/**
 * Selects 5 approved questions for `quizDate` (UTC ISO date),
 * preferring questions not used in the last 90 days. Idempotent:
 * if a quiz already exists for the date, returns it unchanged.
 */
export async function selectDailyQuiz(
  db: DB,
  quizDate: string,
): Promise<SelectionResult> {
  const existing = await db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, quizDate))
    .limit(1);

  if (existing.length > 0) {
    return {
      id: existing[0].id,
      quizDate: existing[0].quizDate,
      questionIds: existing[0].questionIds,
      reused: true,
    };
  }

  const recentlyUsed = await collectRecentlyUsedQuestionIds(db, quizDate);

  // Fetch every approved question (id + category) in random order.
  // No LIMIT so all categories are always represented in the pool.
  // At ~2k rows this is trivial; revisit with per-category queries if > ~50k.
  const pool = await db
    .select({ id: questions.id, category: questions.category })
    .from(questions)
    .where(eq(questions.status, "approved"))
    .orderBy(sql`RANDOM()`);

  // Group by category. Within each bucket the order is already random.
  const byCategory = new Map<string, number[]>();
  for (const row of pool) {
    const bucket = byCategory.get(row.category);
    if (bucket) bucket.push(row.id);
    else byCategory.set(row.category, [row.id]);
  }

  if (byCategory.size < QUESTIONS_PER_QUIZ) {
    throw new Error(
      `Not enough categories with approved questions: have ${byCategory.size} (${[...byCategory.keys()].join(", ")}), need ${QUESTIONS_PER_QUIZ}`,
    );
  }

  // Shuffle the category list so which 5 categories appear is random each day.
  const categories = [...byCategory.keys()];
  shuffleInPlace(categories);

  // Pick one question per category, preferring fresh (not recently used).
  const chosen: number[] = [];
  for (const cat of categories) {
    if (chosen.length >= QUESTIONS_PER_QUIZ) break;
    const bucket = byCategory.get(cat)!;
    const fresh = bucket.find((id) => !recentlyUsed.has(id));
    chosen.push(fresh ?? bucket[0]); // fallback to first (random) if all recently used
  }

  const inserted = await db
    .insert(dailyQuizzes)
    .values({ quizDate, questionIds: chosen })
    .returning({ id: dailyQuizzes.id });

  return {
    id: inserted[0].id,
    quizDate,
    questionIds: chosen,
    reused: false,
  };
}

async function collectRecentlyUsedQuestionIds(
  db: DB,
  quizDate: string,
): Promise<Set<number>> {
  const cutoff = subtractDays(quizDate, REUSE_AVOIDANCE_DAYS);
  const recent = await db
    .select({ questionIds: dailyQuizzes.questionIds })
    .from(dailyQuizzes)
    .where(sql`${dailyQuizzes.quizDate} >= ${cutoff}`);

  const used = new Set<number>();
  for (const row of recent) {
    for (const id of row.questionIds) {
      used.add(id);
    }
  }
  return used;
}

export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve the quiz date from a client-supplied local date string.
 *
 * Accepts UTC today or UTC tomorrow (diffDays ∈ {0, 1}). This covers all
 * positive UTC offsets: a UTC+14 user at local midnight sends localDate =
 * UTC+1 day, which is legitimate. The 23:55 UTC cron seeds quizzes 2 days
 * ahead, so tomorrow's row is always present when needed.
 *
 * Rejects yesterday and earlier to prevent guests from replaying prior-day
 * quizzes via a stale or manually set date. UTC-12 users at local midnight
 * send localDate = UTC today (their midnight is UTC noon), so they are
 * unaffected by this restriction.
 *
 * Known trade-off: any client can send localDate = utcTomorrow to preview
 * tomorrow's questions up to ~24h early. Acceptable for trivia; revisit if
 * quizzes become competitive.
 *
 * Falls back to UTC today if the value is missing, malformed, or out of range.
 */
export function resolveQuizDate(clientDate: string | null | undefined): string {
  const utcToday = getUtcDateString();
  if (!clientDate || !/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) return utcToday;
  // Parse as explicit UTC midnight to avoid local-tz skew on the server.
  const parsed = new Date(`${clientDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return utcToday;
  // Round-trip check: rejects impossible dates like "2026-02-30" that JS
  // silently normalises (e.g. to 2026-03-02) rather than returning NaN.
  if (parsed.toISOString().slice(0, 10) !== clientDate) return utcToday;
  const diffDays = (parsed.getTime() - new Date(`${utcToday}T00:00:00Z`).getTime()) / 86_400_000;
  if (diffDays < 0 || diffDays > 1) {
    console.warn("[resolveQuizDate] out-of-range localDate rejected", { clientDate, utcToday });
    return utcToday;
  }
  return clientDate;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
