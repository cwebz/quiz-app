import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const questions = sqliteTable(
  "questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id").notNull(),
    source: text("source", { enum: ["the-trivia-api", "opentdb"] }).notNull(),
    text: text("text").notNull(),
    correctAnswer: text("correct_answer").notNull(),
    incorrectAnswers: text("incorrect_answers", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    category: text("category").notNull(),
    difficulty: text("difficulty", {
      enum: ["easy", "medium", "hard"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "approved", "rejected"],
    })
      .notNull()
      .default("approved"),
    flagCount: integer("flag_count").notNull().default(0),
    manuallyEdited: integer("manually_edited", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("questions_source_external_id_unq").on(t.source, t.externalId),
  ],
);

export const questionFlags = sqliteTable("question_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id),
  userId: integer("user_id").references(() => users.id),
  guestId: text("guest_id"),
  reason: text("reason"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  // Partial unique indexes (question_flags_user_unq / question_flags_guest_unq)
  // enforced via migration 0003_flag_dedup.sql — one flag per player per question.
});
