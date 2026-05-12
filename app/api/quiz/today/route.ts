import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { dailyQuizzes } from "@/db/schema";
import { getDb } from "@/lib/db";
import { findExistingAttempt } from "@/lib/quiz/play";
import { getUtcDateString } from "@/lib/quiz/select";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const guestId = url.searchParams.get("guestId");
  const date = getUtcDateString();

  const session = await auth();
  const userId = session?.userId ?? null;

  const db = await getDb();
  const quiz = await db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, date))
    .limit(1);

  if (quiz.length === 0) {
    return Response.json({ status: "no-quiz-today", date });
  }

  // Signed-in user: look up by userId; guest: by guestId. (No merge in v1.)
  const existing =
    userId !== null
      ? await findExistingAttempt({
          db,
          dailyQuizId: quiz[0].id,
          userId,
          guestId: null,
        })
      : guestId
        ? await findExistingAttempt({
            db,
            dailyQuizId: quiz[0].id,
            guestId,
            userId: null,
          })
        : null;

  if (existing) {
    return Response.json({
      status: "already-played",
      date,
      dailyQuizId: quiz[0].id,
      results: existing,
    });
  }

  return Response.json({
    status: "ready",
    date,
    dailyQuizId: quiz[0].id,
    totalQuestions: quiz[0].questionIds.length,
  });
}
