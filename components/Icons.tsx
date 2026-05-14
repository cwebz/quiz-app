import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const stroke = (p: IconProps) => ({
  ...p,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

const filled = (p: IconProps) => ({
  ...p,
  viewBox: "0 0 24 24",
  fill: "currentColor",
});

export const Ico = {
  Check: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={3}>
      <polyline points="5 12 10 17 19 7" />
    </svg>
  ),
  X: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={3}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  ),
  Flag: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={2}>
      <path d="M4 21V5c4-2 8 2 12 0v10c-4 2-8-2-12 0" />
      <line x1="4" y1="22" x2="4" y2="3" />
    </svg>
  ),
  Share: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={2.4}>
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <line x1="8.6" y1="10.6" x2="15.4" y2="7.4" />
      <line x1="8.6" y1="13.4" x2="15.4" y2="16.6" />
    </svg>
  ),
  Trophy: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={2.2}>
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5a3 3 0 0 0 3 3" />
      <path d="M16 6h3a3 3 0 0 1-3 3" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <polyline points="9 22 15 22 14 18 10 18 9 22" />
    </svg>
  ),
  Fire: (p: IconProps) => (
    <svg {...filled(p)}>
      <path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.5-2-1-3 4 2 5 6 5 9a7 7 0 1 1-14 0c0-5 5-7 7-15z" />
    </svg>
  ),
  Bolt: (p: IconProps) => (
    <svg {...filled(p)}>
      <polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2" />
    </svg>
  ),
  Brain: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={2}>
      <path d="M8 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V5a3 3 0 0 0-4 0z" />
      <path d="M16 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0" />
    </svg>
  ),
  Calendar: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={2}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  ),
  ArrowRight: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={3}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  ),
  Search: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={2.2}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  ),
  Menu: (p: IconProps) => (
    <svg {...stroke(p)} strokeWidth={2.4}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  ),
};
