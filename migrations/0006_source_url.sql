-- Migration number: 0006	 2026-05-19
-- Add source_url to support Claude-generated questions with citable sources
ALTER TABLE questions ADD COLUMN source_url TEXT;
