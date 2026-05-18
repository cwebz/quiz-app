"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";

export function AvatarDropdown({
  initials,
  displayName,
  email,
}: {
  initials: string;
  displayName: string;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="avatar-menu" ref={rootRef}>
      <button
        type="button"
        className="avatar-btn"
        aria-label={`Account menu for ${displayName}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>
      {open && (
        <div className="avatar-dropdown" role="menu">
          <div className="avatar-dropdown-identity">
            <div className="avatar-dropdown-name">{displayName}</div>
            {email && <div className="avatar-dropdown-email">{email}</div>}
          </div>
          <Link
            href="/profile"
            role="menuitem"
            className="avatar-dropdown-link"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="avatar-dropdown-signout"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
