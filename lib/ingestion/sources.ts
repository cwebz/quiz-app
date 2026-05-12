import { createHash } from "node:crypto";

export type QuestionSource = "the-trivia-api" | "opentdb";

export type RawQuestion = {
  externalId: string;
  source: QuestionSource;
  text: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  category: string;
  difficulty: "easy" | "medium" | "hard";
};

type TriviaApiResponse = Array<{
  id: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  question: { text: string };
  correctAnswer: string;
  incorrectAnswers: string[];
}>;

export async function fetchTriviaApi(limit: number): Promise<RawQuestion[]> {
  const url = `https://the-trivia-api.com/v2/questions?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`the-trivia-api returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as TriviaApiResponse;
  return data.map((q) => ({
    externalId: q.id,
    source: "the-trivia-api" as const,
    text: q.question.text,
    correctAnswer: q.correctAnswer,
    incorrectAnswers: q.incorrectAnswers,
    category: q.category,
    difficulty: q.difficulty,
  }));
}

type OpenTdbResponse = {
  response_code: number;
  results: Array<{
    type: "multiple" | "boolean";
    difficulty: "easy" | "medium" | "hard";
    category: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
  }>;
};

export async function fetchOpenTdb(limit: number): Promise<RawQuestion[]> {
  const url = `https://opentdb.com/api.php?amount=${limit}&type=multiple&encode=base64`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`opentdb returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as OpenTdbResponse;
  if (data.response_code !== 0) {
    throw new Error(
      `opentdb response_code ${data.response_code} (1=no results, 2=invalid param, 3=token not found, 4=token empty, 5=rate limit)`,
    );
  }
  const decode = (s: string) => Buffer.from(s, "base64").toString("utf-8");
  return data.results.map((q) => {
    const text = decode(q.question);
    return {
      externalId: hashText(text),
      source: "opentdb" as const,
      text,
      correctAnswer: decode(q.correct_answer),
      incorrectAnswers: q.incorrect_answers.map(decode),
      category: decode(q.category),
      difficulty: q.difficulty,
    };
  });
}

function hashText(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
