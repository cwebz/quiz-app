import type { RawQuestion } from "./sources";

const MIN_TEXT_LENGTH = 15;
const MAX_TEXT_LENGTH = 300;
const MIN_ANSWER_LENGTH = 1;
const MAX_ANSWER_LENGTH = 100;

export type FilterReason =
  | "text-too-short"
  | "text-too-long"
  | "answer-too-short"
  | "answer-too-long"
  | "all-caps-answer"
  | "encoding-issue";

export function runFilters(q: RawQuestion): FilterReason | null {
  if (q.text.length < MIN_TEXT_LENGTH) return "text-too-short";
  if (q.text.length > MAX_TEXT_LENGTH) return "text-too-long";

  const answers = [q.correctAnswer, ...q.incorrectAnswers];
  for (const a of answers) {
    if (a.length < MIN_ANSWER_LENGTH) return "answer-too-short";
    if (a.length > MAX_ANSWER_LENGTH) return "answer-too-long";
    if (isAllCaps(a)) return "all-caps-answer";
  }

  if (hasEncodingIssue(q.text) || answers.some(hasEncodingIssue)) {
    return "encoding-issue";
  }

  return null;
}

function isAllCaps(s: string): boolean {
  // Treat short acronyms (USA, NASA) as fine
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (letters.length <= 4) return false;
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function hasEncodingIssue(s: string): boolean {
  if (s.includes("�")) return true;
  if (/&[a-z]+;|&#\d+;/i.test(s)) return true;
  if (/Â\s|â€™|â€œ|â€/.test(s)) return true;
  return false;
}
