"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function AdminSidebar({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname() ?? "/admin";
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  const close = () => setOpen(false);

  return (
    <aside className="admin-side">
      <button
        type="button"
        className="admin-side-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        <span>Admin menu</span>
        {!open && pendingCount > 0 && (
          <span
            style={{ marginLeft: "auto", fontSize: 11 }}
            className="chip chip--coral"
          >
            {pendingCount}
          </span>
        )}
      </button>

      <div className={`admin-side-links${open ? " admin-side-links--open" : ""}`}>
        <div className="admin-side-h">Operate</div>
        <Link href="/admin" className={isActive("/admin") ? "active" : ""} onClick={close}>
          <span aria-hidden="true">📊</span> Dashboard
        </Link>
        <Link
          href="/admin/pending"
          className={isActive("/admin/pending") ? "active" : ""}
          onClick={close}
        >
          <span aria-hidden="true">⏳</span> Pending
          {pendingCount > 0 && (
            <span
              style={{ marginLeft: "auto", fontSize: 11 }}
              className="chip chip--coral"
            >
              {pendingCount}
            </span>
          )}
        </Link>
        <Link
          href="/admin/flagged"
          className={isActive("/admin/flagged") ? "active" : ""}
          onClick={close}
        >
          <span aria-hidden="true">🚩</span> Flagged
        </Link>
        <Link
          href="/admin/search"
          className={isActive("/admin/search") ? "active" : ""}
          onClick={close}
        >
          <span aria-hidden="true">🔍</span> Question search
        </Link>
        <div className="admin-side-h">Schedule</div>
        <Link
          href="/admin/preview"
          className={isActive("/admin/preview") ? "active" : ""}
          onClick={close}
        >
          <span aria-hidden="true">📅</span> Tomorrow&apos;s quiz
        </Link>
        <div className="admin-side-h">Danger zone</div>
        <Link
          href="/admin/dangerous"
          className={isActive("/admin/dangerous") ? "active" : ""}
          onClick={close}
        >
          <span aria-hidden="true">⚠️</span> Dangerous
        </Link>
      </div>
    </aside>
  );
}
