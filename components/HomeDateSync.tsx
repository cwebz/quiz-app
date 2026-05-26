"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function getLocalDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Home page is a server component but needs to render in the user's local
 * date (not the Worker's UTC). On mount we:
 *
 *   1. Write a `stti.local_date` cookie so future server renders pick up the
 *      correct date without a redirect.
 *   2. If the server rendered with a different date than the browser's local
 *      date, navigate to `/?date=YYYY-MM-DD` so the next render is correct.
 *
 * The cookie path covers normal browsing; the redirect path covers the first
 * visit when no cookie exists yet.
 */
export function HomeDateSync({ serverDate }: { serverDate: string }) {
  const router = useRouter();
  useEffect(() => {
    const localDate = getLocalDateString();
    // Refresh the cookie every visit. SameSite=Lax so it travels with normal
    // top-level nav (including the OAuth round-trip). Not Secure so it works
    // on http://localhost during dev; the date is non-sensitive.
    document.cookie = `stti.local_date=${localDate}; Path=/; Max-Age=86400; SameSite=Lax`;
    if (localDate !== serverDate) {
      router.replace(`/?date=${localDate}`);
    }
  }, [serverDate, router]);
  return null;
}
