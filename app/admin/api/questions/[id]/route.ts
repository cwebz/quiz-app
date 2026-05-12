import { eq } from "drizzle-orm";
import { questions } from "@/db/schema";
import { getDb } from "@/lib/db";

type Action = "approve" | "reject" | "move-to-pending" | "dismiss";
const ACTIONS: readonly Action[] = [
  "approve",
  "reject",
  "move-to-pending",
  "dismiss",
];

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await ctx.params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
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
    .select({ id: questions.id, status: questions.status })
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
  }

  return Response.json({ ok: true, id, action });
}
