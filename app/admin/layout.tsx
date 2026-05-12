import { eq, sql } from "drizzle-orm";
import { AdminSidebar } from "@/components/AdminSidebar";
import { questions } from "@/db/schema";
import { getDb } from "@/lib/db";

// Auth gating happens in proxy.ts (session-based primary, Basic Auth
// fallback). Putting it here too caused proxy/layout disagreements when
// the request was admitted via Basic Auth but had no session for the
// layout to inspect. Keep proxy.ts as the single source of truth.

async function getPendingCount(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questions)
    .where(eq(questions.status, "pending"));
  return row?.count ?? 0;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pendingCount = await getPendingCount();
  return (
    <div className="admin">
      <AdminSidebar pendingCount={pendingCount} />
      <div className="admin-main">{children}</div>
    </div>
  );
}
