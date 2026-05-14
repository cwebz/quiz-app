// middleware.ts — Edge runtime (Next.js 15-style, kept as middleware.ts intentionally).
//
// In Next.js 16, proxy.ts always runs as Node.js runtime which @opennextjs/cloudflare
// does not support. Using middleware.ts keeps us on the Edge runtime as required.
//
// Security model:
//   - Unauthenticated browsers → redirect to Google sign-in.
//   - Authenticated session cookie present → pass through.
//     The admin pages/routes themselves re-verify isAdminEmail() server-side,
//     so a signed-in non-admin gets a 403 there. Defense-in-depth.
//
// NOTE: getCloudflareContext and next-auth imports cannot be used here — they
// reference Node.js APIs (process.env.NEXT_RUNTIME, node:crypto via @panva/hkdf)
// which would force Node.js runtime classification. Keep this file import-free.

import { NextResponse, type NextRequest } from "next/server";

// Auth.js v5 session cookie name differs by environment.
function sessionCookieName(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "";
  return proto === "https" || req.nextUrl.protocol === "https:"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function middleware(request: NextRequest) {
  // Any signed-in session cookie → pass through to admin pages, which do
  // the real isAdminEmail() check and return 403 for non-admin accounts.
  const cookieName = sessionCookieName(request);
  const sessionCookie = request.cookies.get(cookieName)?.value ?? null;
  if (sessionCookie) {
    return NextResponse.next();
  }

  // No session — redirect to Google sign-in and come back.
  const signinUrl = new URL("/api/auth/signin", request.url);
  signinUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(signinUrl);
}

export const config = {
  matcher: "/admin/:path*",
};
