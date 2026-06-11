import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
  categoryMastery,
  dailyQuizzes,
  friendships,
  questionResponses,
  questions,
  quizAttempts,
  users,
  userStats,
} from "../../db/schema";
import { getQuestionStats, recordAnswer } from "./question-stats";
import {
  correctCount,
  finalScore,
  NETWORK_GRACE_MS,
  QUESTION_TIME_LIMIT_MS,
  questionScore,
} from "./scoring";
import {
  signAdvanceToken,
  signToken,
  verifyAdvanceToken,
  verifyToken,
  type AdvanceState,
  type AnsweredQuestion,
  type QuizSessionState,
} from "./token";

type DB = DrizzleD1Database<Record<string, never>>;
type QuestionRow = typeof questions.$inferSelect;

export type PublicQuestion = {
  id: number;
  text: string;
  category: string;
  difficulty: string;
  options: string[];
};

export type QuestionFeedback = {
  questionId: number;
  userAnswer: string;
  correctAnswer: string;
  wasCorrect: boolean;
  timeTakenMs: number;
  pointsEarned: number;
  /** Lifetime correct rate as a percentage 0–100, or null if no one has answered yet. */
  correctRate: number | null;
};

export type QuizResults = {
  attemptId: number;
  userId: number | null;
  correctCount: number;
  finalScore: number;
  totalTimeMs: number;
  /** % of today's players the user beat by point score (0–100). */
  percentile: number;
  /** Count of completed attempts today, including the user's. */
  totalPlayersToday: number;
  /** Score distribution for today: index = correct count (0–5), value = player count. */
  scoreDistribution: number[];
  /** Null for guests or users with no friends who played today. */
  friendsToday: Array<{
    userId: number;
    displayName: string;
    finalScore: number;
    rank: number;
  }> | null;
  /** Present only for authenticated users. */
  userStreak?: {
    current: number;
    longest: number;
    perfectScores: number;
    comebackEarned: boolean;
  };
  /** True when a weekly freeze auto-applied to preserve the user's streak. */
  freezeApplied?: boolean;
  /** True the first time ever a freeze saved this user's streak. */
  comebackJustEarned?: boolean;
  perQuestion: Array<{
    questionId: number;
    text: string;
    correctAnswer: string;
    userAnswer: string;
    wasCorrect: boolean;
    timeTakenMs: number;
    pointsEarned: number;
  }>;
};

export type StartResult = {
  token: string;
  question: PublicQuestion;
  questionIndex: number;
  totalQuestions: number;
  /** Server's serve timestamp (ms). The client anchors the countdown to this
   *  (deadline = servedAt + limit) so a reload/resume shows the true remaining
   *  time and the timer can't be reset by re-entering. */
  servedAt: number;
};

export type AnswerResult =
  | {
      kind: "next";
      feedback: QuestionFeedback;
      /** Redeem via POST /api/quiz/continue when the player clicks "Next".
       *  The next question's currentServedAt is only stamped on redemption,
       *  so time spent reading feedback doesn't eat into the next timer. */
      advanceToken: string;
      nextIndex: number;
      totalQuestions: number;
    }
  | {
      kind: "complete";
      feedback: QuestionFeedback;
      results: QuizResults;
    };

export type ContinueResult = {
  token: string;
  question: PublicQuestion;
  questionIndex: number;
  totalQuestions: number;
  /** See StartResult.servedAt. */
  servedAt: number;
};

