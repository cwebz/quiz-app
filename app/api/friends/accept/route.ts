import { and, eq, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { friendInvites, friendships, users } from "@/db/schema";
import { getDb } from "@/lib/db";

const FRIEND_CAP = 100;

async function getFriendCount(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: number,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(friendships)
    .where(or(eq(friendships.userId1, userId), eq(friendships.userId2, userId)));
  return row?.count ?? 0;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const currentUserId = session.userId;

  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return Response.json({ error: "token required" }, { status: 400 });
  }

  const db = await getDb();

  const [invite] = await db
    .select({ userId: friendInvites.userId })
    .from(friendInvites)
    .where(eq(friendInvites.token, token))
    .limit(1);
  if (!invite) {
    return Response.json({ error: "invite not found" }, { status: 404 });
  }

  const inviterId = invite.userId;
  if (inviterId === currentUserId) {
    return Response.json({ error: "cannot add yourself" }, { status: 400 });
  }

  const uid1 = Math.min(inviterId, currentUserId);
  const uid2 = Math.max(inviterId, currentUserId);

  const [alreadyFriends] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.userId1, uid1), eq(friendships.userId2, uid2)))
    .limit(1);
  if (alreadyFriends) {
    return Response.json({ error: "already friends" }, { status: 400 });
  }

  const [inviterCount, currentCount] = await Promise.all([
    getFriendCount(db, inviterId),
    getFriendCount(db, currentUserId),
  ]);
  if (inviterCount >= FRIEND_CAP || currentCount >= FRIEND_CAP) {
    return Response.json({ error: "friend limit reached" }, { status: 400 });
  }

  await db.insert(friendships).values({ userId1: uid1, userId2: uid2 });

  const [inviter] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, inviterId))
    .limit(1);

  return Response.json({ ok: true, friendName: inviter?.displayName ?? "Player" });
}
