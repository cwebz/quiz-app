import { and, asc, desc, eq, gte, or } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { type BadgeDef, BadgesCollapsible } from "@/components/BadgesCollapsible";
import { CategoryBarsCollapsible } from "@/components/CategoryBarsCollapsible";
import { Ico } from "@/components/Icons";
import { InviteLinkBox } from "@/components/InviteLinkBox";
import { RemoveFriendButton } from "@/components/RemoveFriendButton";
import { SignInButton } from "@/components/SignInButton";
import {
  categoryMastery,
  dailyQuizzes,
  friendships,
  quizAttempts,
  users,
  userStats,
} from "@/db/schema";
import { getDb } from "@/lib/db";

async function loadFriends(
  userId: number,
): Promise<Array<{ id: number; displayName: string }>> {
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
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName ?? "Player",
  }));
}

const CATEGORY_COLORS = [
  "var(--blue)",
  "var(--mint)",
  "var(--pink)",
  "var(--orange)",
  "var(--primary)",
  "var(--yellow)",
];
const MASTERY_THRESHOLD = 100; // PRD §11 Master tier
const CAL_DAYS = 7;

type ProfileData = {
  displayName: string;
  email: string | null;
  createdAt: string;
  currentStreak: number;
  longestStreak: number;
  totalQuizzes: number;
  totalCorrect: number;
  lifetimeScore: number;
  bestScore: number;
  perfectScores: number;
  comebackEarned: boolean;
  hasSpeedDemon: boolean;
  hasLightning: boolean;
  categories: Array<{
    name: string;
    correct: number;
    seen: number;
    color: string;
  }>;
  calendar: Array<{ date: string; score: number | null; isToday: boolean }>;
};

