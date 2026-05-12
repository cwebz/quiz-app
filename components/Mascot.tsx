import Image from "next/image";

export function Mascot({
  size = 140,
  className = "",
  style = {},
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Image
      src="/quizby.png"
      alt="Quizby — Smarter mascot"
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: "auto",
        objectFit: "contain",
        userSelect: "none",
        pointerEvents: "none",
        filter: "drop-shadow(0 8px 0 rgba(26, 19, 57, 0.10))",
        ...style,
      }}
      draggable={false}
      priority
    />
  );
}
