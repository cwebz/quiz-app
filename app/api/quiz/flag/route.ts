import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import {
  questionFlags,
  questionResponses,
  questions,
  quizAttempts,
} from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";
import { verifyToken } from "@/lib/quiz/token";

// PRD §7 auto-move threshold: a question with this many flags gets bumped
// from `approved` to `pending` so it's excluded from future daily quizzes
// until an admin approves or rejects it.
const AUTO_PENDING_THRESHOLD = 3;
const MAX_REASON_LENGTH = 280;

// Two modes:
//   - In-quiz:   { token, reason? }                        identity from HMAC token
//   - Post-quiz: { attemptId, questionId, guestId?, reason? }  identity from session + ownership check
type FlagBody = {
  token?: string;
  attemptId?: number;
  questionId?: number;
  guestId?: string;
  reason?: string;
};

export async function POST(request: Request) {
  let body: FlagBody;
  try {
    body = (await request.json()) as FlagBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, MAX_REASON_LENGTH)
      : null;

  const db = await getDb();

  // Resolve (userId, guestId, questionId) from one of the two modes.
  let userId: number | null;
  let guestId: string | null;
  let questionId: number;

  if (typeof body.token === "string" && body.token) {
    const env = await getEnv();
    if (!env.QUIZ_TOKEN_SECRET) {
      return Response.json(
        { error: "QUIZ_TOKEN_SECRET not configured" },
        { status: 500 },
      );
    }
    const state = await verifyToken(body.token, env.QUIZ_TOKEN_SECRET);
    if (!state) {
      return Response.json({ error: "invalid token" }, { status: 401 });
    }
    userId = state.userId;
    guestId = state.guestId;
    questionId = state.currentQuestionId;
  } else if (
    typeof body.attemptId === "number" &&
    Number.isFinite(body.attemptId) &&
    typeof body.questionId === "number" &&
    Number.isFinite(body.questionId)
  ) {
    const session = await auth();
    const sessionUserId = session?.userId ?? null;
    const claimedGuestId =
      typeof body.guestId === "string" && body.guestId.length > 0
        ? body.guestId
        : null;

    const [attempt] = await db
      .select({
        id: quizAttempts.id,
        userId: quizAttempts.userId,
        guestId: quizAttempts.guestId,
      })
      .from(quizAttempts)
      .where(eq(quizAttempts.id, body.attemptId))
      .limit(1);
    if (!attempt) {
      return Response.json({ error: "attempt not found" }, { status: 404 });
    }

    // Authorize: caller must own the attempt.
    if (sessionUserId !== null && attempt.userId === sessionUserId) {
      userId = sessionUserId;
      guestId = null;
    } else if (
      sessionUserId === null &&
      claimedGuestId !== null &&
      attempt.guestId === claimedGuestId
    ) {
      userId = null;
      guestId = claimedGuestId;
    } else {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    // Verify the question was actually answered in this attempt — prevents
    // someone from flagging arbitrary questions via a borrowed attemptId.
    const [response] = await db
      .select({ id: questionResponses.id })
      .from(questionResponses)
      .where(
        and(
          eq(questionResponses.quizAttemptId, attempt.id),
          eq(questionResponses.questionId, body.questionId),
        ),
      )
      .limit(1);
    if (!response) {
      return Response.json(
        { error: "question not in attempt" },
        { status: 404 },
      );
    }
    questionId = body.questionId;
  } else {
    return Response.json(
      { error: "token or (attemptId, questionId) required" },
      { status: 400 },
    );
  }

  // Make sure the question exists (defensive — the token says it does).
  const [existing] = await db
    .select({
      id: questions.id,
      status: questions.status,
      flagCount: questions.flagCount,
    })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!existing) {
    return Response.json({ error: "question not found" }, { status: 404 });
  }

  // Deduplicate: one flag per player per question (enforced by DB index too).
  const identityFilter =
    userId !== null
      ? eq(questionFlags.userId, userId)
      : guestId !== null
        ? eq(questionFlags.guestId, guestId)
        : null;

  if (identityFilter) {
    const [alreadyFlagged] = await db
      .select({ id: questionFlags.id })
      .from(questionFlags)
      .where(and(eq(questionFlags.questionId, questionId), identityFilter))
      .limit(1);
    if (alreadyFlagged) {
      return Response.json({ ok: true, alreadyFlagged: true });
    }
  }

  // Record the flag for audit. user_id / guest_id are nullable.
  await db.insert(questionFlags).values({
    questionId,
    userId,
    guestId,
    reason,
  });

  // Increment counter, get the new value back to decide on auto-move.
  const [updated] = await db
    .update(questions)
    .set({ flagCount: sql`${questions.flagCount} + 1` })
    .where(eq(questions.id, questionId))
    .returning({ flagCount: questions.flagCount, status: questions.status });

  let movedToPending = false;
  if (
    updated.flagCount >= AUTO_PENDING_THRESHOLD &&
    updated.status === "approved"
  ) {
    await db
      .update(questions)
      .set({ status: "pending" })
      .where(eq(questions.id, questionId));
    movedToPending = true;
  }

  return Response.json({
    ok: true,
    flagCount: updated.flagCount,
    movedToPending,
  });
}
