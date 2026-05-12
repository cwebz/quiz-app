import { getDb, getEnv } from "@/lib/db";
import { processContinue, QuizError } from "@/lib/quiz/play";

export async function POST(request: Request) {
  let body: { advanceToken?: string };
  try {
    body = (await request.json()) as { advanceToken?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.advanceToken || typeof body.advanceToken !== "string") {
    return Response.json({ error: "advanceToken required" }, { status: 400 });
  }

  const env = await getEnv();
  if (!env.QUIZ_TOKEN_SECRET) {
    return Response.json(
      { error: "QUIZ_TOKEN_SECRET not configured" },
      { status: 500 },
    );
  }

  const db = await getDb();

  try {
    const result = await processContinue({
      db,
      secret: env.QUIZ_TOKEN_SECRET,
      advanceToken: body.advanceToken,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof QuizError) {
      const status =
        err.code === "invalid-token"
          ? 401
          : err.code === "quiz-not-found"
            ? 404
            : 500;
      return Response.json({ error: err.code }, { status });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}
