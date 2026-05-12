// Augments the auto-generated cloudflare-env.d.ts with secrets and vars
// that aren't declared in wrangler.jsonc (e.g. values from .dev.vars or
// `wrangler secret put`). Keep in sync with the env actually populated.
declare global {
  namespace Cloudflare {
    interface Env {
      ADMIN_PASSWORD?: string;
      QUIZ_TOKEN_SECRET?: string;
      AUTH_SECRET?: string;
      AUTH_URL?: string;
      AUTH_GOOGLE_ID?: string;
      AUTH_GOOGLE_SECRET?: string;
    }
  }
}

export {};
