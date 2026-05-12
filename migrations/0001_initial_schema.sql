-- Migration number: 0001 	 2026-05-08T18:25:45.514Z
-- Initial schema — see PRD section 5

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE,
  email TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  incorrect_answers TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  flag_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX questions_source_external_id_unq ON questions(source, external_id);

CREATE TABLE daily_quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_date TEXT NOT NULL UNIQUE,
  question_ids TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  guest_id TEXT,
  daily_quiz_id INTEGER NOT NULL REFERENCES daily_quizzes(id),
  score INTEGER NOT NULL,
  final_score INTEGER NOT NULL,
  total_time_ms INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX quiz_attempts_user_quiz_unq ON quiz_attempts(user_id, daily_quiz_id);
CREATE UNIQUE INDEX quiz_attempts_guest_quiz_unq ON quiz_attempts(guest_id, daily_quiz_id);
CREATE INDEX quiz_attempts_daily_quiz_idx ON quiz_attempts(daily_quiz_id);
CREATE INDEX quiz_attempts_daily_quiz_score_idx ON quiz_attempts(daily_quiz_id, final_score);

CREATE TABLE question_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  user_answer TEXT NOT NULL,
  was_correct INTEGER NOT NULL CHECK (was_correct IN (0, 1)),
  time_taken_ms INTEGER NOT NULL
);

CREATE TABLE user_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  total_quizzes INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  lifetime_score INTEGER NOT NULL DEFAULT 0,
  last_played_date TEXT,
  freezes_used_this_week INTEGER NOT NULL DEFAULT 0,
  week_start_date TEXT
);

CREATE TABLE category_mastery (
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  questions_seen INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, category)
);

CREATE TABLE question_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  user_id INTEGER REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
