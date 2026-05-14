import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { questions } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { fetchTriviaApiById } from "@/lib/ingestion/sources";

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const CATEGORIES = [
  "Music",
  "Sport & Leisure",
  "Film & TV",
  "Arts & Literature",
  "History",
  "Society & Culture",
  "Science",
  "Geography",
  "Food & Drink",
  "General Knowledge",
] as const;

type Action = "approve" | "reject" | "move-to-pending" | "dismiss" | "edit" | "reset";
const ACTIONS: readonly Action[] = [
  "approve",
  "reject",
  "move-to-pending",
  "dismiss",
  "edit",
  "reset",
];

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // Defense-in-depth: middleware covers /admin/* but verify here too in case
  // the route is ever invoked outside the normal middleware chain.
  const session = await auth();
  if (!isAdminEmail(session?.user?.email ?? null)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: idStr } = await ctx.params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  let body: { action?: string; fields?: unknown };
  try {
    body = (await request.json()) as { action?: string; fields?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.action || !ACTIONS.includes(body.action as Action)) {
    return Response.json(
      { error: `action must be one of ${ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }
  const action = body.action as Action;

  const db = await getDb();

  // Verify question exists
  const [existing] = await db
    .select({
      id: questions.id,
      status: questions.status,
      source: questions.source,
      externalId: questions.externalId,
    })
    .from(questions)
    .where(eq(questions.id, id))
    .limit(1);
  if (!existing) {
    return Response.json({ error: "question not found" }, { status: 404 });
  }

  switch (action) {
    case "approve":
      await db
        .update(questions)
        .set({ status: "approved", flagCount: 0 })
        .where(eq(questions.id, id));
      break;
    case "reject":
      await db
        .update(questions)
        .set({ status: "rejected" })
        .where(eq(questions.id, id));
      break;
    case "move-to-pending":
      await db
        .update(questions)
        .set({ status: "pending" })
        .where(eq(questions.id, id));
      break;
    case "dismiss":
      // Keep status (typically 'approved'), just clear the accumulated flags.
      await db
        .update(questions)
        .set({ flagCount: 0 })
        .where(eq(questions.id, id));
      break;
    case "edit": {
      const fields = body.fields as Record<string, unknown> | undefined;
      const validationError = validateEditFields(fields);
      if (validationError) {
        return Response.json({ error: validationError }, { status: 400 });
      }
      const f = fields as {
        text: string;
        correctAnswer: string;
        incorrectAnswers: string[];
        category: string;
        difficulty: "easy" | "medium" | "hard";
      };
      await db
        .update(questions)
        .set({
          text: f.text.trim(),
          correctAnswer: f.correctAnswer.trim(),
          incorrectAnswers: f.incorrectAnswers.map((a) => a.trim()),
          category: f.category,
          difficulty: f.difficulty,
          manuallyEdited: true,
        })
        .where(eq(questions.id, id));
      break;
    }
    case "reset": {
      if (existing.source !== "the-trivia-api") {
        return Response.json(
          { error: "reset unavailable for opentdb questions — externalId is a hash, not a fetchable API ID" },
          { status: 400 },
        );
      }
      let fresh;
      try {
        fresh = await fetchTriviaApiById(existing.externalId);
      } catch (err) {
        return Response.json(
          { error: `failed to fetch from source API: ${String(err)}` },
          { status: 502 },
        );
      }
      if (!fresh) {
        return Response.json(
          { error: "question no longer available from source API" },
          { status: 404 },
        );
      }
      await db
        .update(questions)
        .set({
          text: fresh.text,
          correctAnswer: fresh.correctAnswer,
          incorrectAnswers: fresh.incorrectAnswers,
          category: fresh.category,
          difficulty: fresh.difficulty,
          manuallyEdited: false,
        })
        .where(eq(questions.id, id));
      break;
    }
  }

  return Response.json({ ok: true, id, action });
}

function validateEditFields(
  fields: Record<string, unknown> | undefined,
): string | null {
  if (!fields || typeof fields !== "object") return "fields are required";

  const { text, correctAnswer, incorrectAnswers, category, difficulty } = fields;

  if (typeof text !== "string" || !text.trim()) return "text is required";
  if (typeof correctAnswer !== "string" || !correctAnswer.trim())
    return "correctAnswer is required";
  if (
    !Array.isArray(incorrectAnswers) ||
    incorrectAnswers.length !== 3 ||
    incorrectAnswers.some((a) => typeof a !== "string" || !a.trim())
  )
    return "incorrectAnswers must be an array of exactly 3 non-empty strings";
  if (incorrectAnswers.includes(correctAnswer.trim()))
    return "correctAnswer must not appear in incorrectAnswers";
  if (
    typeof category !== "string" ||
    !(CATEGORIES as readonly string[]).includes(category)
  )
    return `category must be one of: ${CATEGORIES.join(", ")}`;
  if (
    typeof difficulty !== "string" ||
    !(DIFFICULTIES as readonly string[]).includes(difficulty)
  )
    return "difficulty must be easy, medium, or hard";

  return null;
}
