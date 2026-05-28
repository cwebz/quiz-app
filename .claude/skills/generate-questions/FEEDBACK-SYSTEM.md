# Feedback System for /generate-questions

This skill includes a **continuous learning feedback loop**. Every time you generate questions and provide feedback, the skill learns what you value and gets better.

## How It Works

### 1. **Before Generation**
Claude checks your feedback history to understand your preferences:
- What topics/styles work best
- Common patterns in approved vs. rejected questions
- Your wording preferences
- Difficulty calibration you prefer

### 2. **After Generation**
You provide feedback on the questions, noting:
- Which were approved/rejected and why
- Wording that could improve
- Topics or styles to emphasize or avoid
- Difficulty feedback (too easy, too hard, just right)

### 3. **Feedback Storage**
Feedback is saved to a JSON log at `~/.claude/skills/generate-questions-feedback.json` with:
- Timestamp of the generation
- Topic
- Approval/rejection counts
- Your written feedback
- Claude's pattern observations

### 4. **Continuous Improvement**
Claude reviews recent feedback patterns before the next generation, applying lessons to create better questions aligned with your preferences.

## Providing Good Feedback

**Good feedback:**
> "Q2 was too academic (synaptic connections). Q1 nailed it (pop culture angle with Mayim Bialik). Love when questions connect to real people or shows people actually watch. Q3 was wordy — make question text punchier."

**Less helpful:**
> "Good job!"

The more specific your feedback, the faster the skill learns.

## Viewing Your Feedback History

```bash
bash ~/.claude/skills/generate-questions/view-feedback.sh
```

Or see raw JSON:
```bash
cat ~/.claude/skills/generate-questions-feedback.json
```

## Example Feedback Log Entry

```json
{
  "timestamp": "2026-05-28T14:30:00Z",
  "topic": "neuroscience",
  "count_approved": 2,
  "count_rejected": 1,
  "user_feedback": "Q1 was perfect (pop culture hook). Q2 too wordy. Q3 too academic. Prefer questions about famous people or cultural moments over technical facts.",
  "notes": "User strongly prefers pop culture angles and clear wording. Avoid academic/linguistic questions."
}
```

This note teaches Claude to prioritize pop culture angles and avoid academic tangents on future neuroscience questions.

## Why This Matters

Over time, your feedback creates a **personal training guide** for Claude. Instead of Claude following generic rules, it learns your specific preferences:
- Your ideal difficulty level
- The topics you care about
- Wording styles you love
- Question archetypes that resonate with you

The skill becomes **personalized to you** — continuously improving with every generation.

---

**Pro tip:** Periodically review your feedback history to spot patterns. You might discover insights about what makes great trivia questions (at least for your taste), which can inform future requests.
