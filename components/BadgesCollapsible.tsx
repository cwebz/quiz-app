"use client";

import { useState } from "react";
import { Ico } from "./Icons";

export type BadgeDef = {
  unlocked: boolean;
  tier: "gold" | "silver" | "bronze" | "master";
  iconKey: "Trophy" | "Check" | "Brain" | "Bolt" | "Fire" | "Calendar";
  name: string;
  desc: string;
};

const ICON_SIZE = { width: 28, height: 28 } as const;
const TROPHY_SIZE = { width: 30, height: 30 } as const;

const DEFAULT_SHOWN = 4;

function BadgeTile({ badge }: { badge: BadgeDef }) {
  const { unlocked, tier, iconKey, name, desc } = badge;
  const tierClass = unlocked ? tier : "locked";
  const iconStyle = iconKey === "Trophy" ? TROPHY_SIZE : ICON_SIZE;
  const icon = {
    Trophy: <Ico.Trophy style={iconStyle} />,
    Check: <Ico.Check style={iconStyle} />,
    Brain: <Ico.Brain style={iconStyle} />,
    Bolt: <Ico.Bolt style={iconStyle} />,
    Fire: <Ico.Fire style={iconStyle} />,
    Calendar: <Ico.Calendar style={iconStyle} />,
  }[iconKey];

  return (
    <div className={`badge ${tierClass}`}>
      <div className="badge-medal">{icon}</div>
      <div className="badge-name">{name}</div>
      <div className="badge-desc">{desc}</div>
    </div>
  );
}

export function BadgesCollapsible({ badges }: { badges: BadgeDef[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? badges : badges.slice(0, DEFAULT_SHOWN);
  const hiddenCount = badges.length - DEFAULT_SHOWN;

  return (
    <div>
      <div className="badges-grid">
        {visible.map((b) => (
          <BadgeTile key={b.name} badge={b} />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginTop: 14,
            background: "none",
            border: "none",
            color: "var(--primary)",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {expanded ? "Show less" : `Show all ${badges.length} badges`}
        </button>
      )}
    </div>
  );
}
