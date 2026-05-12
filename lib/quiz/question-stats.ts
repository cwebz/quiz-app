// Per-question lifetime stats stored in KV (per PRD section 9).
//
// Keys:
//   q:{id}:correct  → integer count of correct answers
//   q:{id}:total    → integer count of total answers (correct + wrong)
//
// KV doesn't support atomic increments. At this scale (low concurrency,
// lifetime stats) read-modify-write is fine — the worst case is dropping
// a tick now and then, which doesn't compound and rounds out in practice.

type KV = KVNamespace;

function totalKey(questionId: number): string {
  return `q:${questionId}:total`;
}
function correctKey(questionId: number): string {
  return `q:${questionId}:correct`;
}

async function incrementKey(kv: KV, key: string): Promise<void> {
  const raw = await kv.get(key);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  await kv.put(key, next.toString());
}

export async function recordAnswer(
  kv: KV,
  questionId: number,
  wasCorrect: boolean,
): Promise<void> {
  await incrementKey(kv, totalKey(questionId));
  if (wasCorrect) {
    await incrementKey(kv, correctKey(questionId));
  }
}

export type QuestionStats = {
  correct: number;
  total: number;
  /** 0–100, rounded. `null` when no one has answered this question yet. */
  rate: number | null;
};

export async function getQuestionStats(
  kv: KV,
  questionId: number,
): Promise<QuestionStats> {
  const [correctRaw, totalRaw] = await Promise.all([
    kv.get(correctKey(questionId)),
    kv.get(totalKey(questionId)),
  ]);
  const correct = correctRaw ? Number.parseInt(correctRaw, 10) : 0;
  const total = totalRaw ? Number.parseInt(totalRaw, 10) : 0;
  if (total === 0) {
    return { correct: 0, total: 0, rate: null };
  }
  return {
    correct,
    total,
    rate: Math.round((correct / total) * 100),
  };
}
