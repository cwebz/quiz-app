import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT_DIR = resolve("./screenshots");
mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  let shotIndex = 0;
  const shoot = async (label: string) => {
    shotIndex++;
    const path = resolve(
      OUT_DIR,
      `${String(shotIndex).padStart(2, "0")}_${label}.png`,
    );
    await page.screenshot({ path, fullPage: false });
    console.log(`  saved ${path}`);
  };

  // Home page
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("text=Start today");
  await shoot("home");

  // Quiz play — auto-starts after `today` lookup, so wait for the question card
  await page.goto(`${BASE}/quiz/play`);
  await page.waitForSelector(".question-card", { timeout: 15000 });
  await shoot("question1");

  for (let i = 1; i <= 5; i++) {
    // Click the first answer option in the grid
    const answerButtons = await page.$$(".answer");
    if (answerButtons.length === 0) {
      console.error(`No answer buttons found on question ${i}`);
      break;
    }
    await answerButtons[0].click();

    // Wait for the feedback drawer
    await page.waitForSelector(".feedback", { timeout: 5000 });
    await shoot(`feedback${i}`);

    // Click the advance button (Next or See results)
    const isLast = i === 5;
    const advanceText = isLast ? "See results" : "Next";
    await page.click(`button:has-text("${advanceText}")`);

    if (isLast) {
      await page.waitForSelector(".results-hero", { timeout: 5000 });
      await page.waitForTimeout(800);
      await shoot("results-top");
      // Scroll to capture the recap below the fold
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(200);
      await shoot("results-recap");
    } else {
      await page.waitForSelector(".question-card", { timeout: 5000 });
      await shoot(`question${i + 1}`);
    }
  }

  await browser.close();
  console.log(`\nAll screenshots written to ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
