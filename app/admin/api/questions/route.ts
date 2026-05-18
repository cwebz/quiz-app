import { and, eq, like, or } from "drizzle-orm";
import { auth } from "@/auth";
import { questions } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getDb } from "@/lib/db";

const STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

export async function GET(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email ?? null)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const statusParam = url.searchParams.get("status") ?? "approved";
  const limitParam = url.searchParams.get("limit");

  if (!q) {
    return Response.json({ questions: [] });
  }

  if (!(STATUSES as readonly string[]).includes(statusParam)) {
    return Response.json(
      { error: `status must be one of ${STATUSES.join(", ")}` },
      { status: 400 },
    );
  }
  const status = statusParam as Status;

  let limit = 20;
  if (limitParam !== null) {
    const parsed = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return Response.json({ error: "invalid limit" }, { status: 400 });
    }
    limit = Math.min(parsed, 50);
  }

  const db = await getDb();
  const numericId = /^\d+$/.test(q) ? Number.parseInt(q, 10) : null;
  const pattern = `%${q}%`;

  const textOrIdWhere =
    numericId !== null
      ? or(eq(questions.id, numericId), like(questions.text, pattern))
      : like(questions.text, pattern);

  const rows = await db
    .select({
      id: questions.id,
      text: questions.text,
      category: questions.category,
      difficulty: questions.difficulty,
      status: questions.status,
    })
    .from(questions)
    .where(and(eq(questions.status, status), textOrIdWhere))
    .limit(limit);

  return Response.json({ questions: rows });
}
