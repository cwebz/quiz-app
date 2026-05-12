import { getDb, getEnv } from "@/lib/db";
import { processAnswer, QuizError } from "@/lib/quiz/play";

export async function POST(request: Request) {
  const receivedAt = Date.now();

  let body: { token?: string; answer?: string };
  try {
    body = (await request.json()) as { token?: string; answer?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.token || typeof body.token !== "string") {
    return Response.json({ error: "token required" }, { status: 400 });
  }
  if (typeof body.answer !== "string") {
    return Response.json(
      { error: "answer required (string)" },
      { status: 400 },
    );
  }

  const env = await getEnv();
  if (!env.QUIZ_TOKEN_SECRET) {
    return Response.json(
      { error: "QUIZ_TOKEN_SECRET not configured" },
      { status: 500 },
    );
  }
  if (!env.QUIZ_KV) {
    return Response.json(
      { error: "QUIZ_KV namespace not configured" },
      { status: 500 },
    );
  }

  const db = await getDb();

  try {
    const result = await processAnswer({
      db,
      kv: env.QUIZ_KV,
      secret: env.QUIZ_TOKEN_SECRET,
      token: body.token,
      userAnswer: body.answer,
      receivedAt,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof QuizError) {
      const status =
        err.code === "invalid-token"
          ? 401
          : err.code === "already-played"
            ? 409
            : 404;
      return Response.json({ error: err.code }, { status });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}
