import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { dailyQuizzes } from "@/db/schema";
import { getDb } from "@/lib/db";
import { findExistingAttempt } from "@/lib/quiz/play";
import { resolveQuizDate } from "@/lib/quiz/select";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const guestId = url.searchParams.get("guestId");
  if (guestId !== null && guestId.length > 64) {
    return Response.json({ error: "invalid guestId" }, { status: 400 });
  }
  const date = resolveQuizDate(url.searchParams.get("localDate"));

  const session = await auth();
  const userId = session?.userId ?? null;
  const identity: "user" | "guest" = userId !== null ? "user" : "guest";

  const db = await getDb();
  const quiz = await db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, date))
    .limit(1);

  if (quiz.length === 0) {
    return Response.json({ status: "no-quiz-today", date, identity });
  }

  // Signed-in user: look up by userId; guest: by guestId.
  // Orphan guest attempts are adopted at sign-in (see auth.ts).
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
      identity,
    });
  }

  return Response.json({
    status: "ready",
    date,
    dailyQuizId: quiz[0].id,
    totalQuestions: quiz[0].questionIds.length,
    identity,
  });
}
