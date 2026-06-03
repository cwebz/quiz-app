"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfettiBurst } from "@/components/ConfettiBurst";
import { FriendsLeaderboard } from "@/components/FriendsLeaderboard";
import { Ico } from "@/components/Icons";
import { ScoreRing } from "@/components/ScoreRing";
import type {
  AnswerResult,
  PublicQuestion,
  QuestionFeedback,
  QuizResults,
  StartResult,
} from "@/lib/quiz/play";
import { QUESTION_TIME_LIMIT_MS } from "@/lib/quiz/scoring";

type AnsweredState = {
  selectedAnswer: string | null;
  feedback: QuestionFeedback;
  next:
    | {
        // Redeemed via POST /api/quiz/continue on Next click. The server
        // stamps the next question's currentServedAt at redemption time,
        // so feedback-reading time doesn't eat into the next timer.
        advanceToken: string;
        nextIndex: number;
        totalQuestions: number;
      }
    | null;
  finalResults: QuizResults | null;
};

type Phase =
  | { kind: "loading" }
  | { kind: "no-quiz"; date: string }
  | { kind: "ready"; totalQuestions: number }
  | {
      kind: "playing";
      token: string;
      question: PublicQuestion;
      questionIndex: number;
      totalQuestions: number;
      deadline: number;
      selected: string | null;
    }
  | {
      kind: "revealed";
      question: PublicQuestion;
      questionIndex: number;
      totalQuestions: number;
      answered: AnsweredState;
    }
  | { kind: "results"; results: QuizResults }
  | { kind: "error"; message: string };

const GUEST_ID_KEY = "stti.guestId";
const SESSION_KEY = "stti.quiz-session";
const KEY_LETTERS = ["A", "B", "C", "D", "E"];

type CachedSession =
  | {
      date: string;
      kind: "playing";
      token: string;
      question: PublicQuestion;
      questionIndex: number;
      totalQuestions: number;
      deadline: number;
      identity: "user" | "guest";
    }
  | {
      date: string;
      kind: "awaiting";
      advanceToken: string;
      nextIndex: number;
      totalQuestions: number;
      identity: "user" | "guest";
    };

function getLocalDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadCachedSession(today: string): CachedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSession;
    if (parsed.date !== today) {
      // Stale (yesterday's session, or someone tampered). Drop it.
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

function saveCachedSession(s: CachedSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // private mode / quota — fail open, the API path still works
  }
}

function clearCachedSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export default function QuizPlayPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [guestId, setGuestId] = useState<string | null>(null);
  const identityRef = useRef<"user" | "guest">("guest");

  useEffect(() => {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    // Mirror the guestId into a cookie so the Auth.js jwt callback can adopt
    // any orphan quiz_attempts for this guest into the user's account on
    // sign-in. localStorage isn't visible to the server during OAuth.
    document.cookie = `stti.gid=${id}; Path=/; Max-Age=${60 * 60 * 24 * 90}; SameSite=Lax; Secure`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuestId(id);
  }, []);

  // Boot: hydrate from localStorage first (so refresh during a quiz feels
  // instant and the timer carries over), then reconcile with the server.
  useEffect(() => {
    if (!guestId) return;
    let aborted = false;
    const today = getLocalDateString();

    // 1. Hydrate immediately from cache if a session for today exists.
    //    "playing" cache: drop into the existing question with the saved
    //    deadline. "awaiting" cache (refresh during feedback): leave UI
    //    in loading state and redeem the advance token below.
    //
    //    Note: cached tokens carry the identity (guestId/userId) baked in
    //    at issue time. If the caller is now signed in but the cache was
    //    written as a guest, the /today response below will drop the cache
    //    so we re-issue against the current identity.
    let cached = loadCachedSession(today);
    let hasCachedHydration = cached?.kind === "playing";
    if (cached?.kind === "playing") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({
        kind: "playing",
        token: cached.token,
        question: cached.question,
        questionIndex: cached.questionIndex,
        totalQuestions: cached.totalQuestions,
        deadline: cached.deadline,
        selected: null,
      });
    }

    // 2. Reconcile with the server in the background.
    (async () => {
      try {
        const todayRes = await fetch(
          `/api/quiz/today?guestId=${encodeURIComponent(guestId)}&localDate=${encodeURIComponent(today)}`,
        );
        if (!todayRes.ok) throw new Error(`today API: ${todayRes.status}`);
        const todayData = (await todayRes.json()) as TodayResponse;
        if (aborted) return;

        identityRef.current = todayData.identity;

        if (todayData.status === "no-quiz-today") {
          clearCachedSession();
          setPhase({ kind: "no-quiz", date: todayData.date });
          return;
        }
        if (todayData.status === "already-played") {
          // Server says we completed (possibly on another device). Trust it.
          clearCachedSession();
          setPhase({ kind: "results", results: todayData.results });
          return;
        }

        // The cached session token was issued for whichever identity the
        // player had when it was written. If they've since signed in but
        // the cache was written as a guest, the token is bound to the old
        // guestId and any finished attempts get adopted at sign-in
        // (auth.ts) — drop the cache and start fresh. Cache written while
        // already signed in stays valid.
        if (
          todayData.identity === "user" &&
          cached !== null &&
          (cached.identity ?? "guest") === "guest"
        ) {
          clearCachedSession();
          cached = null;
          hasCachedHydration = false;
        }

        // Server says "ready". Decide how to enter:
        // - "playing" cache: already hydrated, do nothing
        // - "awaiting" cache: redeem the advance ticket → fresh timer
        // - no cache: start a fresh session
        if (hasCachedHydration) return;
        if (cached?.kind === "awaiting") {
          const continueRes = await fetch("/api/quiz/continue", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ advanceToken: cached.advanceToken }),
          });
          const continueData = (await continueRes.json()) as
            | {
                token: string;
                question: PublicQuestion;
                questionIndex: number;
                totalQuestions: number;
              }
            | { error: string };
          if (aborted) return;
          if ("error" in continueData) {
            // Token expired / invalid — fall through to fresh start.
            clearCachedSession();
          } else {
            setPhase({
              kind: "playing",
              token: continueData.token,
              question: continueData.question,
              questionIndex: continueData.questionIndex,
              totalQuestions: continueData.totalQuestions,
              deadline: Date.now() + QUESTION_TIME_LIMIT_MS,
              selected: null,
            });
            return;
          }
        }

        // No cached session and server says "ready" — show the ready
        // screen so the quiz only starts on explicit user intent.
        setPhase({ kind: "ready", totalQuestions: todayData.totalQuestions });
      } catch (err) {
        if (!aborted) {
          setPhase({ kind: "error", message: String(err) });
        }
      }
    })();

    return () => {
      aborted = true;
    };
  }, [guestId]);

  // Sync the cache to whatever's currently on screen. Anchored on `phase`
  // so every transition writes the right state.
  useEffect(() => {
    const today = getLocalDateString();
    if (phase.kind === "playing") {
      saveCachedSession({
        date: today,
        kind: "playing",
        token: phase.token,
        question: phase.question,
        questionIndex: phase.questionIndex,
        totalQuestions: phase.totalQuestions,
        deadline: phase.deadline,
        identity: identityRef.current,
      });
    } else if (phase.kind === "revealed" && phase.answered.next) {
      // Mid-quiz feedback. Stash the advance token so a refresh during
      // feedback redeems it on resume (server stamps the timer THEN, not
      // when feedback was shown).
      const next = phase.answered.next;
      saveCachedSession({
        date: today,
        kind: "awaiting",
        advanceToken: next.advanceToken,
        nextIndex: next.nextIndex,
        totalQuestions: next.totalQuestions,
        identity: identityRef.current,
      });
    } else if (
      phase.kind === "results" ||
      phase.kind === "no-quiz" ||
      phase.kind === "error" ||
      (phase.kind === "revealed" && !phase.answered.next)
    ) {
      clearCachedSession();
    }
  }, [phase]);

  const submitAnswer = useCallback(async (token: string, answer: string) => {
    try {
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, answer }),
      });
      const data = (await res.json()) as AnswerResult | { error: string };
      if ("error" in data) {
        setPhase({ kind: "error", message: data.error });
        return;
      }

      setPhase((prev) => {
        if (prev.kind !== "playing") return prev;
        if (data.kind === "complete") {
          return {
            kind: "revealed",
            question: prev.question,
            questionIndex: prev.questionIndex,
            totalQuestions: prev.totalQuestions,
            answered: {
              selectedAnswer: prev.selected,
              feedback: data.feedback,
              next: null,
              finalResults: data.results,
            },
          };
        }
        return {
          kind: "revealed",
          question: prev.question,
          questionIndex: prev.questionIndex,
          totalQuestions: prev.totalQuestions,
          answered: {
            selectedAnswer: prev.selected,
            feedback: data.feedback,
            next: {
              advanceToken: data.advanceToken,
              nextIndex: data.nextIndex,
              totalQuestions: data.totalQuestions,
            },
            finalResults: null,
          },
        };
      });
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    }
  }, []);

  // Keep the live token in a ref so pickAnswer can fire submitAnswer
  // outside of a state-updater (state-updater functions must stay pure
  // since React strict mode runs them twice in dev).
  const liveTokenRef = useRef<string | null>(null);
  useEffect(() => {
    liveTokenRef.current = phase.kind === "playing" ? phase.token : null;
  }, [phase]);

  const pickAnswer = useCallback(
    (answer: string) => {
      setPhase((prev) => {
        if (prev.kind !== "playing" || prev.selected !== null) return prev;
        return { ...prev, selected: answer };
      });
      const token = liveTokenRef.current;
      if (token) submitAnswer(token, answer);
    },
    [submitAnswer],
  );

  const [advancing, setAdvancing] = useState(false);
  const advance = useCallback(async () => {
    // Final question: no continue call needed.
    if (
      phase.kind === "revealed" &&
      !phase.answered.next &&
      phase.answered.finalResults
    ) {
      setPhase({ kind: "results", results: phase.answered.finalResults });
      return;
    }
    if (phase.kind !== "revealed" || !phase.answered.next) return;
    if (advancing) return;

    const advanceToken = phase.answered.next.advanceToken;
    setAdvancing(true);
    try {
      const res = await fetch("/api/quiz/continue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ advanceToken }),
      });
      const data = (await res.json()) as
        | {
            token: string;
            question: PublicQuestion;
            questionIndex: number;
            totalQuestions: number;
          }
        | { error: string };
      if ("error" in data) {
        setPhase({ kind: "error", message: data.error });
        return;
      }
      setPhase({
        kind: "playing",
        token: data.token,
        question: data.question,
        questionIndex: data.questionIndex,
        totalQuestions: data.totalQuestions,
        deadline: Date.now() + QUESTION_TIME_LIMIT_MS,
        selected: null,
      });
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    } finally {
      setAdvancing(false);
    }
  }, [phase, advancing]);

  const startQuiz = useCallback(async () => {
    if (!guestId) return;
    const today = getLocalDateString();
    try {
      const startRes = await fetch("/api/quiz/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestId, localDate: today }),
      });
      const startData = (await startRes.json()) as
        | (StartResult & { status: "started" })
        | { status: "already-played"; results: QuizResults }
        | { error: string };
      if ("error" in startData) {
        setPhase({ kind: "error", message: startData.error });
        return;
      }
      if (startData.status === "already-played") {
        clearCachedSession();
        setPhase({ kind: "results", results: startData.results });
        return;
      }
      setPhase({
        kind: "playing",
        token: startData.token,
        question: startData.question,
        questionIndex: startData.questionIndex,
        totalQuestions: startData.totalQuestions,
        deadline: Date.now() + QUESTION_TIME_LIMIT_MS,
        selected: null,
      });
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    }
  }, [guestId]);

  if (phase.kind === "loading") {
    return <LoadingScreen />;
  }
  if (phase.kind === "error") {
    return <ErrorScreen message={phase.message} />;
  }
  if (phase.kind === "no-quiz") {
    return <NoQuizScreen date={phase.date} />;
  }
  if (phase.kind === "ready") {
    return (
      <ReadyScreen
        totalQuestions={phase.totalQuestions}
        onStart={startQuiz}
      />
    );
  }
  if (phase.kind === "results") {
    return <ResultsScreen results={phase.results} />;
  }
  if (phase.kind === "playing") {
    return (
      <QuizScreen
        question={phase.question}
        questionIndex={phase.questionIndex}
        totalQuestions={phase.totalQuestions}
        deadline={phase.deadline}
        selected={phase.selected}
        revealed={null}
        token={phase.token}
        advancing={false}
        onPick={pickAnswer}
        onAdvance={advance}
      />
    );
  }
  // revealed
  return (
    <QuizScreen
      question={phase.question}
      questionIndex={phase.questionIndex}
      totalQuestions={phase.totalQuestions}
      deadline={null}
      selected={phase.answered.selectedAnswer}
      revealed={phase.answered}
      token={null}
      advancing={advancing}
      onPick={() => undefined}
      onAdvance={advance}
    />
  );
}

