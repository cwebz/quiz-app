/**
 * Critical happy path: guest plays a full quiz and sees a valid results screen.
 *
 * PRD §4: "one test for the critical happy path — guest plays a full quiz,
 * sees results screen with correct score and percentile."
 *
 * Prereqs (handled by the beforeAll):
 *   - Dev server running on localhost:3000
 *   - Today's quiz seeded (calls /api/dev/seed-today if needed)
 */

import { expect, test } from "@playwright/test";

const TOTAL_QUESTIONS = 5;

test.beforeAll(async ({ request }) => {
  // Ensure today's daily quiz exists before the test runs.
  const today = await request.get("/api/quiz/today");
  const body = await today.json();
  if (body.status === "no-quiz-today") {
    const seed = await request.post("/api/dev/seed-today");
    expect(seed.ok()).toBeTruthy();
  }
});

test("guest completes a full quiz and sees results", async ({ page }) => {
  // ── Start ────────────────────────────────────────────────────────────────
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("smarter than");
  await page.getByRole("link", { name: /start today/i }).click();

  // The quiz page loads and the first question appears.
  await expect(page.locator(".question-card")).toBeVisible({ timeout: 15_000 });

  // ── Answer all 5 questions ────────────────────────────────────────────────
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    // Wait for a non-disabled answer button. Buttons from the previous
    // question stay in the DOM while disabled; :not([disabled]) ensures
    // we wait for a fresh question's buttons before clicking.
    const answerButtons = page.locator(".answers button:not([disabled])");
    await expect(answerButtons.first()).toBeVisible({ timeout: 15_000 });
    await answerButtons.first().click();

    // The feedback advance button lives inside .feedback. Scoping to that
    // container avoids false matches on the Next.js Dev Tools button which
    // also contains "next" in its aria-label ("Open Next.js Dev Tools").
    const advanceBtn = page.locator(".feedback button:not([disabled])");
    await expect(advanceBtn).toBeVisible({ timeout: 10_000 });
    await advanceBtn.click();
  }

  // ── Results screen ────────────────────────────────────────────────────────
  // Score ring with correct count (0–5).
  await expect(page.locator(".score-ring")).toBeVisible({ timeout: 15_000 });

  // Results hero section visible.
  await expect(page.locator(".results-hero")).toBeVisible();

  // Score chip present (e.g. "3/5 correct").
  await expect(page.locator(".chip").filter({ hasText: /correct/ })).toBeVisible();

  // Points chip present (e.g. "720 pts").
  await expect(page.locator(".chip").filter({ hasText: /pts/ })).toBeVisible();

  // Share card present.
  await expect(
    page.getByRole("button", { name: /copy share text/i }),
  ).toBeVisible();

  // Badges strip present (Phase 4).
  await expect(
    page.getByRole("heading", { name: /badges earned today/i }),
  ).toBeVisible();

  // Histogram present.
  await expect(page.getByText(/how everyone did today/i)).toBeVisible();
});

test("returning guest sees quiz or already-played screen", async ({ page }) => {
  // Navigating to /quiz/play without a prior session either shows a fresh
  // quiz or the no-quiz screen — both are valid states for a new browser
  // context.  This test guards against a blank/error page on load.
  await page.goto("/quiz/play");

  await expect(
    page
      .locator(".question-card")
      .or(page.locator(".results"))
      .or(page.locator(".card")),
  ).toBeVisible({ timeout: 15_000 });
});
