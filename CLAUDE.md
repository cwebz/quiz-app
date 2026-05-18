@AGENTS.md

# Smarter Than The Internet — Project Context

Daily trivia quiz at **smarterthantheinternet.com**. 5 questions/day, scored by accuracy + speed, ranked against the global player pool via percentile. Side project; goal is a polished daily-habit product under $10/month.

PRD (source of truth for scope, data model, scoring): `../smarter-than-the-internet-prd.md`
Design tokens + brand: `../DESIGN.md`
Product + copy guidelines: `../PRODUCT.md`

---

## Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | Cloudflare Workers | Edge-deployed |
| Frontend + API | Next.js 16 App Router via `@opennextjs/cloudflare` | Non-standard — read AGENTS.md |
| DB | Cloudflare D1 (SQLite) + Drizzle ORM | Wrangler manages migrations, not drizzle-kit |
| Cache | Cloudflare KV | Per-question correctness rates; quiz counters |
| Auth | Auth.js v5 — Google OAuth only | |
| Cron | `scheduled()` handler in `worker.ts` | Runs at 23:55 UTC; selects quiz 2 days ahead (full-day review window) |

**Stack is locked.** Don't suggest alternatives unless the user raises a problem.

---

## Critical Gotchas

### Next.js 16 + opennextjs-cloudflare

- `proxy.ts` is the Next.js 16 name for edge middleware — but opennextjs compiles it as **Node.js runtime**, which Cloudflare Workers blocks.
- This project keeps `middleware.ts` (deprecated in Next.js 16 but still edge runtime) until opennextjs supports proxy.ts. The `"middleware" file convention is deprecated` build warning is expected — ignore it.
- **Never** import `getCloudflareContext`, `next-auth`, or anything that touches `node:crypto` into `middleware.ts`. Those imports force Node.js runtime classification and break the worker.
- `web/worker.ts` is the custom Cloudflare entrypoint — it wraps the opennextjs handler and adds `scheduled()`. It is NOT a Next.js file.
- `package.json` `"build"` script must be `"next build"` (not `opennextjs-cloudflare build`). opennextjs calls `npm run build` internally; if build = opennextjs-cloudflare it recurses infinitely.

### Auth.js v5

