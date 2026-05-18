import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  FriendsLeaderboard,
  type FriendEntry,
} from "@/components/FriendsLeaderboard";
import { InviteLinkBox } from "@/components/InviteLinkBox";
import { dailyQuizzes, friendships, quizAttempts, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getUtcDateString } from "@/lib/quiz/select";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function LeaderboardPage() {
  const session = await auth();
  if (!session?.userId) {
    redirect("/api/auth/signin?callbackUrl=/leaderboard");
  }
  const userId = session.userId;
  const db = await getDb();
  const today = getUtcDateString();

  const [todayQuiz] = await db
    .select({ id: dailyQuizzes.id })
    .from(dailyQuizzes)
    .where(eq(dailyQuizzes.quizDate, today))
    .limit(1);

  const friendRows = await db
    .select({
      userId1: friendships.userId1,
      userId2: friendships.userId2,
    })
    .from(friendships)
    .where(
      or(
        eq(friendships.userId1, userId),
        eq(friendships.userId2, userId),
      ),
    );

  const friendIds = friendRows.map((r) =>
    r.userId1 === userId ? r.userId2 : r.userId1,
  );

  const [me] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const myName = me?.displayName ?? "You";

  if (friendIds.length === 0) {
    return (
      <div
        className="card"
        style={{ maxWidth: 520, marginTop: 40, width: "100%" }}
      >
        <h2 style={{ marginBottom: 8 }}>Friends leaderboard</h2>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 20,
          }}
        >
          You don&apos;t have any friends yet. Share your invite link to start
          competing on the daily leaderboard.
        </p>
        <InviteLinkBox />
        <p
          style={{
            color: "var(--ink-mute)",
            fontSize: 12,
            textAlign: "center",
            marginTop: 18,
          }}
        >
          <Link
            href="/profile"
            style={{ color: "var(--ink-soft)", textDecoration: "underline" }}
          >
            Back to profile
          </Link>
        </p>
      </div>
    );
  }

  const allIds = [userId, ...friendIds];

  const friendUsers = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, friendIds))
    .orderBy(asc(users.displayName));

  const attempts = todayQuiz
    ? await db
        .select({
          userId: quizAttempts.userId,
          finalScore: quizAttempts.finalScore,
          totalTimeMs: quizAttempts.totalTimeMs,
        })
        .from(quizAttempts)
        .where(
          and(
            eq(quizAttempts.dailyQuizId, todayQuiz.id),
            inArray(quizAttempts.userId, allIds),
          ),
        )
        .orderBy(desc(quizAttempts.finalScore), asc(quizAttempts.totalTimeMs))
    : [];

  const attemptByUserId = new Map(
    attempts.map((a) => [a.userId as number, a]),
  );

  // Build entries: played users first (already in ranked order), then unplayed.
  const playedOrder = attempts.map((a) => a.userId as number);
  const playedSet = new Set(playedOrder);

  const entries: FriendEntry[] = [];
  for (const uid of playedOrder) {
    const a = attemptByUserId.get(uid)!;
    const displayName =
      uid === userId
        ? myName
        : friendUsers.find((u) => u.id === uid)?.displayName ?? "Player";
    entries.push({
      displayName,
      finalScore: a.finalScore,
      totalTimeMs: a.totalTimeMs,
      isCurrentUser: uid === userId,
    });
  }
  if (!playedSet.has(userId)) {
    entries.push({
      displayName: myName,
      finalScore: null,
      totalTimeMs: null,
      isCurrentUser: true,
    });
  }
  for (const f of friendUsers) {
    if (playedSet.has(f.id)) continue;
    entries.push({
      displayName: f.displayName ?? "Player",
      finalScore: null,
      totalTimeMs: null,
      isCurrentUser: false,
    });
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 720,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div className="card">
        <div className="row between">
          <div>
            <h2 style={{ marginBottom: 4 }}>Friends</h2>
            <div
              style={{
                color: "var(--ink-soft)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {formatDate(today)}
            </div>
          </div>
          <Link
            href="/profile"
            style={{
              fontSize: 13,
              color: "var(--primary)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
            }}
          >
            Invite more →
          </Link>
        </div>
        <FriendsLeaderboard entries={entries} />
      </div>

      <p
        style={{
          color: "var(--ink-mute)",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        <Link
          href="/"
          style={{ color: "var(--ink-soft)", textDecoration: "underline" }}
        >
          Back to today
        </Link>
      </p>
    </div>
  );
}
