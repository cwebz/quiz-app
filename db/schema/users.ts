import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  googleId: text("google_id").unique(),
  email: text("email"),
  displayName: text("display_name"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const userStats = sqliteTable("user_stats", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  totalQuizzes: integer("total_quizzes").notNull().default(0),
  totalCorrect: integer("total_correct").notNull().default(0),
  lifetimeScore: integer("lifetime_score").notNull().default(0),
  lastPlayedDate: text("last_played_date"),
  freezesUsedThisWeek: integer("freezes_used_this_week").notNull().default(0),
  weekStartDate: text("week_start_date"),
  perfectScores: integer("perfect_scores").notNull().default(0),
  comebackEarned: integer("comeback_earned", { mode: "boolean" }).notNull().default(false),
});

export const categoryMastery = sqliteTable(
  "category_mastery",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    category: text("category").notNull(),
    questionsSeen: integer("questions_seen").notNull().default(0),
    questionsCorrect: integer("questions_correct").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);