- Session cookie: `__Secure-authjs.session-token` (HTTPS) / `authjs.session-token` (HTTP)
- middleware.ts only checks for cookie **presence** — the actual `isAdminEmail()` check runs server-side inside each admin route handler. Defense in depth.
- Required secrets: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`

### D1 + Drizzle

- Migrations are plain SQL in `migrations/`. Run with `wrangler d1 migrations apply`, NOT drizzle-kit. Migrations are source of truth — update `db/schema/*.ts` to match when they drift.
- D1 remote import rejects `BEGIN TRANSACTION` statements. When seeding, extract only `INSERT INTO` lines.
- `getDb()` in `lib/db.ts` returns a Drizzle instance; use it for all queries. Don't access `env.DB` directly in route handlers.

### Cron trigger

- Cron schedule lives in `wrangler.jsonc` under `"triggers"`. **Live in production** — no workers.dev subdomain required.
- Fires at **23:55 UTC** each night and queues the quiz for **2 days out** (e.g. runs May 18 → queues May 20), giving a full day to review questions before they go live.
- A workers.dev subdomain is NOT required for cron triggers — ignore any docs that say otherwise.
- To manually select a quiz: `POST /admin/select-quiz?date=YYYY-MM-DD`
- To force-replace an existing quiz (keeps play state): `POST /admin/select-quiz?date=YYYY-MM-DD&force=true`
- To fully reset a day — delete all play records AND pick new questions: go to **Admin → Dangerous → Reset day**, pick the date, and confirm. The underlying route is `POST /admin/reset-day?date=YYYY-MM-DD`.

---

## Project Layout

```
web/
├── app/
│   ├── page.tsx                  # Home / landing
│   ├── quiz/play/page.tsx        # Quiz UI (single-page state machine, ~1200 lines)
│   ├── profile/page.tsx          # Auth-only stats + badges
│   ├── admin/                    # Protected by middleware + isAdminEmail()
│   │   ├── page.tsx              # Dashboard
│   │   ├── pending/              # Approve/reject questions
│   │   ├── flagged/              # Review user-flagged questions
│   │   ├── search/               # Search questions by text or ID
│   │   ├── preview/              # Preview tomorrow's quiz
│   │   ├── dangerous/            # Destructive actions (reset-day, etc.) with confirmation UI
│   │   └── select-quiz/route.ts  # POST: select/force-replace a date's quiz
│   └── api/quiz/
│       ├── today/                # GET: quiz status + totalQuestions
│       ├── start/                # POST: begin quiz → first question + session token
│       ├── answer/               # POST: submit answer → feedback + advance token
│       ├── continue/             # POST: redeem advance token → next question
│       └── flag/                 # POST: flag a question
├── lib/
│   ├── quiz/
│   │   ├── select.ts             # Daily quiz selection (stratified by category)
│   │   ├── play.ts               # Core game logic: buildStart / processAnswer / processContinue
│   │   ├── scoring.ts            # Points formula (100 base + squared-decay speed bonus)
│   │   ├── token.ts              # HMAC-signed session tokens (no DB row until completion)
│   │   ├── question-stats.ts     # KV-backed per-question correctness rates
│   │   └── adopt.ts              # Guest → authenticated user attempt adoption
│   ├── ingestion/
│   │   ├── sources.ts            # fetchTriviaApi() / fetchOpenTdb()
│   │   ├── ingest.ts             # Dedup, filter, insert pipeline
│   │   └── filters.ts            # Auto-reject heuristics (length, encoding, etc.)
│   ├── db.ts                     # getDb() + getEnv() (Cloudflare binding helpers)
│   └── admin.ts                  # isAdminEmail() check
├── db/schema/                    # Drizzle ORM type definitions (NOT migration source of truth)
├── migrations/                   # Plain SQL — source of truth for DB schema
├── scripts/seed-questions.ts     # One-off seeding script (tsx)
├── worker.ts                     # Cloudflare Worker entrypoint (fetch + scheduled)
├── middleware.ts                  # Edge middleware: session cookie check for /admin/*
└── wrangler.jsonc                # Cloudflare config: D1, KV, routes, cron (cron currently commented out)
```

---

## Quiz Session Flow

```
GET  /api/quiz/today     → { status, date, totalQuestions }
POST /api/quiz/start     → { token, question, questionIndex, totalQuestions }
POST /api/quiz/answer    → { kind:"next", feedback, advanceToken } | { kind:"complete", results }
POST /api/quiz/continue  → { token, question, questionIndex, totalQuestions }
     (repeat answer → continue until kind:"complete")
```

**Token design:** The HMAC-signed token IS the session state. No DB row is written until the quiz is complete. The client stores the token in localStorage — a mid-quiz page refresh is recoverable as long as the token is present.

Two token types (never interchangeable):
- **session token** — contains currentQuestionId + currentServedAt for timing
- **advance token** — issued between questions; next question's timer only starts when redeemed via /continue, so reading feedback doesn't eat the clock

---

## Scoring

```
Per question: wasCorrect ? (100 + speedBonus) : 0
speedBonus:   round(100 × ((20 - seconds) / 20)²)   // squared decay, 0–100
Quiz total:   0–1,000   (5 perfect + instant = 1,000; 5 correct but slow ≥ 500)
```

Percentile is a direct D1 query on completion — not pre-bucketed in KV — because point scores are continuous (0–1,000). The query counts players with `final_score < user_score` among today's completed attempts.

---

## Daily Quiz Selection (`lib/quiz/select.ts`)

- `QUESTIONS_PER_QUIZ = 5`, `REUSE_AVOIDANCE_DAYS = 90`
- **Stratified sampling:** fetch all approved questions (no LIMIT), group by category, Fisher-Yates shuffle categories, pick one per category (freshness-preferred; fallback to first random if all 90-day-used)
- Throws if fewer than 5 categories have approved questions
- Idempotent: returns existing quiz unchanged if one already exists for the date

---

## Categories (10 total, from the-trivia-api.com)

Uneven pool distribution (~80–262 questions per category). Stratified sampling means each daily quiz spans exactly 5 distinct randomly-chosen categories.

---

## npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | `next dev` — fast HMR, D1/KV via Miniflare sandbox |
| `npm run dev:edge` | opennextjs build + `wrangler dev` — matches production exactly; use for edge quirks only |
| `npm run deploy` | Build + deploy to Cloudflare Workers |
| `npm run db:local` | Apply migrations to local D1 |
| `npm run db:prod` | Apply migrations to production D1 |
| `npm run db:studio` | Drizzle Studio (browse local DB) |
| `npm run seed` | Seed questions (runs `scripts/seed-questions.ts` via tsx) |
| `npm run test:e2e` | Playwright end-to-end tests |

---

## Secrets

Local: `.dev.vars` (gitignored)

Production (set via `wrangler secret put <NAME>`):

| Secret | Purpose |
|--------|---------|
| `AUTH_SECRET` | Auth.js JWT signing |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `QUIZ_TOKEN_SECRET` | HMAC key for quiz session tokens |
| `ADMIN_PASSWORD` | Admin area fallback password |

---

## Pre-Deploy Checklist

Run these steps **in order** before every production deploy. Do not skip steps. Fix any failure before proceeding to the next.

### 1. Type check
```bash
cd web && npx tsc --noEmit
```
All type errors must be resolved before continuing.

### 2. Lint
```bash
cd web && npm run lint
```
No ESLint errors. Warnings are acceptable.

### 3. E2E tests
The dev server must be running (`npm run dev`) before invoking the test runner.
```bash
cd web && npm run test:e2e
```
Both tests must pass:
- **`guest completes a full quiz and sees results`** — exercises the full API chain (today → start → answer × 5 → results screen with score, percentile, share card).
- **`returning guest sees quiz or already-played screen`** — guards against a blank/error page on direct nav to `/quiz/play`.

If the `beforeAll` block reports "no-quiz-today", it calls `/api/dev/seed-today` automatically. If that endpoint doesn't exist or returns an error, seed a quiz manually before re-running.

### 4. Migration check
```bash
ls web/migrations/
```
Compare against the last deploy (git log). If any `.sql` files are **newer than the last deployed commit**, they must be applied to production — but **after** the worker deploy (step 7), not before. Mark them for step 8.

### 5. Build verification
Required whenever `worker.ts`, `middleware.ts`, `open-next.config.ts`, or `wrangler.jsonc` changed. Optional (but recommended for confidence) on other changes.
```bash
cd web && npm run dev:edge
```
The opennextjs + wrangler build must complete without errors and the worker must boot. If the build loops infinitely, the `"build"` script in `package.json` has been changed from `"next build"` — fix it before deploying.

### 6. Commit
Stage only the files changed for this task — never `git add -A` blindly. Never commit `.dev.vars` or any file containing secrets.

```bash
git add <specific files>
git commit -m "<type>: <description>"
```

Commit types: `feat`, `fix`, `refactor`, `chore`, `docs`, `hotfix`. Description in present tense. Always ask the user before creating a branch or PR.

### 7. Deploy
```bash
cd web && npm run deploy
```
Builds via opennextjs-cloudflare, deploys to smarterthantheinternet.com + www.smarterthantheinternet.com. Takes ~30–60 seconds. Watch for wrangler errors — a successful deploy ends with "Deployed".

### 8. Post-deploy verification
```bash
curl -s https://smarterthantheinternet.com/api/health
curl -s https://smarterthantheinternet.com/api/quiz/today
```
Both must return HTTP 200. If `/api/quiz/today` returns `{ "status": "no-quiz-today" }` and the deploy succeeded, select a quiz manually (see **Cron trigger** section above).

### 9. Apply production migrations (if flagged in step 4)
```bash
cd web && npm run db:prod
```
Wrangler shows the migration plan before applying — review it before confirming. Run immediately after verifying the deploy in step 8.

---

## v1 Out of Scope

Do NOT suggest: mobile app, social/friends features, non-Google auth, push/email notifications, monetization, AI-generated questions, guest→account history merge, public leaderboard, personalized question selection.
