import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { friendInvites } from "@/db/schema";
import { getDb } from "@/lib/db";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
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
    const url = `https://smarterthantheinternet.com/invite/${existing.token}`;
    return Response.json({ token: existing.token, url });
  }
  const token = generateToken();
  await db.insert(friendInvites).values({ userId: session.userId, token });
  const url = `https://smarterthantheinternet.com/invite/${token}`;
  return Response.json({ token, url });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = generateToken();
  const db = await getDb();
  await db
    .update(friendInvites)
    .set({ token })
    .where(eq(friendInvites.userId, session.userId));
  const url = `https://smarterthantheinternet.com/invite/${token}`;
  return Response.json({ token, url });
}
