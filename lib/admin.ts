// Admin allowlist for the app.
//
// Single source of truth — referenced by the admin layout, each admin
// route handler, and the Topbar (so non-admins don't see an "Admin" nav
// link they'd just bounce off of). Add an email here + redeploy to grant
// access; remove + redeploy to revoke.

const ADMIN_EMAILS = new Set<string>([
  "cweber@divcom.com",
  "cwebz03@gmail.com",
]);

/**
 * True iff the supplied email is on the admin allowlist. Case-insensitive.
 * Returns false for null/undefined/empty input.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}
