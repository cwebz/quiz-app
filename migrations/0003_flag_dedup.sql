-- Add guest_id to question_flags so guest deduplication is possible,
-- then add partial unique indexes so one player (user OR guest) can
-- only flag a given question once. The WHERE clause is a SQLite
-- partial-index feature (supported since SQLite 3.8.9, Cloudflare D1 OK).

ALTER TABLE question_flags ADD COLUMN guest_id TEXT;

CREATE UNIQUE INDEX question_flags_user_unq
  ON question_flags(question_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX question_flags_guest_unq
  ON question_flags(question_id, guest_id)
  WHERE guest_id IS NOT NULL;
