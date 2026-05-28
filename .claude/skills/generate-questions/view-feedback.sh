#!/bin/bash
# View and analyze feedback from question generation history

FEEDBACK_FILE="$HOME/.claude/skills/generate-questions-feedback.json"

if [ ! -f "$FEEDBACK_FILE" ]; then
    echo "📝 No feedback log found at $FEEDBACK_FILE"
    echo "Feedback will be created here after your first generation with feedback."
    exit 0
fi

echo "📊 Question Generation Feedback History"
echo "========================================"
echo ""

# Show last 10 entries
echo "📋 Recent Feedback (last 10 generations):"
echo ""
tail -10 "$FEEDBACK_FILE" | while IFS= read -r line; do
    if [[ $line == *"timestamp"* ]]; then
        timestamp=$(echo "$line" | sed 's/.*"timestamp": "\([^"]*\)".*/\1/')
        echo "📅 $timestamp"
    elif [[ $line == *"topic"* ]]; then
        topic=$(echo "$line" | sed 's/.*"topic": "\([^"]*\)".*/\1/')
        echo "   Topic: $topic"
    elif [[ $line == *"count_approved"* ]]; then
        approved=$(echo "$line" | sed 's/.*"count_approved": \([^,]*\).*/\1/')
        echo "   ✅ Approved: $approved"
    elif [[ $line == *"count_rejected"* ]]; then
        rejected=$(echo "$line" | sed 's/.*"count_rejected": \([^,]*\).*/\1/')
        echo "   ❌ Rejected: $rejected"
    elif [[ $line == *"user_feedback"* ]]; then
        feedback=$(echo "$line" | sed 's/.*"user_feedback": "\([^"]*\)".*/\1/')
        echo "   💬 Feedback: $feedback"
    elif [[ $line == *"notes"* ]]; then
        notes=$(echo "$line" | sed 's/.*"notes": "\([^"]*\)".*/\1/')
        echo "   📌 Notes: $notes"
        echo ""
    fi
done

echo ""
echo "💡 Tip: This feedback log helps the /generate-questions skill learn what you value."
echo "   The more detailed your feedback, the better future questions become!"
echo ""
echo "📂 Full feedback file: $FEEDBACK_FILE"
