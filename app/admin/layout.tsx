import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminSidebar } from "@/components/AdminSidebar";
import { questions } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getDb } from "@/lib/db";

// Auth gating: middleware.ts only verifies a session cookie is present
// (it cannot import next-auth without forcing Node.js runtime, which
// opennextjs-cloudflare doesn't support). The real isAdminEmail() check
// runs here in the layout so it covers every admin page, plus per-route
// in each /admin/*/route.ts handler for defense-in-depth.

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
  const session = await auth();
  if (!isAdminEmail(session?.user?.email ?? null)) {
    redirect("/");
  }
  const pendingCount = await getPendingCount();
  return (
    <div className="admin">
      <AdminSidebar pendingCount={pendingCount} />
      <div className="admin-main">{children}</div>
    </div>
  );
}
