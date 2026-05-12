import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { dailyQuizzes } from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";
import { buildStart, findExistingAttempt } from "@/lib/quiz/play";
import { getUtcDateString } from "@/lib/quiz/select";

export async function POST(request: Request) {
  let body: { guestId?: string };
  try {
    body = (await request.json()) as { guestId?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.userId ?? null;

  // Authenticated users don't need a guestId; guests do.
  const guestId = userId === null ? (body.guestId ?? null) : null;
  if (userId === null) {
    if (
      !guestId ||
      typeof guestId !== "string" ||
      guestId.length > 64
    ) {
      return Response.json(
        { error: "guestId required for guest play (string, max 64 chars)" },
        { status: 400 },
      );
    }
  }

  const db = await getDb();
  const env = await getEnv();
  if (!env.QUIZ_TOKEN_SECRET) {
    return Response.json(
      { error: "QUIZ_TOKEN_SECRET not configured" },
      { status: 500 },
    );
  }

  const date = getUtcDateString();
  const quiz = await db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, date))
    .limit(1);
  if (quiz.length === 0) {
    return Response.json({ error: "no quiz for today" }, { status: 404 });
  }

  const existing = await findExistingAttempt({
    db,
    dailyQuizId: quiz[0].id,
    guestId,
    userId,
  });
  if (existing) {
    return Response.json(
      { status: "already-played", results: existing },
      { status: 409 },
    );
  }

  const start = await buildStart({
    db,
    secret: env.QUIZ_TOKEN_SECRET,
    dailyQuizId: quiz[0].id,
    questionIds: quiz[0].questionIds,
    guestId,
    userId,
  });

  return Response.json({ status: "started", ...start });
}