export class QuizError extends Error {
  constructor(
    public code:
      | "invalid-token"
      | "question-not-found"
      | "quiz-not-found"
      | "already-played",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export async function buildStart(opts: {
  db: DB;
  secret: string;
  dailyQuizId: number;
  questionIds: number[];
  guestId: string | null;
  userId: number | null;
}): Promise<StartResult> {
  if (opts.questionIds.length === 0) {
    throw new QuizError("quiz-not-found", "Daily quiz has no questions");
  }
  const firstId = opts.questionIds[0];
  const q = await fetchQuestion(opts.db, firstId);

  const state: QuizSessionState = {
    dailyQuizId: opts.dailyQuizId,
    guestId: opts.guestId,
    userId: opts.userId,
    answered: [],
    currentIndex: 0,
    currentQuestionId: q.id,
    currentServedAt: Date.now(),
  };
  const token = await signToken(state, opts.secret);
  return {
    token,
    question: shuffleOptions(q, state.currentServedAt),
    questionIndex: 0,
    totalQuestions: opts.questionIds.length,
    servedAt: state.currentServedAt,
  };
}

/**
 * Rebuild an in-progress session from a token (read from the session cookie),
 * so a reload that lost client storage — iOS Safari zeroes localStorage under
 * some privacy settings — resumes the SAME question instead of starting a
 * fresh quiz. Handles both token kinds: a live session token resumes its
 * current question (original serve time preserved, so the timer reflects
 * elapsed time); an advance token (left on the feedback screen) is redeemed
 * into the next question. Returns null if the token is invalid, belongs to a
 * different identity or quiz, or is out of range.
 */
export async function resumeSession(opts: {
  db: DB;
  secret: string;
  cookieToken: string;
  dailyQuizId: number;
  userId: number | null;
  guestId: string | null;
}): Promise<StartResult | null> {
  // Signed-in callers must match the token's user (don't resume someone else's
  // session after sign-in). Guests resume any guest session presented in their
  // own first-party cookie: the guestId in localStorage is often wiped together
  // with the session (iOS), so possession of the signed cookie is the proof of
  // ownership — the guestId label alone isn't.
  const identityOk = (s: { userId: number | null }) =>
    opts.userId !== null ? s.userId === opts.userId : s.userId === null;

  // Live question (playing).
  const state = await verifyToken(opts.cookieToken, opts.secret);
  if (state) {
    if (state.dailyQuizId !== opts.dailyQuizId || !identityOk(state)) return null;
    const quiz = await opts.db
      .select()
      .from(dailyQuizzes)
      .where(eq(dailyQuizzes.id, state.dailyQuizId))
      .limit(1);
    if (quiz.length === 0) return null;
    const questionIds = quiz[0].questionIds;
    if (state.currentIndex < 0 || state.currentIndex >= questionIds.length) {
      return null;
    }
    const q = await fetchQuestion(opts.db, state.currentQuestionId);
    return {
      token: opts.cookieToken,
      question: shuffleOptions(q, state.currentServedAt),
      questionIndex: state.currentIndex,
      totalQuestions: questionIds.length,
      servedAt: state.currentServedAt,
    };
  }

  // Between questions (advance token from the feedback screen) — redeem it.
  const advance = await verifyAdvanceToken(opts.cookieToken, opts.secret);
  if (advance) {
    if (advance.dailyQuizId !== opts.dailyQuizId || !identityOk(advance)) {
      return null;
    }
    return await processContinue({
      db: opts.db,
      secret: opts.secret,
      advanceToken: opts.cookieToken,
    });
  }

  return null;
}

export async function processAnswer(opts: {
  db: DB;
  kv: KVNamespace;
  secret: string;
  token: string;
  userAnswer: string;
  receivedAt?: number;
}): Promise<AnswerResult> {
  const state = await verifyToken(opts.token, opts.secret);
  if (!state) throw new QuizError("invalid-token");

  const receivedAt = opts.receivedAt ?? Date.now();
  const timeTakenMs = clampTime(receivedAt - state.currentServedAt);

  const q = await fetchQuestion(opts.db, state.currentQuestionId);
  const timedOut = receivedAt - state.currentServedAt > QUESTION_TIME_LIMIT_MS;
  const wasCorrect = !timedOut && opts.userAnswer === q.correctAnswer;
  const points = questionScore(wasCorrect, timeTakenMs);

  // Lifetime per-question stats (PRD §9). Record this response then fetch the
  // updated rate so the player sees themselves reflected in the number.
  await recordAnswer(opts.kv, state.currentQuestionId, wasCorrect);
  const stats = await getQuestionStats(opts.kv, state.currentQuestionId);

  const justAnswered: AnsweredQuestion = {
    questionId: state.currentQuestionId,
    userAnswer: opts.userAnswer,
    wasCorrect,
    timeTakenMs,
  };
  const allAnswered = [...state.answered, justAnswered];

  const feedback: QuestionFeedback = {
    questionId: state.currentQuestionId,
    userAnswer: opts.userAnswer,
    correctAnswer: q.correctAnswer,
    wasCorrect,
    timeTakenMs,
    pointsEarned: points,
    correctRate: stats.rate,
  };

  const quiz = await opts.db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.id, state.dailyQuizId))
    .limit(1);
  if (quiz.length === 0) throw new QuizError("quiz-not-found");
  const questionIds = quiz[0].questionIds;

  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= questionIds.length) {
    const results = await persistComplete({
      db: opts.db,
      state: { ...state, answered: allAnswered },
      quizDate: quiz[0].quizDate,
    });
    return { kind: "complete", feedback, results };
  }

  // Issue an advance ticket — no question is fetched, no timer is started.
  // The client redeems this via /api/quiz/continue when the player clicks
  // Next. That redemption is when the next question's currentServedAt
  // gets stamped, so feedback time isn't deducted from the next timer.
  const advanceState: AdvanceState = {
    dailyQuizId: state.dailyQuizId,
    guestId: state.guestId,
    userId: state.userId,
    answered: allAnswered,
    nextIndex,
  };
  const advanceToken = await signAdvanceToken(advanceState, opts.secret);
  return {
    kind: "next",
    feedback,
    advanceToken,
    nextIndex,
    totalQuestions: questionIds.length,
  };
}

