// HMAC-signed quiz state tokens. The token IS the quiz session — no DB row
// is created until completion. This means the user can refresh mid-quiz
// without losing state if the client persists the token in localStorage.
//
// Two token "kinds" exist:
//   * session — represents an active question being shown to the player.
//     Carries currentQuestionId + currentServedAt for timing.
//   * advance — represents the "between questions" gap after the player
//     answered but before they clicked Next. Has no timer attached. The
//     server only stamps the next question's currentServedAt when this
//     gets redeemed via /api/quiz/continue, so reading feedback doesn't
//     eat into the next question's clock.
//
// Tokens are tagged so an attacker can't swap a session token for an
// advance token (or vice versa) at a verify endpoint.

export type AnsweredQuestion = {
  questionId: number;
  userAnswer: string;
  wasCorrect: boolean;
  timeTakenMs: number;
};

export type QuizSessionState = {
  dailyQuizId: number;
  guestId: string | null;
  userId: number | null;
  answered: AnsweredQuestion[];
  // Index in dailyQuizzes.questionIds of the question being shown right now.
  currentIndex: number;
  // The question ID being shown right now.
  currentQuestionId: number;
  // Unix ms when this token was issued (used to compute time_taken_ms).
  currentServedAt: number;
};

export type AdvanceState = {
  dailyQuizId: number;
  guestId: string | null;
  userId: number | null;
  answered: AnsweredQuestion[];
  // Index of the question the user will see when they click Next.
  nextIndex: number;
};

const SESSION_TAG = "stti.session.v1";
const ADVANCE_TAG = "stti.advance.v1";

type TaggedPayload<T> = { t: string; p: T };

async function signTagged<T>(
  payload: T,
  tag: string,
  secret: string,
): Promise<string> {
  const data = JSON.stringify({ t: tag, p: payload } satisfies TaggedPayload<T>);
  const sig = await hmac(data, secret);
  return `${b64uEncode(data)}.${sig}`;
}

async function verifyTagged<T>(
  token: string,
  tag: string,
  secret: string,
): Promise<T | null> {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let data: string;
  try {
    data = b64uDecode(encoded);
  } catch {
    return null;
  }
  const expected = await hmac(data, secret);
  if (!timingSafeEqual(sig, expected)) return null;
  let parsed: TaggedPayload<T>;
  try {
    parsed = JSON.parse(data) as TaggedPayload<T>;
  } catch {
    return null;
  }
  if (parsed.t !== tag) return null;
  return parsed.p;
}

export function signToken(
  payload: QuizSessionState,
  secret: string,
): Promise<string> {
  return signTagged(payload, SESSION_TAG, secret);
}

export function verifyToken(
  token: string,
  secret: string,
): Promise<QuizSessionState | null> {
  return verifyTagged<QuizSessionState>(token, SESSION_TAG, secret);
}

export function signAdvanceToken(
  payload: AdvanceState,
  secret: string,
): Promise<string> {
  return signTagged(payload, ADVANCE_TAG, secret);
}

export function verifyAdvanceToken(
  token: string,
  secret: string,
): Promise<AdvanceState | null> {
  return verifyTagged<AdvanceState>(token, ADVANCE_TAG, secret);
}

async function hmac(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64uBytes(new Uint8Array(sigBuf));
}

function b64uEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64uDecode(s: string): string {
  const padded = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(s.length / 4) * 4, "=");
  return decodeURIComponent(escape(atob(padded)));
}

function b64uBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}
