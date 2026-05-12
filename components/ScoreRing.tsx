export function ScoreRing({
  score,
  total,
  size = 200,
}: {
  score: number;
  total: number;
  size?: number;
}) {
  const r = (size - 30) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - score / total);

  // The base CSS sizes (.score-ring-num 56px, etc.) target size=200. Anything
  // smaller needs to scale the inner text to fit, with the "CORRECT" label
  // dropped under a threshold where it'd just clutter the small ring.
  const compact = size < 140;
  const numFontPx = compact ? Math.round(size * 0.32) : 56;
  const spanFontPx = compact ? Math.round(size * 0.2) : 28;
  const labelFontPx = compact ? Math.round(size * 0.1) : 12;
  const showLabel = size >= 100;

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--pink)" />
          </linearGradient>
        </defs>
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={compact ? 8 : 14}
        />
        <circle
          className="score-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeDasharray={C}
          strokeDashoffset={off}
          strokeWidth={compact ? 8 : 14}
          style={{
            transition: "stroke-dashoffset 1.2s cubic-bezier(.4,1.4,.5,1)",
          }}
        />
      </svg>
      <div className="score-ring-center">
        <div
          className="score-ring-num"
          style={{ fontSize: numFontPx, lineHeight: 1 }}
        >
          {score}
          <span style={{ fontSize: spanFontPx }}>/{total}</span>
        </div>
        {showLabel && (
          <div
            className="score-ring-label"
            style={{ fontSize: labelFontPx }}
          >
            CORRECT
          </div>
        )}
      </div>
    </div>
  );
}
