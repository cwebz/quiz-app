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

  // Grab a random pool of approved questions, then split into "fresh" and
  // "fallback" client-side. This avoids gnarly NOT IN with json_each in SQL
  // and works fine at our scale (a few thousand approved questions).
  const pool = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.status, "approved"))
    .orderBy(sql`RANDOM()`)
    .limit(200);

  if (pool.length < QUESTIONS_PER_QUIZ) {
    throw new Error(
      `Not enough approved questions: have ${pool.length}, need ${QUESTIONS_PER_QUIZ}`,
    );
  }

  const fresh: number[] = [];
  const fallback: number[] = [];
  for (const row of pool) {
    if (recentlyUsed.has(row.id)) fallback.push(row.id);
    else fresh.push(row.id);
    if (fresh.length === QUESTIONS_PER_QUIZ) break;
  }
  const chosen = fresh.slice(0, QUESTIONS_PER_QUIZ);
  for (const id of fallback) {
    if (chosen.length >= QUESTIONS_PER_QUIZ) break;
    chosen.push(id);
  }

  if (chosen.length < QUESTIONS_PER_QUIZ) {
    throw new Error(
      `Could not assemble ${QUESTIONS_PER_QUIZ} questions; got ${chosen.length}`,
    );
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

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
