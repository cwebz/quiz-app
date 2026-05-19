import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { dailyQuizzes } from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";
import { buildStart, findExistingAttempt } from "@/lib/quiz/play";
import { getUtcDateString, resolveQuizDate } from "@/lib/quiz/select";

export async function POST(request: Request) {
  let body: { guestId?: string; localDate?: string };
  try {
    body = (await request.json()) as { guestId?: string; localDate?: string };
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

  // Rate limit: max 20 starts per IP per UTC day. Generous enough to cover
  // timezone edge cases (today + tomorrow quiz) and retries; blocks bulk
  // enumeration. Keyed by UTC date so the counter resets at UTC midnight.
  if (env.QUIZ_KV) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const rlKey = `rate:start:${ip}:${getUtcDateString()}`;
    const count = Number((await env.QUIZ_KV.get(rlKey)) ?? "0");
    if (count >= 20) {
      return Response.json({ error: "rate limit exceeded" }, { status: 429 });
    }
    await env.QUIZ_KV.put(rlKey, String(count + 1), { expirationTtl: 172800 });
  }

  const date = resolveQuizDate(body.localDate ?? null);
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
