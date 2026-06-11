// Durable, server-side anchor for the in-progress quiz session. The client
// also keeps the session in localStorage, but iOS Safari wipes localStorage
// under some privacy settings — cookies survive (that's why auth still works).
// /start reads this cookie to RESUME instead of building a fresh quiz, so a
// reload can't restart the quiz. Not HttpOnly: the token is already exposed to
// the client (localStorage + response bodies), and the client checks for the
// cookie's presence to auto-resume on boot.

const SESSION_COOKIE = "stti.qs";
const MAX_AGE_SECONDS = 86_400; // one day; the quiz is a single UTC day anyway

/** Read the raw session token from the request's Cookie header, or null. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function secureFor(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Set-Cookie value that stores the current session/advance token. */
export function setSessionCookie(token: string, request: Request): string {
  const secure = secureFor(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
}

/** Set-Cookie value that clears the session cookie (quiz finished/abandoned). */
export function clearSessionCookie(request: Request): string {
  const secure = secureFor(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
