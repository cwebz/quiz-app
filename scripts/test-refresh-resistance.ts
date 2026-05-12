// Drives the browser through the refresh-during-quiz scenario.
// 1. Open /quiz/play, wait for Q1 to render
// 2. Wait 5 seconds (timer ticks from 20s to ~15s)
// 3. Read remaining seconds from the timer
// 4. Reload the page
// 5. Wait for Q1 to render again
// 6. Read remaining seconds again — should be ~10s (continued from where we were), not ~20s
//
// If the localStorage cache is working, step 6 shows a timer that continued
// ticking through the reload. If not, the timer resets to ~20s and we've
// confirmed the cheat is unaddressed.

import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function readTimer(page: import("playwright").Page): Promise<number> {
  const text = await page.locator(".timer").innerText();
  // The timer renders as the integer seconds remaining (e.g., "15").
  const match = text.match(/(\d+)/);
  if (!match) throw new Error(`couldn't parse timer text: ${text}`);
  return Number.parseInt(match[1], 10);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log("Visiting /quiz/play...");
  await page.goto(`${BASE}/quiz/play`);
  await page.waitForSelector(".question-card", { timeout: 15000 });
  // Let the timer tick a moment from the initial 20 to a clearly lower value.
  await page.waitForTimeout(5500);
  const beforeRefresh = await readTimer(page);
  console.log(`Timer before refresh: ${beforeRefresh}s`);

  console.log("Reloading...");
  await page.reload();
  await page.waitForSelector(".question-card", { timeout: 15000 });
  // Tiny pause so the timer can render its first tick.
  await page.waitForTimeout(300);
  const afterRefresh = await readTimer(page);
  console.log(`Timer after refresh:  ${afterRefresh}s`);

  const diff = beforeRefresh - afterRefresh;
  if (afterRefresh >= 19) {
    console.log("\n❌ FAIL: timer reset to 20s on refresh. Cheat path still open.");
    process.exitCode = 1;
  } else if (Math.abs(diff) <= 2) {
    console.log(
      `\n✅ PASS: timer carried over (drift ${diff}s, well under the 2s tolerance).`,
    );
  } else {
    console.log(
      `\n⚠️  Timer continued but drifted by ${diff}s. Larger gap than expected.`,
    );
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
