import { and, asc, eq, or } from "drizzle-orm";
import { auth } from "@/auth";
import { friendships, users } from "@/db/schema";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.userId;
  const db = await getDb();

  const rows = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(eq(friendships.userId1, userId), eq(users.id, friendships.userId2)),
        and(eq(friendships.userId2, userId), eq(users.id, friendships.userId1)),
      ),
    )
    .orderBy(asc(users.displayName));

  return Response.json({ friends: rows });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const currentUserId = session.userId;
  let body: { friendId?: unknown };
  try {
    body = (await request.json()) as { friendId?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const friendId =
    typeof body.friendId === "number" && Number.isFinite(body.friendId)
      ? body.friendId
      : null;
  if (!friendId) {
    return Response.json({ error: "friendId required" }, { status: 400 });
  }
  const uid1 = Math.min(currentUserId, friendId);
  const uid2 = Math.max(currentUserId, friendId);
  const db = await getDb();
  const deleted = await db
    .delete(friendships)
    .where(and(eq(friendships.userId1, uid1), eq(friendships.userId2, uid2)))
    .returning({ id: friendships.id });
  if (deleted.length === 0) {
    return Response.json({ error: "friendship not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
