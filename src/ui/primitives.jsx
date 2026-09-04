/* Small labelled controls. */

import { MONO, T } from "../theme.js";

function Control({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: T.muted }}>
        {label}
      </div>
      {children}
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.dim }}>{hint}</div>
    </div>
  );
}

function Metric({ label, value, sub, tone, big }) {
  return (
    <div
      style={{
        padding: "18px 20px 16px",
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", color: T.dim }}>
        {label}
      </div>
      <div
        style={{
          fontSize: big ? 42 : 30,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          marginTop: 8,
          lineHeight: 1,
          color: tone || T.text,
          ...(big
            ? {
                background: `linear-gradient(100deg, ${T.goldHi}, ${T.goldLo})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }
            : {}),
        }}
      >
        {value}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.muted, marginTop: 8 }}>{sub}</div>
    </div>
  );
}

export { Control, Metric };