/**
 * Redeem an advance token into a fresh session token for the next question.
 * This is when the next question's currentServedAt is stamped — NOT when
 * the previous answer was submitted. Closes the feedback-eats-timer hole.
 */
export async function processContinue(opts: {
  db: DB;
  secret: string;
  advanceToken: string;
}): Promise<ContinueResult> {
  const advance = await verifyAdvanceToken(opts.advanceToken, opts.secret);
  if (!advance) throw new QuizError("invalid-token");

  const quiz = await opts.db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.id, advance.dailyQuizId))
    .limit(1);
  if (quiz.length === 0) throw new QuizError("quiz-not-found");
  const questionIds = quiz[0].questionIds;

  if (advance.nextIndex < 0 || advance.nextIndex >= questionIds.length) {
    throw new QuizError("invalid-token", "nextIndex out of range");
  }

  const nextQuestionId = questionIds[advance.nextIndex];
  const nextQ = await fetchQuestion(opts.db, nextQuestionId);

  const newState: QuizSessionState = {
    dailyQuizId: advance.dailyQuizId,
    guestId: advance.guestId,
    userId: advance.userId,
    answered: advance.answered,
    currentIndex: advance.nextIndex,
    currentQuestionId: nextQuestionId,
    currentServedAt: Date.now(),
  };
  const token = await signToken(newState, opts.secret);

  return {
    token,
    question: shuffleOptions(nextQ, newState.currentServedAt),
    questionIndex: advance.nextIndex,
    totalQuestions: questionIds.length,
    servedAt: newState.currentServedAt,
  };
}

/**
 * Live percentile per PRD §9. Returns the % of today's players whose
 * `final_score` is strictly less than `userFinalScore`. Total includes
 * the user's own attempt.
 */
async function computeLivePercentile(
  db: DB,
  dailyQuizId: number,
  userFinalScore: number,
): Promise<{ beat: number; total: number; percentile: number }> {
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(quizAttempts)
    .where(eq(quizAttempts.dailyQuizId, dailyQuizId));
  const [beatRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.dailyQuizId, dailyQuizId),
        lt(quizAttempts.finalScore, userFinalScore),
      ),
    );
  const total = totalRow?.count ?? 0;
  const beat = beatRow?.count ?? 0;
  const percentile = total > 0 ? Math.round((beat / total) * 100) : 0;
  return { beat, total, percentile };
}

