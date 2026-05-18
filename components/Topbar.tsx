import { eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { userStats, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { Ico } from "./Icons";
import { MobileNavMenu } from "./MobileNavMenu";
import { SignInButton } from "./SignInButton";
import { TopnavLinks } from "./TopnavLinks";

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

async function loadProfileStub(userId: number) {
  const db = await getDb();
  const [row] = await db
    .select({
      displayName: users.displayName,
      currentStreak: userStats.currentStreak,
    })
    .from(users)
    .leftJoin(userStats, eq(users.id, userStats.userId))
    .where(eq(users.id, userId))
    .limit(1);
  return {
    displayName: row?.displayName ?? "Player",
    currentStreak: row?.currentStreak ?? 0,
  };
}

export async function Topbar() {
  const session = await auth();
  const userId = session?.userId;
  const isAdmin = isAdminEmail(session?.user?.email ?? null);
  const showLeaderboard = userId !== undefined;

  return (
    <header className="topbar">
      <MobileNavMenu showAdmin={isAdmin} showLeaderboard={showLeaderboard} />
      <Link
        href="/"
        className="brand"
        aria-label="Smarter Than The Internet — Home"
      >
        <span className="brand-dot">
          <Ico.Brain style={{ width: 20, height: 20 }} />
        </span>
        Smarter
      </Link>
      <TopnavLinks showAdmin={isAdmin} showLeaderboard={showLeaderboard} />
      <div className="topright">
        {userId !== undefined ? (
          <SignedInChip userId={userId} />
        ) : (
          <SignInButton
            label="Sign in"
            style={{ padding: "10px 18px", fontSize: 13 }}
          />
        )}
      </div>
    </header>
  );
}

async function SignedInChip({ userId }: { userId: number }) {
  const profile = await loadProfileStub(userId);
  return (
    <>
      {profile.currentStreak > 0 && (
        <span className="streak-pill">
          <Ico.Fire style={{ width: 14, height: 14 }} /> {profile.currentStreak}
        </span>
      )}
      <Link
        href="/profile"
        className="avatar"
        aria-label={`Open profile for ${profile.displayName}`}
        style={{ textDecoration: "none" }}
      >
        {initials(profile.displayName)}
      </Link>
    </>
  );
}
