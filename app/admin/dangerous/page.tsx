import { ResetDayButton } from "./ResetDayButton";

export default function DangerousPage() {
  return (
    <>
      <div className="admin-h">
        <div>
          <h1>Dangerous</h1>
          <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            Destructive actions — each requires confirmation before executing
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-h" style={{ color: "var(--coral-dark)" }}>
          Reset day
        </div>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0, marginBottom: 16 }}>
          Deletes all play records (attempts + responses) for the chosen date, then
          re-rolls a fresh set of 5 questions. Use this when a UTC/local-time mismatch
          caused an attempt to be recorded against the wrong day, or when you need to
          swap out questions mid-day.
        </p>
        <ResetDayButton />
      </div>
    </>
  );
}