async function persistComplete(opts: {
  db: DB;
  state: QuizSessionState;
  quizDate: string;
}): Promise<QuizResults> {
  const { db, state } = opts;
  const correct = correctCount(state.answered);
  const final = finalScore(state.answered);
  const totalTime = state.answered.reduce((s, a) => s + a.timeTakenMs, 0);

  const identityClause =
    state.userId !== null
      ? and(
          eq(quizAttempts.dailyQuizId, state.dailyQuizId),
          eq(quizAttempts.userId, state.userId),
        )
      : state.guestId !== null
        ? and(
            eq(quizAttempts.dailyQuizId, state.dailyQuizId),
            eq(quizAttempts.guestId, state.guestId),
            isNull(quizAttempts.userId),
          )
        : null;

  if (identityClause) {
    const existing = await db
      .select({ id: quizAttempts.id, finalScore: quizAttempts.finalScore })
      .from(quizAttempts)
      .where(identityClause)
      .limit(1);
    if (existing.length > 0) {
      return await loadResults(
        db,
        existing[0].id,
        state.dailyQuizId,
        existing[0].finalScore,
        state.userId,
        state.answered,
      );
    }
  }

  const inserted = await db
    .insert(quizAttempts)
    .values({
      userId: state.userId,
      guestId: state.guestId,
      dailyQuizId: state.dailyQuizId,
      score: correct,
      finalScore: final,
      totalTimeMs: totalTime,
    })
    .returning({ id: quizAttempts.id });
  const attemptId = inserted[0].id;

  if (state.answered.length > 0) {
    await db.insert(questionResponses).values(
      state.answered.map((a) => ({
        quizAttemptId: attemptId,
        questionId: a.questionId,
        userAnswer: a.userAnswer,
        wasCorrect: a.wasCorrect,
        timeTakenMs: a.timeTakenMs,
      })),
    );
  }

  // For authenticated users only: roll up lifetime stats + category mastery.
  // (Per PRD §15 guest → account merge is deferred to v2.)
  let freezeApplied = false;
  let comebackJustEarned = false;
  if (state.userId !== null) {
    ({ freezeApplied, comebackJustEarned } = await updateUserStats(
      db,
      state.userId,
      correct,
      final,
      opts.quizDate,
    ));
    await updateCategoryMastery(db, state.userId, state.answered);
  }

  return await loadResults(
    db,
    attemptId,
    state.dailyQuizId,
    final,
    state.userId,
    state.answered,
    { freezeApplied, comebackJustEarned },
  );
}

function getIsoWeekMonday(date: Date = new Date()): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

