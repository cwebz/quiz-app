"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopnavLinks({
  showAdmin,
  showLeaderboard,
  playedToday,
}: {
  showAdmin: boolean;
  showLeaderboard: boolean;
  playedToday: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const isToday = pathname === "/" || pathname.startsWith("/quiz");
  const todayHref = playedToday ? "/quiz/play" : "/";
  const isProfile = pathname.startsWith("/profile");
  const isLeaderboard = pathname.startsWith("/leaderboard");
  const isAdminPath = pathname.startsWith("/admin");

  return (
    <nav className="topnav">
      <Link href={todayHref} className={isToday ? "active" : ""}>
        Today
      </Link>
      {showLeaderboard && (
        <Link href="/leaderboard" className={isLeaderboard ? "active" : ""}>
          Friends
        </Link>
      )}
      <Link href="/profile" className={isProfile ? "active" : ""}>
        Profile
      </Link>
      {showAdmin && (
        <Link href="/admin" className={isAdminPath ? "active" : ""}>
          Admin
        </Link>
      )}
    </nav>
  );
}
