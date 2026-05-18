import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { dailyQuizzes, questions } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getUtcDateString } from "@/lib/quiz/select";

export async function POST(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email ?? null)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { date?: unknown; outId?: unknown; inId?: unknown };
  try {
    body = (await request.json()) as {
      date?: unknown;
      outId?: unknown;
      inId?: unknown;
    };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  if (!(date > getUtcDateString())) {
    return Response.json(
      { error: "can only swap questions in future quizzes" },
      { status: 400 },
    );
  }

  const outId = typeof body.outId === "number" ? body.outId : Number.NaN;
  const inId = typeof body.inId === "number" ? body.inId : Number.NaN;
  if (
    !Number.isInteger(outId) ||
    !Number.isInteger(inId) ||
    !Number.isFinite(outId) ||
    !Number.isFinite(inId)
  ) {
    return Response.json(
      { error: "outId and inId must be integers" },
      { status: 400 },
    );
  }

  const db = await getDb();

  const [quiz] = await db
    .select()
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, date))
    .limit(1);
  if (!quiz) {
    return Response.json(
      { error: "quiz not found for date" },
      { status: 404 },
    );
  }

  const currentIds = quiz.questionIds;
  const outIndex = currentIds.indexOf(outId);
  if (outIndex === -1) {
    return Response.json(
      { error: "question not in quiz" },
      { status: 400 },
    );
  }

  if (currentIds.includes(inId)) {
    return Response.json(
      { error: "question already in quiz" },
      { status: 400 },
    );
  }

  const [replacement] = await db
    .select({ id: questions.id, status: questions.status })
    .from(questions)
    .where(eq(questions.id, inId))
    .limit(1);
  if (!replacement || replacement.status !== "approved") {
    return Response.json(
      { error: "replacement question not found or not approved" },
      { status: 404 },
    );
  }

  const newIds = [...currentIds];
  newIds[outIndex] = inId;

  await db
    .update(dailyQuizzes)
    .set({ questionIds: newIds })
    .where(eq(dailyQuizzes.id, quiz.id));

  return Response.json({ ok: true, date, questionIds: newIds });
}
