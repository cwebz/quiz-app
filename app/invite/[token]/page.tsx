import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { SignInButton } from "@/components/SignInButton";
import { friendInvites, friendships, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { AcceptInviteButton } from "./AcceptInviteButton";

const CARD_STYLE: React.CSSProperties = {
  maxWidth: 520,
  marginTop: 40,
  textAlign: "center",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();
  const db = await getDb();

  const [invite] = await db
    .select({ userId: friendInvites.userId })
    .from(friendInvites)
    .where(eq(friendInvites.token, token))
    .limit(1);

  if (!invite) {
    return (
      <div className="card" style={CARD_STYLE}>
        <h2 style={{ marginBottom: 8 }}>Invite not found</h2>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          This invite link is invalid or has been reset. Ask your friend for a
          fresh link.
        </p>
        <Link
          href="/"
          style={{ color: "var(--primary)", textDecoration: "underline" }}
        >
          Back to today&apos;s quiz
        </Link>
      </div>
    );
  }

  const [inviter] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, invite.userId))
    .limit(1);
  const inviterName = inviter?.displayName ?? "Someone";

  if (!session?.userId) {
    return (
      <div className="card" style={CARD_STYLE}>
        <h2 style={{ marginBottom: 8 }}>
          {inviterName} invited you to be friends
        </h2>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 20,
          }}
        >
          Sign in to accept and start competing on the daily leaderboard.
        </p>
        <SignInButton
          label="Continue with Google"
          redirectTo={`/invite/${token}`}
          className="btn"
          style={{ display: "inline-flex" }}
        />
      </div>
    );
  }

  if (session.userId === invite.userId) {
    return (
      <div className="card" style={CARD_STYLE}>
        <h2 style={{ marginBottom: 8 }}>That&apos;s your own link</h2>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          Share this link with friends so they can add you.
        </p>
        <Link
          href="/leaderboard"
          style={{ color: "var(--primary)", textDecoration: "underline" }}
        >
          See your leaderboard
        </Link>
      </div>
    );
  }

  const uid1 = Math.min(session.userId, invite.userId);
  const uid2 = Math.max(session.userId, invite.userId);
  const [existing] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.userId1, uid1), eq(friendships.userId2, uid2)))
    .limit(1);

  if (existing) {
    return (
      <div className="card" style={CARD_STYLE}>
        <h2 style={{ marginBottom: 8 }}>
          You&apos;re already friends with {inviterName}
        </h2>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          Head over to the leaderboard to see today&apos;s standings.
        </p>
        <Link
          href="/leaderboard"
          style={{ color: "var(--primary)", textDecoration: "underline" }}
        >
          Go to leaderboard
        </Link>
      </div>
    );
  }

  return (
    <div className="card" style={CARD_STYLE}>
      <h2 style={{ marginBottom: 8 }}>
        {inviterName} wants to be your friend
      </h2>
      <p
        style={{
          color: "var(--ink-soft)",
          fontSize: 14,
          lineHeight: 1.5,
          marginBottom: 20,
        }}
      >
        You&apos;ll be able to see each other&apos;s daily scores on the friends
        leaderboard.
      </p>
      <AcceptInviteButton token={token} inviterName={inviterName} />
    </div>
  );
}
