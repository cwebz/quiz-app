// Captures every user-facing screen at common mobile viewports so we can
// eyeball the layout. Auth-gated screens (profile, signed-in home) are
// hit anonymously since the OAuth flow can't be scripted; those screens'
// unauthed state is what most first-time visitors see anyway.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-13", width: 390, height: 844 },
  { name: "narrow-android", width: 360, height: 740 },
];
const OUT_DIR = resolve("./screenshots/mobile");
mkdirSync(OUT_DIR, { recursive: true });

async function captureViewport(vp: (typeof VIEWPORTS)[number]) {
  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
  const browser = await chromium.launch();
  const basicAuth = `Basic ${Buffer.from("admin:changeme").toString("base64")}`;
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    // Send Basic Auth preemptively (httpCredentials only fires after a 401
    // challenge, which our proxy doesn't issue — it redirects instead).
    extraHTTPHeaders: { Authorization: basicAuth },
  });
  const page = await context.newPage();

  const shoot = async (label: string, fullPage = true) => {
    const path = resolve(OUT_DIR, `${vp.name}__${label}.png`);
    await page.screenshot({ path, fullPage });
    console.log(`  → ${label}`);
  };

  // ── Home (anon)
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  await shoot("01-home-anon");

  // ── Profile (anon) — shows the sign-in card
  await page.goto(`${BASE}/profile`);
  await page.waitForLoadState("networkidle");
  await shoot("02-profile-anon");

  // ── Quiz play (will auto-start since today's quiz is queued)
  await page.goto(`${BASE}/quiz/play`);
  await page.waitForSelector(".question-card", { timeout: 15000 });
  await shoot("03-quiz-question");

  // ── Click first answer → feedback drawer renders
  const opts = await page.$$(".answer");
  await opts[0].click();
  await page.waitForSelector(".feedback", { timeout: 5000 });
  await shoot("04-quiz-feedback");

  // ── Q1 was answered above; loop covers Q2-Q5 (4 "Next" transitions + answer)
  for (let i = 0; i < 4; i++) {
    await page.click('button:has-text("Next")');
    await page.waitForSelector(".question-card", { timeout: 5000 });
    const nextOpts = await page.$$(".answer");
    await nextOpts[0].click();
    await page.waitForSelector(".feedback", { timeout: 5000 });
  }
  // Final feedback has the "See results" button.
  await page.click('button:has-text("See results")');
  await page.waitForSelector(".results-hero", { timeout: 5000 });
  await page.waitForTimeout(500);
  await shoot("05-results");

  // ── Admin dashboard
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState("networkidle");
  await shoot("06-admin-dashboard");

  // ── Admin pending (has Q#2121 in there from earlier test)
  await page.goto(`${BASE}/admin/pending`);
  await page.waitForLoadState("networkidle");
  await shoot("07-admin-pending");

  // ── Admin preview (today + tomorrow quiz queue)
  await page.goto(`${BASE}/admin/preview`);
  await page.waitForLoadState("networkidle");
  await shoot("08-admin-preview");

  await browser.close();
}

async function main() {
  for (const vp of VIEWPORTS) {
    await captureViewport(vp);
  }
  console.log(`\nAll mobile screenshots in ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
