import { and, eq, sql } from "drizzle-orm";
import { questionFlags, questions } from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";
import { verifyToken } from "@/lib/quiz/token";

// PRD §7 auto-move threshold: a question with this many flags gets bumped
// from `approved` to `pending` so it's excluded from future daily quizzes
// until an admin approves or rejects it.
const AUTO_PENDING_THRESHOLD = 3;
const MAX_REASON_LENGTH = 280;

export async function POST(request: Request) {
  let body: { token?: string; reason?: string };
  try {
    body = (await request.json()) as { token?: string; reason?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.token || typeof body.token !== "string") {
    return Response.json({ error: "token required" }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, MAX_REASON_LENGTH)
      : null;

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

  const db = await getDb();
  const questionId = state.currentQuestionId;

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
    state.userId !== null
      ? eq(questionFlags.userId, state.userId)
      : state.guestId !== null
        ? eq(questionFlags.guestId, state.guestId)
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
    userId: state.userId,
    guestId: state.guestId,
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