async function loadProfile(userId: number): Promise<ProfileData | null> {
  const db = await getDb();

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) return null;

  const [statsRow] = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);

  const cats = await db
    .select()
    .from(categoryMastery)
    .where(eq(categoryMastery.userId, userId))
    .orderBy(desc(categoryMastery.questionsCorrect));

  // 28-day activity calendar: join quiz_attempts with daily_quizzes for the date.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - CAL_DAYS + 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const recent = await db
    .select({
      date: dailyQuizzes.quizDate,
      score: quizAttempts.score,
    })
    .from(quizAttempts)
    .innerJoin(dailyQuizzes, eq(quizAttempts.dailyQuizId, dailyQuizzes.id))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        gte(dailyQuizzes.quizDate, cutoffIso),
      ),
    );
  const scoreByDate = new Map(recent.map((r) => [r.date, r.score]));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const calendar: ProfileData["calendar"] = [];
  for (let i = CAL_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const score = scoreByDate.get(iso) ?? null;
    calendar.push({ date: iso, score, isToday: iso === todayIso });
  }

  // Check lifetime Speed Demon / Lightning badges via quiz_attempts.
  const [speedDemonRow] = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.userId, userId),
        eq(quizAttempts.score, 5),
        gte(quizAttempts.finalScore, 900),
      ),
    )
    .limit(1);
  const [lightningRow] = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.userId, userId),
        eq(quizAttempts.score, 5),
        gte(quizAttempts.finalScore, 950),
      ),
    )
    .limit(1);

  return {
    displayName: userRow.displayName ?? "Player",
    email: userRow.email,
    createdAt: userRow.createdAt,
    currentStreak: statsRow?.currentStreak ?? 0,
    longestStreak: statsRow?.longestStreak ?? 0,
    totalQuizzes: statsRow?.totalQuizzes ?? 0,
    totalCorrect: statsRow?.totalCorrect ?? 0,
    lifetimeScore: statsRow?.lifetimeScore ?? 0,
    bestScore: statsRow?.bestScore ?? 0,
    perfectScores: statsRow?.perfectScores ?? 0,
    comebackEarned: statsRow?.comebackEarned ?? false,
    hasSpeedDemon: !!speedDemonRow,
    hasLightning: !!lightningRow,
    categories: cats.map((c, i) => ({
      name: c.category,
      correct: c.questionsCorrect,
      seen: c.questionsSeen,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    })),
    calendar,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function emailHandle(email: string | null, displayName: string): string {
  if (email) return `@${email.split("@")[0]}`;
  return `@${displayName.toLowerCase().replace(/\s+/g, "")}`;
}

function prettyCategory(slug: string): string {
  return slug
    .split(/[_\s]+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.userId) {
    return (
      <div
        className="card"
        style={{ maxWidth: 520, marginTop: 40, textAlign: "center" }}
      >
        <h2 style={{ marginBottom: 8 }}>Profile</h2>
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 20,
          }}
        >
          Sign in with Google to see your lifetime stats, badges, and streak
          history.
        </p>
        <SignInButton
          label="Continue with Google"
          redirectTo="/profile"
          className="btn"
          style={{ display: "inline-flex" }}
        />
      </div>
    );
  }

  const [profile, friends] = await Promise.all([
    loadProfile(session.userId),
    loadFriends(session.userId),
  ]);
  if (!profile) {
    return (
      <div className="card" style={{ maxWidth: 520, marginTop: 40 }}>
        <h2>Profile not found</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
          We couldn&apos;t find your account row. Try signing out and back in via the menu.
        </p>
      </div>
    );
  }

  const lifetimeAccuracy =
    profile.totalQuizzes > 0
      ? Math.round((profile.totalCorrect / (profile.totalQuizzes * 5)) * 100)
      : null;

  return (
    <div className="stats-shell">
      <div className="stats-header">
        <div className="profile-avatar">{initials(profile.displayName)}</div>
        <div>
          <div className="profile-name">{profile.displayName}</div>
          <div className="profile-handle">
            {emailHandle(profile.email, profile.displayName)}
          </div>
          <div style={{ color: "var(--ink-mute)", fontSize: 12, marginTop: 2 }}>
            joined {formatJoined(profile.createdAt)}
          </div>
          <div className="profile-pills">
            {profile.currentStreak > 0 && (
              <span className="chip chip--yellow">
                <Ico.Fire style={{ width: 12, height: 12 }} />{" "}
                {profile.currentStreak}-day streak
              </span>
            )}
            {lifetimeAccuracy !== null && (
              <span className="chip chip--mint">
                {lifetimeAccuracy}% lifetime accuracy
              </span>
            )}
            {profile.totalQuizzes > 0 && (
              <span className="chip chip--blue">
                {profile.lifetimeScore.toLocaleString()} pts
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card purple">
          <div className="num">{profile.currentStreak.toLocaleString()}</div>
          <div className="lbl">Current streak</div>
        </div>
        <div className="stat-card yellow">
          <div className="num">{profile.longestStreak.toLocaleString()}</div>
          <div className="lbl">Longest streak</div>
        </div>
        <div className="stat-card mint">
          <div className="num">{profile.bestScore.toLocaleString()}</div>
          <div className="lbl">Best score</div>
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ flexWrap: "wrap", gap: "10px 12px", marginBottom: 14 }}>
          <div>
            <div className="section-h">Last 7 days</div>
            <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>
              {profile.totalQuizzes === 0
                ? "Play your first quiz to start filling this in."
                : "Each square is one day. Darker green = better score."}
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexShrink: 0 }}>
            <span className="chip chip--mint">Played</span>
            <span className="chip chip--coral">Missed</span>
          </div>
        </div>
        <div className="streak-cal">
          {profile.calendar.map((day) => {
            const classes = ["cal-cell"];
            if (day.score !== null) classes.push("played");
            if (day.isToday) classes.push("today");
            return (
              <div
                key={day.date}
                className={classes.join(" ")}
                data-score={day.score ?? undefined}
                title={
                  day.score !== null
                    ? `${day.date} · ${day.score}/5`
                    : `${day.date} · no attempt`
                }
                aria-label={
                  day.score !== null
                    ? `${day.date}: ${day.score} out of 5`
                    : `${day.date}: not played`
                }
                role="img"
              />
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="section-h" style={{}}>Category mastery</div>
        <div className="section-sub">
          Lifetime correct answers per category. Hit {MASTERY_THRESHOLD} to earn Master tier.
        </div>
        <CategoryBarsCollapsible categories={profile.categories} />
      </div>

      <div className="card">
        <div className="section-h" style={{}}>Badges</div>
        <BadgesCollapsible badges={buildBadges(profile)} />
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <div className="section-h" style={{}}>
              Friends
            </div>
            <div className="section-sub">
              Share your link to invite friends. Compare scores on the daily
              leaderboard.
            </div>
          </div>
          <Link
            href="/leaderboard"
            style={{
              fontSize: 13,
              color: "var(--primary)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              padding: "12px 0 12px 16px",
              display: "inline-block",
            }}
          >
            Leaderboard →
          </Link>
        </div>
        <InviteLinkBox />
        {friends.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--ink-soft)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 10,
              }}
            >
              Your friends ({friends.length})
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {friends.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "var(--bg)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontWeight: 700,
                      fontSize: 15,
                      color: "var(--ink)",
                    }}
                  >
                    {f.displayName}
                  </div>
                  <RemoveFriendButton
                    friendId={f.id}
                    friendName={f.displayName}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p
        style={{
          color: "var(--ink-mute)",
          fontSize: 12,
          textAlign: "center",
          marginTop: -6,
        }}
      >
        <Link
          href="/"
          style={{
            color: "var(--ink-soft)",
            textDecoration: "underline",
          }}
        >
          Back to today
        </Link>
      </p>
    </div>
  );
}

