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
    source: text("source").notNull(),
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
  reason: text("reason"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