type TodayResponse =
  | { status: "no-quiz-today"; date: string; identity: "user" | "guest" }
  | {
      status: "already-played";
      date: string;
      dailyQuizId: number;
      results: QuizResults;
      identity: "user" | "guest";
    }
  | {
      status: "ready";
      date: string;
      dailyQuizId: number;
      totalQuestions: number;
      identity: "user" | "guest";
    };

function LoadingScreen() {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        color: "var(--ink-soft)",
        marginTop: 80,
      }}
    >
      Loading today&apos;s quiz…
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 40 }}>
      <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>{message}</p>
      <button
        type="button"
        className="btn btn--ghost"
        style={{ marginTop: 16 }}
        onClick={() => location.reload()}
      >
        Reload
      </button>
    </div>
  );
}

function NoQuizScreen({ date }: { date: string }) {
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 40 }}>
      <h2>No quiz available for {date}</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 8 }}>
        Tomorrow&apos;s quiz hasn&apos;t been queued yet. Try again later.
      </p>
    </div>
  );
}

function ReadyScreen({ totalQuestions, onStart }: { totalQuestions: number; onStart: () => void }) {
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 40, textAlign: "center", padding: 40 }}>
      <h2 style={{ marginBottom: 8 }}>Ready for today&apos;s quiz?</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 24 }}>
        {totalQuestions} questions · 20 seconds each · scored by accuracy &amp; speed
      </p>
      <button type="button" className="btn btn--primary" style={{ width: "100%" }} onClick={onStart}>
        Start Quiz
      </button>
    </div>
  );
}

