/* One fixed backdrop layer behind the landing page; seven children
   crossfade on 1s opacity transitions as the active section changes. */

import { useMemo } from "react";
import { HeroGraph } from "./HeroGraph.jsx";
import { rndSeq } from "../lib/random.js";
import { MONO, T } from "../theme.js";

/* 1 — drifting ledger columns, mismatches flagged */
function BackDrift() {
  const rows = useMemo(() => {
    const r = rndSeq(120, 11);
    return Array.from({ length: 40 }, (_, i) => ({
      a: (r[i] * 9000 + 300).toFixed(2),
      b: (r[i + 40] * 9000 + 300).toFixed(2),
      bad: r[i + 80] < 0.22,
    }));
  }, []);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-30% 0",
          display: "flex",
          justifyContent: "center",
          gap: "18vw",
          animation: "drift 44s linear infinite",
        }}
      >
        {[0, 1].map((col) => (
          <div key={col} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.concat(rows).map((x, i) => (
              <span
                key={i}
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: x.bad ? "rgba(229,72,77,.5)" : "rgba(160,160,160,.16)",
                }}
              >
                {col ? "INV " : "BNK "}
                {col ? x.b : x.a}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* 2 — funnel: many in, few out */
function BackFunnel() {
  const cols = [46, 20, 8];
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {cols.map((n, band) =>
        Array.from({ length: n }, (_, i) => {
          const x = 80 + (i / (n - 1 || 1)) * 640;
          const y = 90 + band * 120;
          return (
            <g key={band + "-" + i}>
              <circle
                cx={x}
                cy={y}
                r={2}
                fill={[T.exact, T.fuzzy, T.llm][band]}
                opacity={0.5}
                style={{ animation: `pulse ${3 + (i % 5) * 0.4}s ease-in-out infinite` }}
              />
              {band < 2 && i < cols[band + 1] && (
                <line
                  x1={x}
                  y1={y + 4}
                  x2={80 + (i / (cols[band + 1] - 1 || 1)) * 640}
                  y2={y + 116}
                  stroke={[T.exact, T.fuzzy][band]}
                  strokeWidth={0.4}
                  opacity={0.22}
                />
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

/* 3 — confidence scatter with a sweeping threshold */
function BackScatter() {
  const pts = useMemo(() => rndSeq(220, 23), []);
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {Array.from({ length: 110 }, (_, i) => {
        const c = 0.35 + pts[i] * 0.6;
        return (
          <circle
            key={i}
            cx={70 + c * 660}
            cy={40 + pts[i + 110] * 340}
            r={2.4}
            fill={c < 0.55 ? "rgba(229,72,77,.45)" : T.gold}
            opacity={c < 0.55 ? 0.5 : 0.35}
          />
        );
      })}
      <line
        x1={0}
        y1={20}
        x2={0}
        y2={400}
        stroke={T.gold}
        strokeWidth={1.2}
        strokeDasharray="5 4"
        opacity={0.55}
        style={{ animation: "sweep 9s ease-in-out infinite" }}
      />
    </svg>
  );
}

/* 4 — cash curve crossing a floor */
function BackCurve() {
  const d = useMemo(() => {
    const r = rndSeq(60, 31);
    let bal = 250;
    const pts = [];
    for (let i = 0; i < 60; i++) {
      bal += r[i] * 40 - 16;
      if (i === 22 || i === 44) bal -= 130;
      pts.push([i * (800 / 59), 380 - Math.max(bal, 20) * 0.8]);
    }
    return pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  }, []);
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <line x1={0} y1={300} x2={800} y2={300} stroke={T.bad} strokeWidth={1} strokeDasharray="6 5" opacity={0.4} />
      <path
        d={d}
        fill="none"
        stroke={T.gold}
        strokeWidth={1.6}
        opacity={0.45}
        strokeDasharray="2400"
        style={{ animation: "draw 11s ease-out infinite" }}
      />
    </svg>
  );
}

/* 5 — edges resolving green */
function BackResolve() {
  const rows = 26;
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {Array.from({ length: rows }, (_, i) => {
        const y1 = 30 + i * 14;
        const y2 = 30 + ((i * 7) % rows) * 14;
        return (
          <path
            key={i}
            d={`M 170 ${y1} C 400 ${y1}, 400 ${y2}, 630 ${y2}`}
            fill="none"
            stroke="#6EE7A8"
            strokeWidth={0.6}
            opacity={0}
            strokeDasharray="600"
            style={{ animation: `resolve 7s ease-out ${(i % 9) * 0.35}s infinite` }}
          />
        );
      })}
      {Array.from({ length: rows }, (_, i) => (
        <g key={"n" + i}>
          <circle cx={170} cy={30 + i * 14} r={1.8} fill="rgba(160,160,160,.4)" />
          <circle cx={630} cy={30 + i * 14} r={1.8} fill="rgba(160,160,160,.4)" />
        </g>
      ))}
    </svg>
  );
}

function Backdrop({ active }) {
  const layers = [
    <HeroGraph key="h" />,
    <BackDrift key="d" />,
    <BackFunnel key="f" />,
    <BackScatter key="s" />,
    <BackCurve key="c" />,
    <BackResolve key="r" />,
    <BackFunnel key="f2" />,
  ];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      {layers.map((l, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            opacity: active === i ? 1 : 0,
            transition: "opacity 1s ease",
          }}
        >
          {l}
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(5,5,5,.9) 26%, rgba(5,5,5,.74) 58%, rgba(5,5,5,.5) 100%)",
        }}
      />
    </div>
  );
}

export { BackDrift, BackFunnel, BackScatter, BackCurve, BackResolve, Backdrop };
