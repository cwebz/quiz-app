import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { friendInvites } from "@/db/schema";
import { getDb } from "@/lib/db";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function inviteUrl(request: Request, token: string): string {
  return `${new URL(request.url).origin}/invite/${token}`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(friendInvites)
    .where(eq(friendInvites.userId, session.userId))
    .limit(1);
  if (existing) {
    return Response.json({ token: existing.token, url: inviteUrl(request, existing.token) });
  }
  const token = generateToken();
  await db.insert(friendInvites).values({ userId: session.userId, token });
  return Response.json({ token, url: inviteUrl(request, token) });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = generateToken();
  const db = await getDb();
  const [existing] = await db
    .select({ id: friendInvites.id })
    .from(friendInvites)
    .where(eq(friendInvites.userId, session.userId))
    .limit(1);
  if (existing) {
    await db
      .update(friendInvites)
      .set({ token })
      .where(eq(friendInvites.userId, session.userId));
  } else {
    await db.insert(friendInvites).values({ userId: session.userId, token });
  }
  return Response.json({ token, url: inviteUrl(request, token) });
}