async function updateUserStats(
  db: DB,
  userId: number,
  correctOnQuiz: number,
  finalScoreValue: number,
  // Must be the quiz_date from the DB row, never a client-supplied value.
  // Streak math keys today/yesterday off this string, so piping request
  // input here would allow streak-padding attacks.
  quizDateFromDb: string,
): Promise<{ freezeApplied: boolean; comebackJustEarned: boolean }> {
  const today = quizDateFromDb;
  const d = new Date(`${quizDateFromDb}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);
  const currentMonday = getIsoWeekMonday();

  const [existing] = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);

  if (!existing) {
    await db.insert(userStats).values({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      totalQuizzes: 1,
      totalCorrect: correctOnQuiz,
      lifetimeScore: finalScoreValue,
      lastPlayedDate: today,
      perfectScores: correctOnQuiz === 5 ? 1 : 0,
      weekStartDate: currentMonday,
    });
    return { freezeApplied: false, comebackJustEarned: false };
  }

  // Reset weekly freeze counter when a new ISO week starts.
  const isNewWeek = existing.weekStartDate !== currentMonday;
  const effectiveFreezesUsed = isNewWeek ? 0 : existing.freezesUsedThisWeek;

  // Streak math (PRD §10). Same-day replay is blocked upstream by the
  // unique constraint, but we guard anyway.
  let newStreak = existing.currentStreak;
  let freezeApplied = false;
  if (existing.lastPlayedDate === today) {
    // No-op.
  } else if (existing.lastPlayedDate === yesterday) {
    newStreak = existing.currentStreak + 1;
  } else if (existing.currentStreak > 0 && effectiveFreezesUsed < 1) {
    // Missed at least one day — auto-apply the weekly freeze if available.
    freezeApplied = true;
    newStreak = existing.currentStreak + 1;
  } else {
    newStreak = 1;
  }

  const newLongest = Math.max(existing.longestStreak, newStreak);
  const comebackJustEarned = freezeApplied && !existing.comebackEarned;

  await db
    .update(userStats)
    .set({
      currentStreak: newStreak,
      longestStreak: newLongest,
      totalQuizzes: existing.totalQuizzes + 1,
      totalCorrect: existing.totalCorrect + correctOnQuiz,
      lifetimeScore: existing.lifetimeScore + finalScoreValue,
      lastPlayedDate: today,
      freezesUsedThisWeek: freezeApplied
        ? effectiveFreezesUsed + 1
        : effectiveFreezesUsed,
      weekStartDate: currentMonday,
      perfectScores: existing.perfectScores + (correctOnQuiz === 5 ? 1 : 0),
      comebackEarned: existing.comebackEarned || comebackJustEarned,
    })
    .where(eq(userStats.userId, userId));

  return { freezeApplied, comebackJustEarned };
}

async function updateCategoryMastery(
  db: DB,
  userId: number,
  answered: AnsweredQuestion[],
): Promise<void> {
  if (answered.length === 0) return;

  // Look up categories for the answered questions.
  const rows = await db
    .select({ id: questions.id, category: questions.category })
    .from(questions)
    .where(
      inArray(
        questions.id,
        answered.map((a) => a.questionId),
      ),
    );
  const categoryById = new Map(rows.map((r) => [r.id, r.category]));

  // Tally per category for this quiz.
  const tallies = new Map<
    string,
    { questionsSeen: number; questionsCorrect: number }
  >();
  for (const a of answered) {
    const category = categoryById.get(a.questionId);
    if (!category) continue;
    const tally = tallies.get(category) ?? {
      questionsSeen: 0,
      questionsCorrect: 0,
    };
    tally.questionsSeen += 1;
    if (a.wasCorrect) tally.questionsCorrect += 1;
    tallies.set(category, tally);
  }

  // Upsert each category. D1 supports ON CONFLICT but the schema uses a
  // composite PK so manual upsert keeps things readable.
  for (const [category, tally] of tallies) {
    const [existing] = await db
      .select()
      .from(categoryMastery)
      .where(
        and(
          eq(categoryMastery.userId, userId),
          eq(categoryMastery.category, category),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(categoryMastery)
        .set({
          questionsSeen: existing.questionsSeen + tally.questionsSeen,
          questionsCorrect: existing.questionsCorrect + tally.questionsCorrect,
        })
        .where(
          and(
            eq(categoryMastery.userId, userId),
            eq(categoryMastery.category, category),
          ),
        );
    } else {
      await db.insert(categoryMastery).values({
        userId,
        category,
        questionsSeen: tally.questionsSeen,
        questionsCorrect: tally.questionsCorrect,
      });
    }
  }
}

async function loadResults(
  db: DB,
  attemptId: number,
  dailyQuizId: number,
  finalScoreValue: number,
  userId: number | null,
  answered: AnsweredQuestion[],
  freezeData: { freezeApplied: boolean; comebackJustEarned: boolean } = {
    freezeApplied: false,
    comebackJustEarned: false,
  },
): Promise<QuizResults> {
  const rows =
    answered.length > 0
      ? await db
          .select()
          .from(questions)
          .where(
            inArray(
              questions.id,
              answered.map((a) => a.questionId),
            ),
          )
      : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const totalTime = answered.reduce((s, a) => s + a.timeTakenMs, 0);

  const [{ percentile, total: totalPlayersToday }, scoreDistribution, friendsToday] =
    await Promise.all([
      computeLivePercentile(db, dailyQuizId, finalScoreValue),
      computeScoreDistribution(db, dailyQuizId),
      userId !== null
        ? computeFriendsToday(db, dailyQuizId, userId)
        : Promise.resolve(null),
    ]);

  let userStreak:
    | {
        current: number;
        longest: number;
        perfectScores: number;
        comebackEarned: boolean;
      }
    | undefined;
  if (userId !== null) {
    const [stats] = await db
      .select({
        current: userStats.currentStreak,
        longest: userStats.longestStreak,
        perfectScores: userStats.perfectScores,
        comebackEarned: userStats.comebackEarned,
      })
      .from(userStats)
      .where(eq(userStats.userId, userId))
      .limit(1);
    if (stats) {
      userStreak = {
        current: stats.current,
        longest: stats.longest,
        perfectScores: stats.perfectScores,
        comebackEarned: stats.comebackEarned,
      };
    }
  }

  return {
    attemptId,
    userId,
    correctCount: correctCount(answered),
    finalScore: finalScore(answered),
    totalTimeMs: totalTime,
    percentile,
    totalPlayersToday,
    scoreDistribution,
    friendsToday,
    userStreak,
    freezeApplied: freezeData.freezeApplied || undefined,
    comebackJustEarned: freezeData.comebackJustEarned || undefined,
    perQuestion: answered.map((a) => {
      const q = byId.get(a.questionId);
      return {
        questionId: a.questionId,
        text: q?.text ?? "(question removed)",
        correctAnswer: q?.correctAnswer ?? "",
        userAnswer: a.userAnswer,
        wasCorrect: a.wasCorrect,
        timeTakenMs: a.timeTakenMs,
        pointsEarned: questionScore(a.wasCorrect, a.timeTakenMs),
      };
    }),
  };
}

async function computeFriendsToday(
  db: DB,
  dailyQuizId: number,
  currentUserId: number,
): Promise<Array<{ userId: number; displayName: string; finalScore: number; rank: number }> | null> {
  const friendRows = await db
    .select({ userId1: friendships.userId1, userId2: friendships.userId2 })
    .from(friendships)
    .where(
      or(
        eq(friendships.userId1, currentUserId),
        eq(friendships.userId2, currentUserId),
      ),
    );

  if (friendRows.length === 0) return null;

  const friendIds = friendRows.map((r) =>
    r.userId1 === currentUserId ? r.userId2 : r.userId1,
  );
  const allIds = [currentUserId, ...friendIds];

  const rows = await db
    .select({
      userId: quizAttempts.userId,
      displayName: users.displayName,
      finalScore: quizAttempts.finalScore,
      totalTimeMs: quizAttempts.totalTimeMs,
    })
    .from(quizAttempts)
    .innerJoin(users, eq(users.id, quizAttempts.userId))
    .where(
      and(
        eq(quizAttempts.dailyQuizId, dailyQuizId),
        inArray(quizAttempts.userId, allIds),
      ),
    )
    .orderBy(desc(quizAttempts.finalScore), asc(quizAttempts.totalTimeMs));

  if (rows.length === 0) return null;

  return rows.map((r, i) => ({
    userId: r.userId!,
    displayName: r.displayName ?? "Player",
    finalScore: r.finalScore,
    rank: i + 1,
  }));
}

async function computeScoreDistribution(
  db: DB,
  dailyQuizId: number,
): Promise<number[]> {
  const rows = await db
    .select({ score: quizAttempts.score, count: sql<number>`count(*)` })
    .from(quizAttempts)
    .where(eq(quizAttempts.dailyQuizId, dailyQuizId))
    .groupBy(quizAttempts.score);
  const dist = [0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    if (row.score >= 0 && row.score <= 5) dist[row.score] = row.count;
  }
  return dist;
}

async function fetchQuestion(db: DB, id: number): Promise<QuestionRow> {
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.id, id))
    .limit(1);
  if (rows.length === 0) {
    throw new QuizError("question-not-found", `Question ${id} not found`);
  }
  return rows[0];
}

// Deterministic PRNG so a question shuffled with the same seed (its serve
// timestamp) yields the same option order — answers don't jump around when a
// session is resumed after a reload.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleOptions(q: QuestionRow, seed?: number): PublicQuestion {
  const all = [q.correctAnswer, ...q.incorrectAnswers];
  const rand = seed === undefined ? Math.random : mulberry32(seed);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return {
    id: q.id,
    text: q.text,
    category: q.category,
    difficulty: q.difficulty,
    options: all,
  };
}

function clampTime(rawMs: number): number {
  return Math.max(0, Math.min(QUESTION_TIME_LIMIT_MS + NETWORK_GRACE_MS, rawMs));
}

export async function findExistingAttempt(opts: {
  db: DB;
  dailyQuizId: number;
  guestId: string | null;
  userId: number | null;
}): Promise<QuizResults | null> {
  const { db } = opts;
  const clause =
    opts.userId !== null
      ? and(
          eq(quizAttempts.dailyQuizId, opts.dailyQuizId),
          eq(quizAttempts.userId, opts.userId),
        )
      : opts.guestId !== null
        ? and(
            eq(quizAttempts.dailyQuizId, opts.dailyQuizId),
            eq(quizAttempts.guestId, opts.guestId),
            isNull(quizAttempts.userId),
          )
        : null;

  if (!clause) return null;

  const attempt = await db
    .select()
    .from(quizAttempts)
    .where(clause)
    .limit(1);
  if (attempt.length === 0) return null;

  const responses = await db
    .select()
    .from(questionResponses)
    .where(eq(questionResponses.quizAttemptId, attempt[0].id));

  const answered: AnsweredQuestion[] = responses.map((r) => ({
    questionId: r.questionId,
    userAnswer: r.userAnswer,
    wasCorrect: r.wasCorrect,
    timeTakenMs: r.timeTakenMs,
  }));

  return await loadResults(
    db,
    attempt[0].id,
    attempt[0].dailyQuizId,
    attempt[0].finalScore,
    opts.userId,
    answered,
  );
}
