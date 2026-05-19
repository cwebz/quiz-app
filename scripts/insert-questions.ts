import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";
import { questions } from "../db/schema/questions";

type InputQuestion = {
  text: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  category: string;
  difficulty: "easy" | "medium" | "hard";
  sourceUrl?: string;
};

function parseArgs() {
  const args = { file: "", remote: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--file=")) args.file = arg.slice(7);
    if (arg === "--remote") args.remote = true;
  }
  if (!args.file) throw new Error("--file=<path> is required");
  return args;
}

function hashText(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function insertLocal(input: InputQuestion[]) {
  const proxy = await getPlatformProxy<CloudflareEnv>();
  try {
    const db = drizzle(proxy.env.DB);
    let inserted = 0;
    let skipped = 0;

    for (const q of input) {
      const result = await db
        .insert(questions)
        .values({
          externalId: hashText(q.text),
          source: "claude-generated",
          text: q.text,
          correctAnswer: q.correctAnswer,
          incorrectAnswers: q.incorrectAnswers,
          category: q.category,
          difficulty: q.difficulty,
          status: "pending",
          sourceUrl: q.sourceUrl ?? null,
        })
        .onConflictDoNothing({
          target: [questions.source, questions.externalId],
        })
        .returning({ id: questions.id });

      if (result.length > 0) {
        inserted++;
        console.log(`  ✓ [id=${result[0].id}] ${q.text.slice(0, 60)}…`);
      } else {
        skipped++;
        console.log(`  – duplicate skipped: ${q.text.slice(0, 60)}…`);
      }
    }

    console.log(`\nDone. inserted: ${inserted}, skipped: ${skipped}`);
  } finally {
    await proxy.dispose();
  }
}

async function insertRemote(input: InputQuestion[]) {
  let inserted = 0;

  for (const q of input) {
    const externalId = hashText(q.text);
    const incorrectAnswers = JSON.stringify(q.incorrectAnswers);
    const sql = [
      `INSERT INTO questions (external_id, source, text, correct_answer, incorrect_answers, category, difficulty, status, source_url)`,
      `VALUES (${sqlStr(externalId)}, 'claude-generated', ${sqlStr(q.text)}, ${sqlStr(q.correctAnswer)}, ${sqlStr(incorrectAnswers)}, ${sqlStr(q.category)}, ${sqlStr(q.difficulty)}, 'pending', ${q.sourceUrl ? sqlStr(q.sourceUrl) : "NULL"})`,
      `ON CONFLICT(source, external_id) DO NOTHING;`,
    ].join(" ");

    execSync(
      `npx wrangler d1 execute smarter-than-the-internet --remote --command ${JSON.stringify(sql)}`,
      { stdio: "inherit" },
    );

    inserted++;
    console.log(`  ✓ ${q.text.slice(0, 60)}…`);
  }

  console.log(`\nDone. inserted up to ${inserted} (duplicates silently skipped by D1).`);
}

async function main() {
  const { file, remote } = parseArgs();
  const input: InputQuestion[] = JSON.parse(readFileSync(file, "utf-8"));

  console.log(
    `Inserting ${input.length} question(s) into ${remote ? "production" : "local"} D1 as pending...\n`,
  );

  if (remote) {
    await insertRemote(input);
  } else {
    await insertLocal(input);
  }
}

main().catch((err) => {
  console.error("\nInsert failed:", err);
  process.exit(1);
});
