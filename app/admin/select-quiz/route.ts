import { getDb } from "@/lib/db";
import { getUtcDateString, selectDailyQuiz } from "@/lib/quiz/select";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? getUtcDateString();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const db = await getDb();
  try {
    const result = await selectDailyQuiz(db, date);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "selection failed" },
      { status: 500 },
    );
  }
}
