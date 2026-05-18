"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ico } from "./Icons";

export function MobileNavMenu({
  showAdmin,
  showLeaderboard,
}: {
  showAdmin: boolean;
  showLeaderboard: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const isToday = pathname === "/" || pathname.startsWith("/quiz");
  const isProfile = pathname.startsWith("/profile");
  const isLeaderboard = pathname.startsWith("/leaderboard");
  const isAdminPath = pathname.startsWith("/admin");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="mobile-nav-menu" ref={rootRef}>
      <button
        type="button"
        className="mobile-nav-btn"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-popover"
        onClick={() => setOpen((o) => !o)}
      >
        <Ico.Menu style={{ width: 22, height: 22 }} />
      </button>
      {open && (
        <div
          id="mobile-nav-popover"
          className="mobile-nav-popover"
          role="menu"
        >
          <Link
            href="/"
            role="menuitem"
            className={isToday ? "active" : ""}
            onClick={close}
          >
            Today
          </Link>
          {showLeaderboard && (
            <Link
              href="/leaderboard"
              role="menuitem"
              className={isLeaderboard ? "active" : ""}
              onClick={close}
            >
              Friends
            </Link>
          )}
          <Link
            href="/profile"
            role="menuitem"
            className={isProfile ? "active" : ""}
            onClick={close}
          >
            Profile
          </Link>
          {showAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              className={isAdminPath ? "active" : ""}
              onClick={close}
            >
              Admin
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
