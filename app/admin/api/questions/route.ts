import { and, eq, like, or, type SQL } from "drizzle-orm";
import { auth } from "@/auth";
import { questions } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getDb } from "@/lib/db";

const STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

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

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

export async function GET(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email ?? null)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const statusParam = url.searchParams.get("status") ?? "approved";
  const limitParam = url.searchParams.get("limit");
  const categoryParam = url.searchParams.get("category") ?? "";
  const difficultyParam = url.searchParams.get("difficulty") ?? "";

  if (!q && !categoryParam && !difficultyParam) {
    return Response.json({ questions: [] });
  }

  if (!(STATUSES as readonly string[]).includes(statusParam)) {
    return Response.json(
      { error: `status must be one of ${STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  const status = statusParam as Status;

  if (categoryParam && !(CATEGORIES as readonly string[]).includes(categoryParam)) {
    return Response.json(
      { error: `category must be one of ${CATEGORIES.join(", ")}` },
      { status: 400 },
    );
  }

  if (difficultyParam && !(DIFFICULTIES as readonly string[]).includes(difficultyParam)) {
    return Response.json(
      { error: `difficulty must be one of ${DIFFICULTIES.join(", ")}` },
      { status: 400 },
    );
  }
  const difficulty = difficultyParam ? (difficultyParam as Difficulty) : "";

  let limit = 20;
  if (limitParam !== null) {
    const parsed = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return Response.json({ error: "invalid limit" }, { status: 400 });
    }
    limit = Math.min(parsed, 50);
  }

  const db = await getDb();

  const conditions: SQL[] = [eq(questions.status, status)];
  if (q) {
    const numericId = /^\d+$/.test(q) ? Number.parseInt(q, 10) : null;
    const pattern = `%${q}%`;
    conditions.push(
      numericId !== null
        ? or(eq(questions.id, numericId), like(questions.text, pattern))!
        : like(questions.text, pattern),
    );
  }
  if (categoryParam) {
    conditions.push(eq(questions.category, categoryParam));
  }
  if (difficulty) {
    conditions.push(eq(questions.difficulty, difficulty));
  }

  const rows = await db
    .select({
      id: questions.id,
      text: questions.text,
      category: questions.category,
      difficulty: questions.difficulty,
      status: questions.status,
    })
    .from(questions)
    .where(and(...conditions))
    .limit(limit);

  return Response.json({ questions: rows });
}
