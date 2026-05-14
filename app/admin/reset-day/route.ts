import { eq, inArray } from "drizzle-orm";
import { dailyQuizzes, questionResponses, quizAttempts } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getUtcDateString, selectDailyQuiz } from "@/lib/quiz/select";

// Security: middleware.ts gates /admin/* to signed-in users only.
// This route is console-only (no UI), consistent with select-quiz.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? getUtcDateString();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const db = await getDb();

  // Find the daily quiz for this date (may not exist yet).
  const [existing] = await db
    .select({ id: dailyQuizzes.id })
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, date))
    .limit(1);

  if (existing) {
    // Collect attempt IDs so we can delete their question_responses first.
    const attempts = await db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(eq(quizAttempts.dailyQuizId, existing.id));

    if (attempts.length > 0) {
      const attemptIds = attempts.map((a) => a.id);
      await db
        .delete(questionResponses)
        .where(inArray(questionResponses.quizAttemptId, attemptIds));
      await db
        .delete(quizAttempts)
        .where(eq(quizAttempts.dailyQuizId, existing.id));
    }

    await db.delete(dailyQuizzes).where(eq(dailyQuizzes.quizDate, date));
  }

  try {
    const result = await selectDailyQuiz(db, date);
    return Response.json({ ok: true, date, ...result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "selection failed" },
      { status: 500 },
    );
  }
}
