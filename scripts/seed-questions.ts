import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";
import { ingest } from "../lib/ingestion/ingest";
import type { QuestionSource } from "../lib/ingestion/sources";

type Args = {
  target: number;
  source: QuestionSource;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { target: 50, source: "the-trivia-api" };
  for (const arg of argv) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "target") {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--target must be a positive integer, got: ${value}`);
      }
      out.target = n;
    } else if (key === "source") {
      if (value !== "the-trivia-api" && value !== "opentdb") {
        throw new Error(
          `--source must be "the-trivia-api" or "opentdb", got: ${value}`,
        );
      }
      out.source = value;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Seeding up to ${args.target} questions from ${args.source} into local D1...\n`,
  );

  const proxy = await getPlatformProxy<CloudflareEnv>();
  try {
    const db = drizzle(proxy.env.DB);
    const startedAt = Date.now();

    const result = await ingest({
      db,
      target: args.target,
      source: args.source,
      onProgress: (p) => {
        console.log(
          `  batch ${p.batch}: +${p.inserted} inserted, ${p.filtered} filtered, ${p.duplicates} dupes  (running total: ${p.runningTotal}/${args.target})`,
        );
      },
    });

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsedSec}s.`);
    console.log(
      `  inserted: ${result.inserted}\n  filtered: ${result.filtered}\n  duplicates: ${result.duplicates}`,
    );
    if (Object.keys(result.filterBreakdown).length > 0) {
      console.log("  filter breakdown:");
      for (const [reason, count] of Object.entries(result.filterBreakdown)) {
        console.log(`    - ${reason}: ${count}`);
      }
    }
  } finally {
    await proxy.dispose();
  }
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
