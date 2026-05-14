"use client";

import { useMemo } from "react";

const COLORS = [
  "var(--primary)",
  "var(--yellow)",
  "var(--pink)",
  "var(--mint)",
  "var(--blue)",
  "var(--orange)",
];

export function ConfettiBurst({ count = 30 }: { count?: number }) {
  /* eslint-disable react-hooks/purity */
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        dur: 1.6 + Math.random() * 1.4,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * 360,
      })),
    [count],
  );
  /* eslint-enable react-hooks/purity */
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        borderRadius: "inherit",
      }}
    >
      {pieces.map((p, i) => (
        <span
          // biome-ignore lint: deterministic per render is fine here
          key={i}
          className="confetti"
          style={{
            left: `${p.left}%`,
            top: -20,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            animation: `fall ${p.dur}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}
