import { eq } from "drizzle-orm";
import type { Session } from "next-auth";
import Link from "next/link";
import { auth } from "@/auth";
import { userStats, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { AvatarDropdown } from "./AvatarDropdown";
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
  try {
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
  } catch (err) {
    // D1 hiccup or other transient failure — don't let it crash the whole
    // layout. Fall back to a generic chip; the user can still navigate.
    console.warn("[Topbar] loadProfileStub failed:", err);
    return { displayName: "Player", currentStreak: 0 };
  }
}

export async function Topbar() {
  // auth() can throw on transient errors (D1 hiccups inside the JWT callback,
  // JWT decrypt failures after AUTH_SECRET rotation, etc). Topbar lives in the
  // root layout, so an unhandled throw here crashes EVERY route into the
  // global error boundary. Treat any failure as "logged out" and render
  // normally.
  let session: Session | null = null;
  try {
    session = (await auth()) as Session | null;
  } catch (err) {
    console.warn("[Topbar] auth() failed; rendering as logged-out:", err);
  }
  const userId = session?.userId;
  const email = session?.user?.email ?? null;
  const isAdmin = isAdminEmail(email);
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
          <SignedInChip userId={userId} email={email} />
        ) : (
          <SignInButton
            label="Sign in"
            style={{ padding: "14px 18px", fontSize: 13 }}
          />
        )}
      </div>
    </header>
  );
}

async function SignedInChip({ userId, email }: { userId: number; email: string | null }) {
  const profile = await loadProfileStub(userId);
  return (
    <>
      {profile.currentStreak > 0 && (
        <span className="streak-pill">
          <Ico.Fire style={{ width: 14, height: 14 }} /> {profile.currentStreak}
        </span>
      )}
      <AvatarDropdown
        initials={initials(profile.displayName)}
        displayName={profile.displayName}
        email={email}
      />
    </>
  );
}
