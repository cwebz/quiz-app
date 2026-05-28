---
name: generate-questions
description: Generate trivia questions for Smarter Than The Internet and insert them into production D1. User invokes with /generate-questions [topic] [--count=N] [--skip-review].
allowed-tools: Read, Bash, WebSearch, Write
---

# Generate Questions

Generate trivia questions for Smarter Than The Internet and insert them into production D1.

**Think like a bar trivia goer**: You're crafting questions that are fun to discuss, rewarding to answer, and grounded in things people actually know about — not academic obscurities.

## Usage

```
/generate-questions [topic] [--count=N] [--skip-review]
```

- `topic` — optional subject or event (e.g. "2025 Super Bowl", "Taylor Swift Eras Tour")
- `--count=N` — number of questions to generate (default: 10)
- `--skip-review` — skip in-chat review; insert all questions to production as `pending`

Without `--skip-review`, Claude presents each question for review. Approved questions are inserted to production as `approved`. Rejected ones are dropped.

---

## The Bar Trivia Goer Mindset

Before you generate any questions, internalize this: **bar trivia questions should be answerable by someone who knows pop culture, history, music, movies, sports, and famous people — NOT someone with a specialized degree.**

A great bar trivia question makes the player go: *"Oh yeah, of course!"* — that satisfying aha moment where the answer feels obvious in retrospect. A bad question makes them go: *"How would anyone know that?"*

### What Makes a Good Question

✓ **Good**: "Which author wrote The Hunger Games?" (Suzanne Collins)
- Connects to a cultural touchstone (popular book/movie series)
- Answer is something a well-informed casual person would know
- Rewarding when you get it right
- Fun to discuss: "Oh yeah, Suzanne Collins! I loved those books!"

✗ **Bad**: "The language Spanish belongs to which language family?" (Romance/Indo-European)
- Requires academic linguistic knowledge
- Answer is something you'd learn in a college course, not casual conversation
- Not relatable to most people
- No "aha!" moment, just blank stares

✓ **Good**: "With which sport is Billie Jean King associated?" (Tennis)
- About a real, famous person people discuss
- Answer is straightforward and relatable
- Could spark a conversation about tennis, feminism in sports, etc.

### The Difficulty Sweet Spot

- **Easy questions** can be about very famous people/events but still feel worth answering (Billie Jean King, The Hunger Games)
- **Medium questions** require connecting two pieces of knowledge (author to book, actor to role, event to year)
- **Hard questions** are obscure *within a relatable domain* — not academic knowledge, just the deeper cuts of pop culture/history that dedicated fans would know

❌ **DON'T go hard on academic/technical knowledge.** "What is the chemical formula for photosynthesis?" is not bar trivia — it's a biology exam.

---

## Feedback Loop: Continuous Learning

**Before you generate any questions**, check the feedback log to see what types of questions have been working well and what needs improvement:

```bash
cat ~/.claude/skills/generate-questions-feedback.json 2>/dev/null || echo "No feedback log yet"
```

Review recent feedback patterns (last 5-10 generations) to understand:
- What topics/question types the user loves
- Common rejections and why
- Wording patterns that work vs. don't work
- Difficulty calibration the user prefers

Use this to **inform your generation approach** — not as hard rules, but as guidance that makes your questions better aligned with what the user values.

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

**Important**: As you research, think about *what casual people might discuss* about this topic. What are the interesting facts? The surprising connections? The memorable details?

---

## Step 3 — Generate questions

Generate exactly `count` questions. Each must have:

### Question Text (the hardest part)
- **Clear & unambiguous** — no trick wording, no double meanings. If a smart person reads it, they should understand what you're asking.
- **Concise** — usually 1–2 sentences max. You're aiming for a hook, not a paragraph.
  - ⚠️ Players have 20 seconds per question and read on mobile devices
  - Avoid lengthy backstories or complex multi-part questions
  - No padding or filler words
- **An engaging hook** — frame it to draw interest. Compare:
  - ❌ "Taylor Swift wrote an album in what year?" (boring, generic)
  - ✓ "Which album did Taylor Swift release in 2022?" (slightly better, but still flat)
  - ✓ "Taylor Swift re-recorded her first six albums starting in 2021 — what are these re-recordings called?" (engaging, specific, makes you *want* to answer)

