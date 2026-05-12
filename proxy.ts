import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";

const REALM =
  'Basic realm="smarter-than-the-internet admin", charset="UTF-8"';

export async function proxy(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });

  // 1. Primary path — signed-in Google account on the admin allowlist.
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (isAdminEmail(email)) {
    return NextResponse.next();
  }

  // 2. Curl/tool fallback — only triggers when the client actually sent an
  //    Authorization header. Browsers that just visit the page DON'T fall
  //    here, so they get redirected to the OAuth signin (step 3) instead
  //    of the browser's native Basic Auth prompt.
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const adminPassword = env.ADMIN_PASSWORD;
    if (adminPassword && checkBasicAuth(authHeader, adminPassword)) {
      return NextResponse.next();
    }
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": REALM },
    });
  }

  // 3. Signed in but not on the allowlist — friendly 403.
  if (email) {
    return new NextResponse(
      "Forbidden — your account isn't on the admin allowlist.",
      { status: 403 },
    );
  }

  // 4. Browser visitor with no session — bounce to Google sign-in and
  //    come back to where they were trying to go.
  const signinUrl = new URL("/api/auth/signin", request.url);
  signinUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(signinUrl);
}

export const config = {
  matcher: "/admin/:path*",
};

function checkBasicAuth(header: string, expectedPassword: string): boolean {
  if (!header.toLowerCase().startsWith("basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const colonAt = decoded.indexOf(":");
  if (colonAt < 0) return false;
  const submitted = decoded.slice(colonAt + 1);
  return timingSafeEqual(submitted, expectedPassword);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