function buildBadges(profile: ProfileData): BadgeDef[] {
  const best = Math.max(profile.currentStreak, profile.longestStreak);
  const firstSteps = profile.totalQuizzes >= 1;
  const perfect = profile.perfectScores >= 1;
  const perfectionist = profile.perfectScores >= 10;
  const weekOne = best >= 7;
  const monthStrong = best >= 30;
  const centurion = best >= 100;
  const masterCategory = profile.categories.find((c) => c.correct >= MASTERY_THRESHOLD);

  const badges: BadgeDef[] = [
    { unlocked: firstSteps, tier: "gold", iconKey: "Trophy", name: "First Steps", desc: "Played your first quiz" },
    { unlocked: perfect, tier: "gold", iconKey: "Check", name: "Perfect", desc: perfect ? "Scored 5/5" : "Score 5/5 on a quiz" },
    { unlocked: perfectionist, tier: "gold", iconKey: "Brain", name: "Perfectionist", desc: perfectionist ? "10 perfect scores" : `${profile.perfectScores}/10 perfect scores` },
    { unlocked: profile.hasSpeedDemon, tier: "gold", iconKey: "Bolt", name: "Speed Demon", desc: "5/5 with 900+ points" },
    { unlocked: profile.hasLightning, tier: "master", iconKey: "Bolt", name: "Lightning", desc: "5/5 with 950+ points" },
    { unlocked: profile.comebackEarned, tier: "gold", iconKey: "Fire", name: "Comeback", desc: "Freeze saved a streak" },
    { unlocked: weekOne, tier: "silver", iconKey: "Calendar", name: "Week One", desc: weekOne ? "7-day streak" : `${Math.max(0, 7 - best)} days to go` },
    { unlocked: monthStrong, tier: "gold", iconKey: "Calendar", name: "Month Strong", desc: monthStrong ? "30-day streak" : `${Math.max(0, 30 - best)} days to go` },
    { unlocked: centurion, tier: "master", iconKey: "Fire", name: "Centurion", desc: centurion ? "100-day streak" : `${Math.max(0, 100 - best)} days to go` },
  ];

  if (masterCategory) {
    badges.push({ unlocked: true, tier: "master", iconKey: "Brain", name: `${prettyCategory(masterCategory.name)} Master`, desc: `${masterCategory.correct} correct` });
  }

  return badges;
}
