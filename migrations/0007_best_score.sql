-- All-time best point score (0–1000) for the user_stats rollup.
-- Backfilled from existing attempts so returning players keep their record.
ALTER TABLE user_stats ADD COLUMN best_score INTEGER NOT NULL DEFAULT 0;

UPDATE user_stats
SET best_score = (
  SELECT COALESCE(MAX(qa.final_score), 0)
  FROM quiz_attempts qa
  WHERE qa.user_id = user_stats.user_id
);
