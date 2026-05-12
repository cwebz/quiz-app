// Per PRD section 9.

export const QUESTION_TIME_LIMIT_MS = 20_000;
export const NETWORK_GRACE_MS = 200;

export function speedBonus(timeTakenMs: number): number {
  const clamped = Math.max(0, Math.min(QUESTION_TIME_LIMIT_MS, timeTakenMs));
  const seconds = clamped / 1000;
  const factor = (20 - seconds) / 20;
  return Math.round(100 * factor * factor);
}

export function questionScore(wasCorrect: boolean, timeTakenMs: number): number {
  if (!wasCorrect) return 0;
  return 100 + speedBonus(timeTakenMs);
}

export type AnsweredForScoring = {
  wasCorrect: boolean;
  timeTakenMs: number;
};

export function correctCount(answered: AnsweredForScoring[]): number {
  return answered.reduce((n, a) => n + (a.wasCorrect ? 1 : 0), 0);
}

export function finalScore(answered: AnsweredForScoring[]): number {
  return answered.reduce(
    (sum, a) => sum + questionScore(a.wasCorrect, a.timeTakenMs),
    0,
  );
}
