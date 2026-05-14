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
