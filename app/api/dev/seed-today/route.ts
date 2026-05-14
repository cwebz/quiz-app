// Dev-only endpoint to seed today's daily quiz — mirrors what the cron does
// but targets today's date so local dev works without waiting for 23:55 UTC.
// Guard: hard 404 in production.

import { getDb } from "@/lib/db";
import { selectDailyQuiz, getUtcDateString } from "@/lib/quiz/select";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const db = await getDb();
  const date = getUtcDateString();

  try {
    const result = await selectDailyQuiz(db, date);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