### Answers
- **Correct answer**: Exactly 1, grounded in your sources
- **Wrong answers**: Exactly 3 plausible but clearly wrong options
  - Make them realistic (not absurd) — a player who knows *something* about the topic should be able to reason through it
  - Spread them out — don't cluster near the right answer numerically or conceptually
  - Keep them brief to match the question

### Metadata
- **Difficulty**: `easy`, `medium`, or `hard` — distribute evenly across the set
  - Base difficulty on *relatable knowledge*, not academic barriers
- **Category**: Pick from this list only:
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
- **Source URL**: Point to the authoritative source for fact-checking

---

## Step 4 — Self-Evaluation Checklist

**Before presenting questions to the user, run through this checklist for EACH question:**

- [ ] **Is this answerable by a bar trivia goer?** Someone who knows pop culture, history, music, movies, and famous people should have a fighting chance.
- [ ] **Does it require a degree?** If the answer is only found in college textbooks or highly specialized fields, reject it.
- [ ] **Is the wording clear?** Read it out loud. Is there any ambiguity? Any trick wording?
- [ ] **Is it concise?** Can you trim it further? Cut every unnecessary word.
- [ ] **Does it have a hook?** Is it framed in a way that makes the player *want* to answer it?
- [ ] **Are the wrong answers plausible?** Could a less-informed player reasonably guess one of them?
- [ ] **Do the wrong answers spread out?** Are they varied enough that it doesn't telegraph the right answer?

**Questions that fail any of these should be regenerated or skipped entirely.**

---

## Step 5 — Branch on `--skip-review`

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

Present each question as a numbered block, one at a time (this lets the user really think about each one):

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

## Step 6 — Feedback Capture (Continuous Improvement)

After questions are approved/rejected, prompt the user for feedback to improve future generations:

> **Feedback for continuous learning:**
> 
> I'd love to learn what worked and what didn't so future questions are even better. Please share:
> - Which questions were approved/rejected and why?
> - Any wording improvements you'd suggest?
> - Topics or question styles you especially want or want to avoid?
> - Difficulty calibration — too easy, too hard, just right?
> 
> You can reply with general feedback or specific notes on individual questions.

Once you have feedback, save it to the feedback log:

```bash
cat >> ~/.claude/skills/generate-questions-feedback.json << 'EOF'
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "topic": "the topic from this generation",
  "count_approved": "number of questions approved",
  "count_rejected": "number of questions rejected",
  "user_feedback": "their feedback text",
  "notes": "any patterns you noticed (e.g., too wordy, good hooks, liked pop culture angle, etc.)"
}
EOF
```

**Why this matters:** Each generation teaches the skill something about what you value. Over time, the feedback log becomes a training guide that makes Claude better at reading *your* preferences and generating questions you'll love.

---

## Notes

- **Feedback is how this skill improves** — Your feedback after each generation trains the skill. Provide honest notes on what worked and what didn't. The more feedback you give, the better future questions become.
- **The self-evaluation checklist is mandatory** — Use it on every question before showing to the user. This is where you catch questions that are too academic, poorly worded, or don't have a hook.
- **Question wording matters more than you think** — A well-worded question about a moderately interesting fact beats a poorly-worded question about something fascinating. Invest time in the phrasing.
- **Bar trivia > Academic trivia** — When in doubt between a relatable question and a technically correct but academic one, always pick the relatable one. Or reject both and try again.
- **Question length is critical** — Keep question text and answers brief (1–2 sentences). Players have only 20 seconds per question and are reading on mobile devices.
- The insert script uses `ON CONFLICT DO NOTHING` — exact duplicate question text is silently skipped
- Questions approved here bypass `/admin/pending` and enter the quiz pool directly
- Questions inserted via `--skip-review` show up at `/admin/pending` for later review

---

## Viewing Your Feedback History

To review your feedback log and see what patterns have emerged:

```bash
bash ~/.claude/skills/generate-questions/view-feedback.sh
```

This shows your recent generations, topics, approval rates, and feedback notes — helping you (and Claude) see what's working well and what needs improvement.

You can also view the raw JSON:

```bash
cat ~/.claude/skills/generate-questions-feedback.json
```
