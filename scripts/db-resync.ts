/**
 * db:resync — pull the production `questions` table into the local D1 sandbox.
 *
 * Production drifts from local over time: `/generate-questions` inserts straight
 * to prod, and question moderation (flag → reject) happens in prod. This script
 * makes local mirror prod's `questions` table exactly (content + status), without
 * copying production user PII (users / attempts / responses stay local-only).
 *
 * How it works:
 *   1. `wrangler d1 export --remote --table=questions --no-schema` dumps prod's
 *      questions as INSERTs, prefixed with `PRAGMA defer_foreign_keys=TRUE;`.
 *   2. We splice `DELETE FROM questions;` right after that PRAGMA so the wipe +
 *      reload run in ONE transaction — FK checks defer to commit, by which point
 *      every referenced question id has been re-inserted. Local question_responses
 *      / question_flags survive intact (they reference a superset of ids).
 *   3. `wrangler d1 execute --local --file=...` applies it.
 *
 * Usage: npm run db:resync
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB_NAME = "smarter-than-the-internet";

type StatusCount = { status: string; n: number };

function requireNode22(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < 22) {
    console.error(
      `Wrangler requires Node.js 22+. You are on ${process.version}.\n` +
        `Run \`nvm use 24\` (or 22) and try again.`,
    );
    process.exit(1);
  }
}

/**
 * Run wrangler, exiting on failure. By default output streams to the terminal;
 * pass `quiet` to capture it (and only surface it if the command fails) — used
 * for the bulk reload, which otherwise prints one JSON result per INSERT.
 */
function wrangler(args: string[], opts: { quiet?: boolean } = {}): void {
  const res = opts.quiet
    ? spawnSync("npx", ["wrangler", ...args], { encoding: "utf8" })
    : spawnSync("npx", ["wrangler", ...args], { stdio: "inherit" });
  if (res.status !== 0) {
    if (opts.quiet) console.error(res.stderr || res.stdout);
    console.error(`\nwrangler ${args.join(" ")} failed (exit ${res.status}).`);
    process.exit(res.status ?? 1);
  }
}

/** Run a read-only query against a D1 instance and parse the --json result. */
function queryStatusCounts(location: "--local" | "--remote"): StatusCount[] {
  const res = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      DB_NAME,
      location,
      "--json",
      "--command",
      "SELECT status, COUNT(*) AS n FROM questions GROUP BY status ORDER BY status;",
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status ?? 1);
  }
  // wrangler --json prints a JSON array; the query result lives in [0].results.
  const json = JSON.parse(res.stdout);
  return (json[0]?.results ?? []) as StatusCount[];
}

function format(counts: StatusCount[]): string {
  const total = counts.reduce((sum, c) => sum + c.n, 0);
  const parts = counts.map((c) => `${c.status}: ${c.n}`);
  return `${parts.join(" | ")}  (total ${total})`;
}

function main(): void {
  requireNode22();

  console.log(`Resyncing local \`questions\` from production (${DB_NAME})...\n`);

  const dir = mkdtempSync(join(tmpdir(), "db-resync-"));
  const rawPath = join(dir, "prod-questions.sql");
  const splicedPath = join(dir, "resync-questions.sql");

  console.log("→ Local before:");
  console.log(`    ${format(queryStatusCounts("--local"))}\n`);

  console.log("→ Exporting production questions table...");
  wrangler([
    "d1",
    "export",
    DB_NAME,
    "--remote",
    "--table=questions",
    "--no-schema",
    `--output=${rawPath}`,
  ]);

  // Splice `DELETE FROM questions;` after the leading defer-FK pragma so the
  // wipe + reload happen in a single deferred-FK transaction.
  const lines = readFileSync(rawPath, "utf8").split("\n");
  const pragmaIdx = lines.findIndex((l) =>
    l.trim().toUpperCase().startsWith("PRAGMA DEFER_FOREIGN_KEYS"),
  );
  if (pragmaIdx === -1) {
    console.error(
      "Export did not start with `PRAGMA defer_foreign_keys` — aborting so " +
        "local child rows (responses/flags) aren't orphaned. Inspect:\n  " +
        rawPath,
    );
    process.exit(1);
  }
  lines.splice(pragmaIdx + 1, 0, "DELETE FROM questions;");
  writeFileSync(splicedPath, lines.join("\n"));

  const insertCount = lines.filter((l) => l.startsWith("INSERT INTO")).length;
  console.log(`→ Reloading ${insertCount} rows into local D1...`);
  wrangler(["d1", "execute", DB_NAME, "--local", `--file=${splicedPath}`], {
    quiet: true,
  });

  const localAfter = queryStatusCounts("--local");
  const prod = queryStatusCounts("--remote");

  console.log("\n✓ Resync complete.");
  console.log(`    Local: ${format(localAfter)}`);
  console.log(`    Prod:  ${format(prod)}`);

  const matches =
    JSON.stringify(localAfter) === JSON.stringify(prod)
      ? "Parity confirmed — local matches production."
      : "⚠️  Counts differ — inspect above (prod may have changed mid-run).";
  console.log(`    ${matches}`);
}

main();
