import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
  categoryMastery,
  questionResponses,
  questions,
  quizAttempts,
  userStats,
} from "../../db/schema";

type DB = DrizzleD1Database<Record<string, never>>;

/**
 * Adopt all guest-bound quiz_attempts for a guestId into a userId.
 * Returns the number of rows actually adopted (some may collide with the
 * unique(user_id, daily_quiz_id) constraint and are left as orphans).
 */
export async function adoptGuestAttempts(
  db: DB,
  userId: number,
  guestId: string,
): Promise<number> {
  const orphans = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.guestId, guestId), isNull(quizAttempts.userId)),
    );

  let adopted = 0;
  for (const o of orphans) {
    try {
      await db
        .update(quizAttempts)
        .set({ userId, guestId: null })
        .where(eq(quizAttempts.id, o.id));
      adopted += 1;
    } catch {
      // unique(user_id, daily_quiz_id) conflict: user already has an attempt
      // for that day. Leave the orphan row alone.
    }
  }
  return adopted;
}

function getIsoWeekMonday(date: Date = new Date()): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * Seed user_stats and category_mastery for a brand-new user by scanning the
 * quiz_attempts and question_responses they just adopted. Only safe to call
 * when the user has no existing rollup rows (e.g., first sign-in).
 *
 * Streak math is approximate for adopted history: we count consecutive UTC
 * days back from the most recent completed_at, with no freeze accounting.
 * In practice the adopted attempt is almost always today, so this is fine.
 */
export async function seedRollupsForNewUser(
  db: DB,
  userId: number,
): Promise<void> {
  const attempts = await db
    .select({
      id: quizAttempts.id,
      finalScore: quizAttempts.finalScore,
      score: quizAttempts.score,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, userId));

  if (attempts.length === 0) return;

  let totalQuizzes = 0;
  let totalCorrect = 0;
  let lifetimeScore = 0;
  let bestScore = 0;
  let perfectScores = 0;
  let lastPlayedDate: string | null = null;

  // Distinct UTC dates (YYYY-MM-DD) the user has completed an attempt on.
  const playedDates = new Set<string>();
  for (const a of attempts) {
    totalQuizzes += 1;
    totalCorrect += a.score;
    lifetimeScore += a.finalScore;
    if (a.finalScore > bestScore) bestScore = a.finalScore;
    if (a.score === 5) perfectScores += 1;
    const date = a.completedAt.slice(0, 10);
    playedDates.add(date);
    if (!lastPlayedDate || date > lastPlayedDate) {
      lastPlayedDate = date;
    }
  }

  // Current streak: walk back from lastPlayedDate counting consecutive days.
  // Longest streak: scan the sorted distinct dates.
  const sortedDates = Array.from(playedDates).sort();
  let longestStreak = 0;
  let runLen = 0;
  let prev: string | null = null;
  for (const d of sortedDates) {
    if (prev === null) {
      runLen = 1;
    } else {
      const pd = new Date(`${prev}T00:00:00Z`);
      pd.setUTCDate(pd.getUTCDate() + 1);
      const nextOfPrev = pd.toISOString().slice(0, 10);
      runLen = d === nextOfPrev ? runLen + 1 : 1;
    }
    if (runLen > longestStreak) longestStreak = runLen;
    prev = d;
  }

  let currentStreak = 0;
  if (lastPlayedDate) {
    currentStreak = 1;
    const cursor = new Date(`${lastPlayedDate}T00:00:00Z`);
    while (true) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const prevDay = cursor.toISOString().slice(0, 10);
      if (playedDates.has(prevDay)) {
        currentStreak += 1;
      } else {
        break;
      }
    }
  }

  // Upsert user_stats. There may already be a default row from the prior
  // INSERT in the auth jwt callback — overwrite it.
  const [existing] = await db
    .select({ userId: userStats.userId })
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);
  const row = {
    userId,
    currentStreak,
    longestStreak,
    totalQuizzes,
    totalCorrect,
    lifetimeScore,
    bestScore,
    lastPlayedDate,
    freezesUsedThisWeek: 0,
    weekStartDate: getIsoWeekMonday(),
    perfectScores,
    comebackEarned: false,
  };
  if (existing) {
    await db.update(userStats).set(row).where(eq(userStats.userId, userId));
  } else {
    await db.insert(userStats).values(row);
  }

  // Seed category_mastery from question_responses joined to questions.category.
  const responses = await db
    .select({
      questionId: questionResponses.questionId,
      wasCorrect: questionResponses.wasCorrect,
      attemptUserId: quizAttempts.userId,
      category: questions.category,
    })
    .from(questionResponses)
    .innerJoin(
      quizAttempts,
      eq(questionResponses.quizAttemptId, quizAttempts.id),
    )
    .innerJoin(questions, eq(questionResponses.questionId, questions.id))
    .where(eq(quizAttempts.userId, userId));

  const tallies = new Map<
    string,
    { questionsSeen: number; questionsCorrect: number }
  >();
  for (const r of responses) {
    const t = tallies.get(r.category) ?? {
      questionsSeen: 0,
      questionsCorrect: 0,
    };
    t.questionsSeen += 1;
    if (r.wasCorrect) t.questionsCorrect += 1;
    tallies.set(r.category, t);
  }

  for (const [category, tally] of tallies) {
    await db.insert(categoryMastery).values({
      userId,
      category,
      questionsSeen: tally.questionsSeen,
      questionsCorrect: tally.questionsCorrect,
    });
  }
}
