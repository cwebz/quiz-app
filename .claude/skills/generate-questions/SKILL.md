---
name: generate-questions
description: Generate trivia questions for Smarter Than The Internet and insert them into production D1. User invokes with /generate-questions [topic] [--count=N] [--skip-review].
allowed-tools: Read, Bash, WebSearch, Write
---

# Generate Questions

Generate trivia questions for Smarter Than The Internet and insert them into production D1.

## Usage

```
/generate-questions [topic] [--count=N] [--skip-review]
```

- `topic` — optional subject or event (e.g. "2025 Super Bowl", "Taylor Swift Eras Tour")
- `--count=N` — number of questions to generate (default: 10)
- `--skip-review` — skip in-chat review; insert all questions to production as `pending`

Without `--skip-review`, Claude presents each question for review. Approved questions are inserted to production as `approved`. Rejected ones are dropped.

---

## Step 1 — Parse arguments from user input

Extract:
- `topic`: any text that is not a flag
- `count`: value from `--count=N`, default 10 if not provided
- `skipReview`: true if `--skip-review` is present

If no topic is given, pick something timely and interesting based on today's date — a recent event, anniversary, pop culture moment, or current season.

---

## Step 2 — Research the topic

Use web search to find 2–3 authoritative, citable sources (Wikipedia, major news outlets, official sites). Record the best source URL per question for fact-checking.

---

## Step 3 — Generate questions

Generate exactly `count` questions. Each must have:
- Clear, unambiguous question text
- Exactly 1 correct answer (grounded in the sources you found)
- Exactly 3 plausible but clearly wrong incorrect answers
- A difficulty: `easy`, `medium`, or `hard` — distribute evenly across the set
- A category from this list only:
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
- A `sourceUrl` pointing to the authoritative source for that question

---

## Step 4 — Branch on `--skip-review`

### If `--skip-review` is set:

Display a compact summary table:

| # | Question | Answer | Difficulty | Category |
|---|----------|--------|------------|----------|
| 1 | ...      | ...    | medium     | history  |

Then write all questions to `/tmp/generated-quiz-questions.json` and insert to production as `pending`:

```bash
cd /Users/CWeber/Documents/Claude/Projects/Quiz\ App/web && npx tsx scripts/insert-questions.ts --file=/tmp/generated-quiz-questions.json --remote
```

Finish by printing: **"X questions inserted to production as `pending`. Review them at /admin/pending."**

---

### If no `--skip-review` (interactive review):

Present each question as a numbered block, one at a time or all at once if count ≤ 10:

```
[1] MEDIUM — history
Q: Question text here?
✓  Correct answer
✗  Wrong answer 1
✗  Wrong answer 2
✗  Wrong answer 3
🔗 https://source-url.com
```

After showing all questions, ask:

> Which questions do you want to approve? Reply with "all", "none", or a list of numbers (e.g. "1 2 4 7"). You can also say "all except 3 5".

Wait for the user's response. Parse their reply to determine the approved set.

Once you have the approved list, confirm:

> Ready to insert **X approved questions** into production as `approved`. Proceed?

Wait for confirmation (yes/no). If confirmed:

1. Write only the approved questions to `/tmp/generated-quiz-questions.json` with a `status` field of `"approved"`
2. Run the insert script:

```bash
cd /Users/CWeber/Documents/Claude/Projects/Quiz\ App/web && npx tsx scripts/insert-questions.ts --file=/tmp/generated-quiz-questions.json --remote
```

Finish by printing: **"X questions inserted to production as `approved` and will be eligible for quiz selection immediately."**

---

## Notes

- The insert script uses `ON CONFLICT DO NOTHING` — exact duplicate question text is silently skipped
- Questions approved here bypass `/admin/pending` and enter the quiz pool directly
- Questions inserted via `--skip-review` show up at `/admin/pending` for later review
