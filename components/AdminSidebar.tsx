"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminSidebar({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname() ?? "/admin";
  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <aside className="admin-side">
      <div className="admin-side-h">Operate</div>
      <Link href="/admin" className={isActive("/admin") ? "active" : ""}>
        <span aria-hidden="true">📊</span> Dashboard
      </Link>
      <Link
        href="/admin/pending"
        className={isActive("/admin/pending") ? "active" : ""}
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
      >
        <span aria-hidden="true">🚩</span> Flagged
      </Link>
      <Link
        href="/admin/search"
        className={isActive("/admin/search") ? "active" : ""}
      >
        <span aria-hidden="true">🔍</span> Question search
      </Link>
      <div className="admin-side-h">Schedule</div>
      <Link
        href="/admin/preview"
        className={isActive("/admin/preview") ? "active" : ""}
      >
        <span aria-hidden="true">📅</span> Tomorrow&apos;s quiz
      </Link>
    </aside>
  );
}
