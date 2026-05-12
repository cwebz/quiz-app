import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { questions } from "./questions";
import { users } from "./users";

export const dailyQuizzes = sqliteTable("daily_quizzes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quizDate: text("quiz_date").notNull().unique(),
  questionIds: text("question_ids", { mode: "json" })
    .$type<number[]>()
    .notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    guestId: text("guest_id"),
    dailyQuizId: integer("daily_quiz_id")
      .notNull()
      .references(() => dailyQuizzes.id),
    score: integer("score").notNull(),
    finalScore: integer("final_score").notNull(),
    totalTimeMs: integer("total_time_ms").notNull(),
    completedAt: text("completed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("quiz_attempts_user_quiz_unq").on(t.userId, t.dailyQuizId),
    uniqueIndex("quiz_attempts_guest_quiz_unq").on(t.guestId, t.dailyQuizId),
    index("quiz_attempts_daily_quiz_idx").on(t.dailyQuizId),
    index("quiz_attempts_daily_quiz_score_idx").on(
      t.dailyQuizId,
      t.finalScore,
    ),
  ],
);

export const questionResponses = sqliteTable("question_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quizAttemptId: integer("quiz_attempt_id")
    .notNull()
    .references(() => quizAttempts.id),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id),
  userAnswer: text("user_answer").notNull(),
  wasCorrect: integer("was_correct", { mode: "boolean" }).notNull(),
  timeTakenMs: integer("time_taken_ms").notNull(),
});
