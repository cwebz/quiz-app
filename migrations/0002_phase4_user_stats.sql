-- Migration number: 0002 	 2026-05-13T12:36:51.390Z
-- Phase 4 user stats columns

-- Tracks lifetime perfect scores (score = 5/5) for Perfectionist badge.
ALTER TABLE user_stats ADD COLUMN perfect_scores INTEGER NOT NULL DEFAULT 0;

-- Persistent flag: set to 1 the first time a weekly freeze saves a streak.
-- Used to award the Comeback badge exactly once.
ALTER TABLE user_stats ADD COLUMN comeback_earned INTEGER NOT NULL DEFAULT 0;
