/* Small labelled controls and the metric tile.

   Metric animates its number toward the new value rather than snapping. On a
   re-run that movement is the signal: you see the match rate climb, which is
   the whole point of the learned-rules pass. */

import { useCountUp, useLocalGlow } from "../lib/motion.js";
import { MONO, T } from "../theme.js";

/* A panel that lights up under the pointer. The glow is positioned from
   --gx/--gy, written on this element only while the pointer is inside it. */
function GlowCard({ style, className = "", children }) {
  const ref = useLocalGlow();
  return (
    <div ref={ref} className={`fx-panel ${className}`} style={style}>
      {children}
    </div>
  );
}

function Control({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.12em",
          color: T.muted,
        }}
      >
        {label}
      </div>
      {children}
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.dim }}>{hint}</div>
    </div>
  );
}

/* Tiny inline sparkline of previous runs. */
function Spark({ series, color }) {
  if (!series || series.length < 2) return null;
  const w = 74;
  const h = 20;
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  const d = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - lo) / span) * (h - 4) - 2;
      return `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.3} opacity={0.75} />
      <circle
        cx={w}
        cy={h - ((series[series.length - 1] - lo) / span) * (h - 4) - 2}
        r={2.2}
        fill={color}
      />
    </svg>
  );
}

function Metric({ label, value, num, decimals = 0, suffix = "", sub, tone, big, series }) {
  const animated = useCountUp(typeof num === "number" ? num : 0);
  const shown =
    typeof num === "number" ? animated.toFixed(decimals) + suffix : value;

  return (
    <GlowCard
      className="fx-lift"
      style={{
        padding: big ? "20px 22px 18px" : "18px 20px 16px",
        background: "rgba(14,14,14,.82)",
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: "0.18em",
            color: T.dim,
          }}
        >
          {label}
        </div>
        <Spark series={series} color={tone || T.gold} />
      </div>
      <div
        style={{
          fontSize: big ? 46 : 31,
          fontWeight: 800,
          letterSpacing: "-0.045em",
          marginTop: 10,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          color: tone || T.text,
          ...(big
            ? {
                background: `linear-gradient(100deg, ${T.goldHi}, ${T.goldLo})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 22px rgba(212,175,55,.28))",
              }
            : {}),
        }}
      >
        {shown}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.muted, marginTop: 8 }}>{sub}</div>
    </GlowCard>
  );
}

export { Control, Metric, GlowCard, Spark };
