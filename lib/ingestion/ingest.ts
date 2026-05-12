import type { DrizzleD1Database } from "drizzle-orm/d1";
import { questions } from "../../db/schema/questions";
import { runFilters, type FilterReason } from "./filters";
import {
  fetchOpenTdb,
  fetchTriviaApi,
  type QuestionSource,
  type RawQuestion,
} from "./sources";

const BATCH_SIZE = 50;
const POLITE_DELAY_MS = 500;
const MAX_CONSECUTIVE_BARREN_BATCHES = 3;

export type IngestResult = {
  inserted: number;
  filtered: number;
  duplicates: number;
  filterBreakdown: Partial<Record<FilterReason, number>>;
};

export type IngestOptions = {
  db: DrizzleD1Database<Record<string, never>>;
  target: number;
  source: QuestionSource;
  onProgress?: (status: {
    batch: number;
    inserted: number;
    filtered: number;
    duplicates: number;
    runningTotal: number;
  }) => void;
};

export async function ingest(opts: IngestOptions): Promise<IngestResult> {
  const { db, target, source, onProgress } = opts;
  const fetcher = source === "the-trivia-api" ? fetchTriviaApi : fetchOpenTdb;

  let inserted = 0;
  let filtered = 0;
  let duplicates = 0;
  const filterBreakdown: Partial<Record<FilterReason, number>> = {};
  let consecutiveBarren = 0;
  let batchNum = 0;

  while (inserted < target) {
    batchNum++;
    const wantThisBatch = Math.min(BATCH_SIZE, target - inserted);
    const batch = await fetcher(wantThisBatch);

    if (batch.length === 0) {
      break;
    }

    let batchInserted = 0;
    let batchFiltered = 0;
    let batchDuplicates = 0;

    for (const q of batch) {
      const reason = runFilters(q);
      if (reason) {
        batchFiltered++;
        filterBreakdown[reason] = (filterBreakdown[reason] ?? 0) + 1;
        continue;
      }

      const result = await insertOne(db, q);
      if (result === "inserted") batchInserted++;
      else batchDuplicates++;
    }

    inserted += batchInserted;
    filtered += batchFiltered;
    duplicates += batchDuplicates;

    onProgress?.({
      batch: batchNum,
      inserted: batchInserted,
      filtered: batchFiltered,
      duplicates: batchDuplicates,
      runningTotal: inserted,
    });

    if (batchInserted === 0) {
      consecutiveBarren++;
      if (consecutiveBarren >= MAX_CONSECUTIVE_BARREN_BATCHES) {
        break;
      }
    } else {
      consecutiveBarren = 0;
    }

    if (inserted < target) {
      await sleep(POLITE_DELAY_MS);
    }
  }

  return { inserted, filtered, duplicates, filterBreakdown };
}

async function insertOne(
  db: DrizzleD1Database<Record<string, never>>,
  q: RawQuestion,
): Promise<"inserted" | "duplicate"> {
  const result = await db
    .insert(questions)
    .values({
      externalId: q.externalId,
      source: q.source,
      text: q.text,
      correctAnswer: q.correctAnswer,
      incorrectAnswers: q.incorrectAnswers,
      category: q.category,
      difficulty: q.difficulty,
    })
    .onConflictDoNothing({ target: [questions.source, questions.externalId] })
    .returning({ id: questions.id });
  return result.length > 0 ? "inserted" : "duplicate";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