function QuizScreen({
  question,
  questionIndex,
  totalQuestions,
  deadline,
  selected,
  revealed,
  token,
  advancing,
  onPick,
  onAdvance,
}: {
  question: PublicQuestion;
  questionIndex: number;
  totalQuestions: number;
  deadline: number | null;
  selected: string | null;
  revealed: AnsweredState | null;
  token: string | null;
  advancing: boolean;
  onPick: (answer: string) => void;
  onAdvance: () => void;
}) {
  const [trackedDeadline, setTrackedDeadline] = useState(deadline);
  const [remaining, setRemaining] = useState(() =>
    deadline ? Math.max(0, deadline - Date.now()) : 0,
  );

  useEffect(() => {
    document.documentElement.dataset.quizMode = "1";
    // Mobile: home-page scroll position can carry over on nav, cutting off the
    // first question. Slide to top when the quiz actually starts.
    window.scrollTo({ top: 0, behavior: "smooth" });
    return () => {
      delete document.documentElement.dataset.quizMode;
    };
  }, []);

  // Snap remaining to the new deadline synchronously so the first paint of a
  // new question shows a full arc — otherwise the stale 0 from the prior
  // question causes the CSS transition to slowly refill the circle.
  if (deadline !== trackedDeadline) {
    setTrackedDeadline(deadline);
    // eslint-disable-next-line react-hooks/purity
    setRemaining(deadline ? Math.max(0, deadline - Date.now()) : 0);
  }

  // Tick the countdown and auto-submit on timeout. Both live in the same
  // effect so the auto-submit checks `deadline - Date.now()` directly rather
  // than the `remaining` state, avoiding a race where stale remaining=0
  // from the revealed phase fires prematurely on a new question.
  const timedOutRef = useRef(false);
  useEffect(() => {
    timedOutRef.current = false; // reset for each new deadline (= new question)
    if (!deadline) return;
    const id = setInterval(() => {
      const left = deadline - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0 && !timedOutRef.current) {
        timedOutRef.current = true;
        onPick("");
      }
    }, 100);
    return () => clearInterval(id);
  }, [deadline, onPick]);

  const secondsLeft = Math.ceil(remaining / 1000);
  const timerWarn = deadline !== null && secondsLeft <= 5;
  const C = 2 * Math.PI * 22;
  const arcOff = deadline
    ? C * (1 - Math.max(0, remaining) / QUESTION_TIME_LIMIT_MS)
    : C * (1 - secondsLeft / 20);

  const progressPct =
    ((questionIndex + (revealed ? 1 : 0)) / totalQuestions) * 100;
  const isLast = revealed && revealed.next === null;

  return (
    <div className="quiz-shell">
      <div className="quiz-header">
        <Link
          href="/"
          className="icon-btn"
          aria-label="Exit"
          title="Exit"
        >
          <Ico.X style={{ width: 18, height: 18 }} />
        </Link>
        <div className="quiz-counter">
          {questionIndex + 1}/{totalQuestions}
        </div>
        <div className="quiz-progress">
          <div
            className="quiz-progress-bar"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className={`timer ${timerWarn ? "warn" : ""}`}>
          <svg width="56" height="56">
            <circle className="timer-track" cx="28" cy="28" r="22" />
            <circle
              key={deadline ?? "idle"}
              className="timer-arc"
              cx="28"
              cy="28"
              r="22"
              strokeDasharray={C}
              strokeDashoffset={arcOff}
            />
          </svg>
          {deadline ? secondsLeft : ""}
        </div>
      </div>

      <div className="question-card">
        <div className="question-meta">
          <span className="chip chip--blue">
            {capitalize(question.category)}
          </span>
          <span className="chip chip--ghost">
            Difficulty: {question.difficulty}
          </span>
        </div>
        <div className="question-text">{question.text}</div>
        <div className="answers">
          {question.options.map((opt, i) => {
            const cls = ["answer"];
            const isSelected = selected === opt;
            const correctAnswer = revealed?.feedback.correctAnswer;
            if (isSelected && !revealed) cls.push("selected");
            if (revealed && opt === correctAnswer) cls.push("correct");
            if (revealed && isSelected && opt !== correctAnswer)
              cls.push("wrong");
            return (
              <button
                key={opt}
                type="button"
                className={cls.join(" ")}
                onClick={() => onPick(opt)}
                disabled={revealed !== null || selected !== null}
              >
                <span className="answer-key">{KEY_LETTERS[i] ?? "?"}</span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {revealed ? (
        <div
          className={`feedback ${revealed.feedback.wasCorrect ? "correct" : "wrong"}`}
          role="status"
          aria-live="polite"
        >
          <div className="feedback-icon">
            {revealed.feedback.wasCorrect ? (
              <Ico.Check style={{ width: 28, height: 28 }} />
            ) : (
              <Ico.X style={{ width: 28, height: 28 }} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div className="feedback-title">
              {revealed.selectedAnswer === ""
                ? "Time's up!"
                : revealed.feedback.wasCorrect
                  ? "Nailed it."
                  : "Not quite."}
            </div>
            <div className="feedback-sub">
              {revealed.feedback.correctRate !== null
                ? `${revealed.feedback.correctRate}% of players have gotten this right · `
                : "First answer ever · you set the rate · "}
              {(revealed.feedback.timeTakenMs / 1000).toFixed(1)}s · +
              {revealed.feedback.pointsEarned} points
            </div>
          </div>
          <button
            type="button"
            className={`btn ${revealed.feedback.wasCorrect ? "btn--mint" : "btn--coral"}`}
            onClick={onAdvance}
            disabled={advancing}
          >
            {advancing
              ? "Loading…"
              : isLast
                ? "See results"
                : "Next"}
            {!advancing && (
              <Ico.ArrowRight style={{ width: 18, height: 18 }} />
            )}
          </button>
        </div>
      ) : (
        token && (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <ReportQuestionButton key={question.id} token={token} />
          </div>
        )
      )}
    </div>
  );
}

function ReportQuestionButton({ token }: { token: string }) {
  // State resets automatically when the parent passes a new `key` on question advance.
  const [reported, setReported] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading || reported) return;
    setLoading(true);
    try {
      const res = await fetch("/api/quiz/flag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        throw new Error(`flag API: ${res.status}`);
      }
      setReported(true);
    } catch {
      // Soft failure — let the user retry without making a scene.
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="flag-link"
      onClick={handleClick}
      disabled={loading || reported}
      style={reported ? { color: "var(--mint-dark)", cursor: "default" } : undefined}
      aria-live="polite"
    >
      <Ico.Flag style={{ width: 12, height: 12 }} />
      {reported ? "Thanks, we'll review" : loading ? "Reporting…" : "Report question"}
    </button>
  );
}

function ReportRecapButton({
  attemptId,
  questionId,
}: {
  attemptId: number;
  questionId: number;
}) {
  const [reported, setReported] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading || reported) return;
    setLoading(true);
    try {
      const guestId =
        typeof window !== "undefined"
          ? localStorage.getItem(GUEST_ID_KEY)
          : null;
      const res = await fetch("/api/quiz/flag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId, questionId, guestId }),
      });
      if (!res.ok) throw new Error(`flag API: ${res.status}`);
      setReported(true);
    } catch {
      // Soft failure — let the user retry without making a scene.
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="flag-link"
      onClick={handleClick}
      disabled={loading || reported}
      style={{
        marginLeft: 0,
        marginTop: 4,
        ...(reported ? { color: "var(--mint-dark)", cursor: "default" } : {}),
      }}
      aria-live="polite"
    >
      <Ico.Flag style={{ width: 12, height: 12 }} />
      {reported ? "Thanks, we'll review" : loading ? "Reporting…" : "Report"}
    </button>
  );
}


function ResultsScreen({ results }: { results: QuizResults }) {
  // Use the player's LOCAL date, not the Worker's UTC date. For UTC- users
  // playing between UTC midnight and local midnight (e.g. 9pm EST), forcing
  // timeZone:"UTC" rolled the displayed/shared date to "tomorrow". Matches the
  // home page convention (see fix 668d562).
  const today = new Date();
  const dateShort = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const totalSec = results.totalTimeMs / 1000;
  const total = results.perQuestion.length;
  const correct = results.correctCount;
  const percentile = results.percentile;
  const playersToday = results.totalPlayersToday;
  const distribution = results.scoreDistribution;

  return (
    <div className="results">
      <div className="results-hero">
        <ConfettiBurst count={26} />
        <div>
          <div className="percentile-eyebrow">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--mint)",
                display: "inline-block",
              }}
            />
            Final standing · {dateShort}
          </div>
          {playersToday <= 1 ? (
            <>
              <div className="percentile-num">
                <em>First!</em>
              </div>
              <div className="percentile-suffix">
                You&apos;re the first player today. Come back later to see how
                everyone else stacks up.
              </div>
            </>
          ) : percentile === 0 ? (
            <>
              <div className="percentile-num">
                <em>0%</em>
              </div>
              <div className="percentile-suffix">
                Nobody scored lower than you among today&apos;s{" "}
                {playersToday.toLocaleString()} players. There&apos;s a streak
                waiting to happen.
              </div>
            </>
          ) : percentile < 50 ? (
            <>
              <div className="percentile-num">
                Beat <em>{percentile}%</em>
              </div>
              <div className="percentile-suffix">
                You scored higher than {percentile}% of today&apos;s{" "}
                {playersToday.toLocaleString()} players. Keep going.
              </div>
            </>
          ) : (
            <>
              <div className="percentile-num">
                Top <em>{Math.max(1, 100 - percentile)}%</em>
              </div>
              <div className="percentile-suffix">
                You beat <strong>{percentile}%</strong> of today&apos;s{" "}
                {playersToday.toLocaleString()} players.
              </div>
            </>
          )}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 16,
              flexWrap: "wrap",
            }}
          >
            <span
              className="chip chip--yellow"
              style={{ fontSize: 13, padding: "6px 12px" }}
            >
              <Ico.Bolt style={{ width: 14, height: 14 }} />{" "}
              {totalSec.toFixed(1)}s total
            </span>
            <span
              className="chip chip--mint"
              style={{ fontSize: 13, padding: "6px 12px" }}
            >
              <Ico.Check style={{ width: 14, height: 14 }} /> {correct}/{total}{" "}
              correct
            </span>
            <span
              className="chip chip--ghost"
              style={{ fontSize: 13, padding: "6px 12px" }}
            >
              {results.finalScore} pts
            </span>
          </div>
        </div>
        <ScoreRing score={correct} total={total} size={200} />
      </div>

      <div className="results-top">
        {results.userStreak ? (
          <StreakCard streak={results.userStreak.current} />
        ) : (
          <SigninCard />
        )}
        <ShareCard
          dateShort={dateShort}
          correct={correct}
          total={total}
          finalScore={results.finalScore}
          totalSec={totalSec}
          perQuestion={results.perQuestion}
        />
      </div>

      <BadgesStrip
        correct={correct}
        total={total}
        finalScore={results.finalScore}
        totalSec={totalSec}
        percentile={percentile}
        perfectScores={results.userStreak?.perfectScores}
        comebackJustEarned={results.comebackJustEarned}
        freezeApplied={results.freezeApplied}
      />

      {results.friendsToday !== null && results.friendsToday.length > 0 && (
        <div className="card">
          <div className="row between">
            <h3>Friends</h3>
            <Link
              href="/leaderboard"
              style={{ fontSize: 13, color: "var(--primary)" }}
            >
              Full leaderboard →
            </Link>
          </div>
          <FriendsLeaderboard
            entries={results.friendsToday.map((f) => ({
              displayName: f.displayName,
              finalScore: f.finalScore,
              totalTimeMs: null,
              isCurrentUser: f.userId === results.userId,
            }))}
          />
        </div>
      )}

      <div className="card">
        <div className="row between">
          <h3>How everyone did today</h3>
          <span className="chip chip--ghost">Live</span>
        </div>
        <div className="histogram">
          {(() => {
            const maxBucket = Math.max(...distribution, 1);
            const maxBarPx = 80;
            return distribution.map((p, i) => {
              const barPx = Math.max(8, Math.round((p / maxBucket) * maxBarPx));
              return (
                <div
                  // biome-ignore lint: deterministic
                  key={i}
                  className={`histogram-col ${i === correct ? "you" : ""}`}
                >
                  <div
                    className="histogram-bar"
                    style={{ height: `${barPx}px` }}
                  />
                  <div className="histogram-label">{i}</div>
                </div>
              );
            });
          })()}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--ink-soft)",
            fontSize: 13,
            fontWeight: 700,
            marginTop: 4,
          }}
        >
          <span>0/5</span>
          <span>You&apos;re here →</span>
          <span>5/5</span>
        </div>

        <div className="divider" style={{ marginTop: 20, marginBottom: 16 }} />
        <h3 style={{ marginTop: 6 }}>Question by question</h3>
        <div className="recap-list">
          {results.perQuestion.map((q, i) => (
            <div className="recap-row" key={q.questionId}>
              <div className="recap-num">{i + 1}</div>
              <div>
                <div className="recap-q">{q.text}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-soft)",
                    marginTop: 2,
                  }}
                >
                  {q.wasCorrect ? "✓ " : "✗ "}
                  Your answer:{" "}
                  <strong>{q.userAnswer || "(no answer)"}</strong>
                  {!q.wasCorrect && (
                    <>
                      {" "}
                      · Correct: <strong>{q.correctAnswer}</strong>
                    </>
                  )}{" "}
                  · {(q.timeTakenMs / 1000).toFixed(1)}s · {q.pointsEarned} pts
                </div>
                <ReportRecapButton
                  attemptId={results.attemptId}
                  questionId={q.questionId}
                />
              </div>
              <div className={`recap-mark ${q.wasCorrect ? "ok" : "no"}`}>
                {q.wasCorrect ? (
                  <Ico.Check style={{ width: 16, height: 16 }} />
                ) : (
                  <Ico.X style={{ width: 16, height: 16 }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StreakCard({ streak }: { streak: number }) {
  const labelForStreak = (n: number): string => {
    if (n === 0) {
      return "Streak starts today. Come back tomorrow to keep it going.";
    }
    if (n < 7) {
      return `Keep going, ${7 - n} day${7 - n === 1 ? "" : "s"} to Week One badge.`;
    }
    if (n < 30) {
      return `${30 - n} day${30 - n === 1 ? "" : "s"} until Month Strong.`;
    }
    if (n < 100) {
      return `${100 - n} day${100 - n === 1 ? "" : "s"} until Centurion.`;
    }
    return "You're a Centurion. Just keep them coming.";
  };
  // Visual progress: how many of the last 7 days have been played, capped at 7.
  const filled = Math.min(7, streak);
  return (
    <div className="streak-card">
      <div className="streak-icon">🔥</div>
      <div>
        <div className="streak-num">
          {streak}-day streak
        </div>
        <div className="streak-label">{labelForStreak(streak)}</div>
        <div
          style={{ display: "flex", gap: 4, marginTop: 12 }}
          aria-hidden="true"
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              // biome-ignore lint: deterministic
              key={i}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 99,
                background:
                  i < filled ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.18)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SigninCard() {
  return (
    <div className="signin-card">
      <div className="signin-icon">🔥</div>
      <div className="signin-body">
        <h3>Save your streak forever</h3>
        <p>
          You&apos;ve started a streak today. Sign in to keep it, track lifetime
          stats, and earn badges.
        </p>
      </div>
      <button
        type="button"
        className="btn-google"
        onClick={() => {
          signIn("google", { redirectTo: "/quiz/play" });
        }}
      >
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 7.1 29.3 5 24 5 16.3 5 9.6 9 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29 35.5 26.6 36 24 36c-5.2 0-9.6-3-11.3-7.7l-6.5 5C9.5 39.6 16.2 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C42.7 35.6 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5z"
          />
        </svg>
        Continue with Google
      </button>
    </div>
  );
}

function ShareCard({
  dateShort,
  correct,
  total,
  finalScore,
  totalSec,
  perQuestion,
}: {
  dateShort: string;
  correct: number;
  total: number;
  finalScore: number;
  totalSec: number;
  perQuestion: QuizResults["perQuestion"];
}) {
  const emojiRow = perQuestion.map((q) => (q.wasCorrect ? "✅" : "🟥")).join("");
  const shareText = [
    "Smarter Than The Internet",
    `${dateShort} · ${emojiRow}`,
    `${correct}/${total} · ${totalSec.toFixed(0)}s · ${finalScore} pts`,
    "smarterthantheinternet.com",
  ].join("\n");

  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard
      .writeText(shareText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => undefined);
  };

  return (
    <div className="card share-card">
      <div className="row between">
        <h3>Share your score</h3>
        <span className="chip chip--pink">Brag a little</span>
      </div>
      <pre className="share-pre">{shareText}</pre>
      <div className="share-row">
        <button
          type="button"
          className="btn btn--pink"
          style={{ flex: 1 }}
          onClick={handleCopy}
        >
          <Ico.Share style={{ width: 16, height: 16 }} />
          {copied ? "Copied!" : "Copy share text"}
        </button>
      </div>
    </div>
  );
}

function BadgesStrip({
  correct,
  total,
  finalScore,
  totalSec,
  percentile,
  perfectScores,
  comebackJustEarned,
  freezeApplied,
}: {
  correct: number;
  total: number;
  finalScore: number;
  totalSec: number;
  percentile: number;
  perfectScores?: number;
  comebackJustEarned?: boolean;
  freezeApplied?: boolean;
}) {
  const perfect = correct === total;
  const speedDemon = perfect && finalScore >= 900;
  const lightning = perfect && finalScore >= 950;
  const top10 = percentile >= 90;
  const top1 = percentile >= 99;
  const perfectionist = (perfectScores ?? 0) >= 10;
  const signedIn = perfectScores !== undefined;

  return (
    <div className="card badges-strip-card">
      <div className="row between">
        <h3>Badges earned today</h3>
      </div>
      {freezeApplied && (
        <div
          className="chip chip--yellow"
          style={{ marginBottom: 12, fontSize: 13 }}
        >
          <Ico.Fire style={{ width: 13, height: 13 }} />{" "}
          {comebackJustEarned
            ? "Freeze used: streak saved! Comeback badge earned."
            : "Freeze used: streak preserved."}
        </div>
      )}
      <div className="badges-strip">
        <div className={`badge ${perfect ? "gold" : "locked"}`}>
          <div className="badge-medal">
            <Ico.Check style={{ width: 28, height: 28 }} />
          </div>
          <div className="badge-name">Perfect</div>
          <div className="badge-desc">{perfect ? "5/5 correct" : "Score 5/5"}</div>
        </div>
        <div className={`badge ${speedDemon ? "gold" : "locked"}`}>
          <div className="badge-medal">
            <Ico.Bolt style={{ width: 30, height: 30 }} />
          </div>
          <div className="badge-name">Speed Demon</div>
          <div className="badge-desc">
            {speedDemon
              ? `${total}/${total} · ${totalSec.toFixed(0)}s`
              : "5/5 + 900 pts"}
          </div>
        </div>
        <div className={`badge ${lightning ? "master" : "locked"}`}>
          <div className="badge-medal">
            <Ico.Bolt style={{ width: 30, height: 30 }} />
          </div>
          <div className="badge-name">Lightning</div>
          <div className="badge-desc">
            {lightning ? `${finalScore} pts` : "5/5 + 950 pts"}
          </div>
        </div>
        <div className={`badge ${top1 ? "master" : top10 ? "gold" : "locked"}`}>
          <div className="badge-medal">
            <Ico.Trophy style={{ width: 28, height: 28 }} />
          </div>
          <div className="badge-name">{top1 ? "Top 1%" : "Top 10%"}</div>
          <div className="badge-desc">
            {top10 ? "Today's standing" : "Finish in top 10%"}
          </div>
        </div>
        <div
          className={`badge ${comebackJustEarned ? "gold" : signedIn ? "locked" : "locked"}`}
        >
          <div className="badge-medal">
            <Ico.Fire style={{ width: 26, height: 26 }} />
          </div>
          <div className="badge-name">Comeback</div>
          <div className="badge-desc">
            {comebackJustEarned
              ? "Freeze saved your streak!"
              : signedIn
                ? "Freeze saves a streak"
                : "Sign in to track"}
          </div>
        </div>
        <div
          className={`badge ${perfectionist ? "gold" : signedIn ? "locked" : "locked"}`}
        >
          <div className="badge-medal">
            <Ico.Brain style={{ width: 28, height: 28 }} />
          </div>
          <div className="badge-name">Perfectionist</div>
          <div className="badge-desc">
            {signedIn
              ? perfectionist
                ? "10 perfect scores"
                : `${perfectScores}/10 perfect scores`
              : "Sign in to track"}
          </div>
        </div>
      </div>
    </div>
  );
}


function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
