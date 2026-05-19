Generate trivia questions for Smarter Than The Internet and insert them into D1 as pending questions for admin review.

## Usage
```
/generate-questions [topic]
/generate-questions [topic] --remote
```

- `topic` — optional subject or event (e.g. "2025 Super Bowl", "Taylor Swift Eras Tour", "James Webb Telescope discoveries")
- `--remote` — insert directly into production D1 instead of local

## Instructions

### 1. Determine topic
If `$ARGUMENTS` contains a topic (any text other than `--remote`), use that. Otherwise pick something timely and interesting based on today's date — a recent event, anniversary, pop culture moment, or current season.

### 2. Research the topic
Use web search to find 2–3 authoritative, citable sources (Wikipedia, major news outlets, official sites). Record the best source URL — this will be stored with each question so the admin can fact-check before approving.

### 3. Generate 5 questions
Each question must:
- Be multiple choice with **exactly 3 incorrect answers**
- Have a single unambiguous correct answer grounded in the sources you found
- Use incorrect answers that are plausible but clearly wrong on reflection
- Mix difficulty: aim for 2 easy, 2 medium, 1 hard
- Map to exactly one of these categories:
  - `arts_and_literature`
  - `film_and_tv`
  - `food_and_drink`
  - `music`
  - `science`
  - `geography`
  - `society_and_culture`
  - `sport_and_leisure`
  - `history`
  - `general_knowledge`

### 4. Write questions to a temp file
Write the questions to `/tmp/generated-quiz-questions.json` in this exact format:

```json
[
  {
    "text": "Question text here?",
    "correctAnswer": "The correct answer",
    "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
    "category": "history",
    "difficulty": "medium",
    "sourceUrl": "https://en.wikipedia.org/wiki/..."
  }
]
```

### 5. Apply the migration if needed
Before inserting, check whether the `source_url` column exists on the local DB:

```bash
cd web && npx wrangler d1 execute smarter-than-the-internet --local --command "SELECT source_url FROM questions LIMIT 1;" 2>&1
```

If it errors with "no such column", run the migration first:
```bash
cd web && npm run db:local
```

### 6. Insert questions
Run from the `web/` directory:

```bash
# Local (default — for review before pushing to prod):
cd web && npx tsx scripts/insert-questions.ts --file=/tmp/generated-quiz-questions.json

# Production:
cd web && npx tsx scripts/insert-questions.ts --file=/tmp/generated-quiz-questions.json --remote
```

### 7. Report results
Print a summary table:

| # | Question (truncated) | Correct Answer | Difficulty | Category | Source |
|---|----------------------|----------------|------------|----------|--------|
| 1 | ... | ... | medium | history | [link] |

Then remind the user: **Questions are inserted as `pending` — visit `/admin/pending` to review and approve before they enter the quiz pool.**
