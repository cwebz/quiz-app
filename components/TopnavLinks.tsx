"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopnavLinks({
  showAdmin,
  showLeaderboard,
}: {
  showAdmin: boolean;
  showLeaderboard: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const isToday = pathname === "/" || pathname.startsWith("/quiz");
  const isProfile = pathname.startsWith("/profile");
  const isLeaderboard = pathname.startsWith("/leaderboard");
  const isAdminPath = pathname.startsWith("/admin");

  return (
    <nav className="topnav">
      <Link href="/" className={isToday ? "active" : ""}>
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
