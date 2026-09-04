/* Backdrop layers for the landing page.

   These used to be near-invisible: stroke opacities around .16 under a flat
   rgba(5,5,5,.9) vignette. They are now drawn at full strength and lit by the
   pointer-tracking scrim in effects.jsx, so the finance visuals actually read.

   Each layer is real finance imagery rather than abstract decoration - a tape,
   a fan of settlements, a confidence split, a cash curve, a resolving book, a
   candlestick market - and each sits on a different parallax depth. */

import { useMemo } from "react";
import { HeroGraph } from "./HeroGraph.jsx";
import { rndSeq } from "../lib/random.js";
import { MONO, T } from "../theme.js";

const SVG = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};
const slice = "xMidYMid slice";

const TICKERS = ["AURA", "DNMR", "FRLT", "GRNT", "JNPR", "BLKW", "IRVL", "KSTR", "MERD", "VNTA", "CLDS", "HRBR"];

/* 1 - the problem: two books that do not agree, scrolling past each other */
function BackTape() {
  const rows = useMemo(() => {
    const r = rndSeq(600, 11);
    return Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 13 }, (_, i) => {
        const k = row * 13 + i;
        return {
          t: TICKERS[(k * 5 + row) % TICKERS.length],
          a: (r[k] * 9400 + 320).toFixed(2),
          d: (r[k + 200] * 4 - 2).toFixed(2),
          bad: r[k + 400] < 0.26,
        };
      })
    );
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: "-6% 0",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-evenly",
      }}
    >
      {rows.map((row, i) => (
        <div key={i} className={`fx-par-${(i % 3) + 1}`} style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
          <div
            style={{
              display: "inline-flex",
              gap: 40,
              willChange: "transform",
              animation: `${i % 2 ? "tapeR" : "tapeL"} ${46 + i * 11}s linear infinite`,
            }}
          >
            {row.concat(row).map((c, j) => (
              <span
                key={j}
                style={{
                  fontFamily: MONO,
                  fontSize: [15, 12, 17, 13, 19, 12][i],
                  letterSpacing: "0.04em",
                  display: "inline-flex",
                  gap: 10,
                  alignItems: "baseline",
                  opacity: [0.85, 0.5, 0.95, 0.6, 1, 0.45][i],
                }}
              >
                <span style={{ color: c.bad ? T.bad : "rgba(242,242,242,.62)" }}>{c.t}</span>
                <span style={{ color: c.bad ? "rgba(229,72,77,.85)" : T.gold }}>{c.a}</span>
                <span style={{ color: c.d < 0 ? "rgba(229,72,77,.8)" : "rgba(110,231,168,.8)" }}>
                  {c.d < 0 ? "▼" : "▲"}
                  {Math.abs(c.d)}%
                </span>
                {c.bad && <span style={{ color: T.bad }}>✕</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* 2 - how it works: settlements fanning through the tiers, money in motion */
function BackFlow() {
  const lanes = useMemo(() => {
    const r = rndSeq(120, 17);
    return Array.from({ length: 20 }, (_, i) => ({
      y1: 26 + i * 19,
      y2: 60 + ((i * 7) % 16) * 19,
      y3: 120 + ((i * 5) % 7) * 26,
      dur: (4.2 + r[i] * 3.6).toFixed(2),
      delay: (r[i + 40] * 5).toFixed(2),
      tier: r[i + 80] < 0.55 ? 0 : r[i + 80] < 0.88 ? 1 : 2,
    }));
  }, []);
  const col = [T.exact, T.fuzzy, T.llm];

  return (
    <svg viewBox="0 0 800 420" preserveAspectRatio={slice} style={SVG}>
      <g className="fx-par-2">
        {lanes.map((l, i) => {
          const d1 = `M 96 ${l.y1} C 250 ${l.y1}, 250 ${l.y2}, 402 ${l.y2}`;
          const d2 = `M 402 ${l.y2} C 560 ${l.y2}, 560 ${l.y3}, 706 ${l.y3}`;
          const c = col[l.tier];
          return (
            <g key={i}>
              <path d={d1} fill="none" stroke={c} strokeWidth={1} opacity={0.34} />
              <path d={d2} fill="none" stroke={c} strokeWidth={1} opacity={0.22} />
              <circle r={2.6} fill={c} opacity={0.95}>
                <animateMotion dur={`${l.dur}s`} begin={`${l.delay}s`} repeatCount="indefinite" path={d1} />
              </circle>
              <circle r={2.2} fill={c} opacity={0.8}>
                <animateMotion
                  dur={`${l.dur}s`}
                  begin={`${+l.delay + +l.dur / 2}s`}
                  repeatCount="indefinite"
                  path={d2}
                />
              </circle>
            </g>
          );
        })}
        {[96, 402, 706].map((x, i) => (
          <g key={x}>
            <line x1={x} y1={10} x2={x} y2={410} stroke={col[i]} strokeWidth={0.6} opacity={0.28} />
            <text
              x={x}
              y={404}
              textAnchor="middle"
              fontFamily={MONO}
              fontSize={11}
              letterSpacing="2"
              fill={col[i]}
              opacity={0.65}
            >
              {["IN", "TIER 1-2", "RESOLVED"][i]}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* 3 - measurement: the pointer IS the auto-clear threshold. Everything left of
   the cursor is escalated (red), everything right of it clears (gold). Two
   stacked copies of the same scatter, clipped against --mx. */
function BackScatter() {
  const pts = useMemo(() => {
    const r = rndSeq(400, 23);
    return Array.from({ length: 130 }, (_, i) => ({
      x: 60 + (0.32 + r[i] * 0.64) * 690,
      y: 30 + r[i + 130] * 360,
      s: 2 + r[i + 260] * 2.6,
    }));
  }, []);

  const field = (fill) => (
    <svg viewBox="0 0 800 420" preserveAspectRatio={slice} style={SVG}>
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.s}
          fill={fill}
          opacity={0.75}
          style={{ animation: `softPulse ${3 + (i % 7) * 0.5}s ease-in-out ${(i % 11) * 0.2}s infinite` }}
        />
      ))}
    </svg>
  );

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div className="fx-par-1" style={{ position: "absolute", inset: 0, clipPath: "inset(0 0 0 calc(var(--mx) * 1px))" }}>
        {field(T.gold)}
      </div>
      <div
        className="fx-par-1"
        style={{ position: "absolute", inset: 0, clipPath: "inset(0 calc(100% - var(--mx) * 1px) 0 0)" }}
      >
        {field(T.bad)}
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 1,
          transform: "translateX(calc(var(--mx) * 1px))",
          background: `linear-gradient(180deg, transparent, ${T.gold} 14%, ${T.gold} 86%, transparent)`,
          opacity: 0.75,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: 0,
          transform: "translate3d(calc(var(--mx) * 1px - 96px), 0, 0)",
          fontFamily: MONO,
          fontSize: 11.6,
          letterSpacing: "0.18em",
          color: T.bad,
          opacity: 0.8,
        }}
      >
        ESCALATE
      </div>
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: 0,
          transform: "translate3d(calc(var(--mx) * 1px + 14px), 0, 0)",
          fontFamily: MONO,
          fontSize: 11.6,
          letterSpacing: "0.18em",
          color: T.gold,
          opacity: 0.85,
        }}
      >
        AUTO-CLEAR
      </div>
    </div>
  );
}

/* 4 - cash: the balance curve, its area fill, and the floor it breaches */
function BackCurve() {
  const { line, area, breach } = useMemo(() => {
    const r = rndSeq(80, 31);
    let bal = 260;
    const pts = [];
    for (let i = 0; i < 64; i++) {
      bal += r[i] * 42 - 17;
      if (i === 24 || i === 47) bal -= 140;
      pts.push([i * (800 / 63), 372 - Math.max(bal, 24) * 0.78]);
    }
    const d = pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const hit = pts.find((p) => p[1] > 300);
    return { line: d, area: `${d} L 800 420 L 0 420 Z`, breach: hit };
  }, []);

  return (
    <svg viewBox="0 0 800 420" preserveAspectRatio={slice} style={SVG}>
      <defs>
        <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.gold} stopOpacity="0.34" />
          <stop offset="100%" stopColor={T.gold} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="fx-par-2">
        {[120, 180, 240, 300, 360].map((y) => (
          <line key={y} x1={0} y1={y} x2={800} y2={y} stroke={T.line} strokeWidth={0.7} opacity={0.55} />
        ))}
        <path d={area} fill="url(#cashFill)" />
        <line x1={0} y1={300} x2={800} y2={300} stroke={T.bad} strokeWidth={1.2} strokeDasharray="7 5" opacity={0.75} />
        <text x={10} y={294} fontFamily={MONO} fontSize={11} letterSpacing="2" fill={T.bad} opacity={0.85}>
          FLOOR
        </text>
        <path
          d={line}
          fill="none"
          stroke={T.gold}
          strokeWidth={2.2}
          opacity={0.95}
          strokeDasharray="2400"
          style={{ animation: "draw 11s ease-out infinite" }}
        />
        {breach && (
          <>
            <circle cx={breach[0]} cy={breach[1]} r={5} fill={T.bad} />
            <circle
              cx={breach[0]}
              cy={breach[1]}
              r={5}
              fill="none"
              stroke={T.bad}
              strokeWidth={1.4}
              style={{ animation: "ping 2.4s ease-out infinite" }}
            />
          </>
        )}
      </g>
    </svg>
  );
}

/* 5 - the residual: the book closing itself, edge by edge */
function BackResolve() {
  const rows = 29;
  return (
    <svg viewBox="0 0 800 420" preserveAspectRatio={slice} style={SVG}>
      <g className="fx-par-1">
        {Array.from({ length: rows }, (_, i) => {
          const y1 = 22 + i * 14;
          const y2 = 22 + ((i * 7) % rows) * 14;
          return (
            <path
              key={i}
              d={`M 44 ${y1} C 400 ${y1}, 400 ${y2}, 756 ${y2}`}
              fill="none"
              stroke="#6EE7A8"
              strokeWidth={1.1}
              opacity={0}
              strokeDasharray="600"
              style={{ animation: `resolve 7s ease-out ${(i % 9) * 0.35}s infinite` }}
            />
          );
        })}
        {Array.from({ length: rows }, (_, i) => (
          <g key={"n" + i}>
            <circle cx={44} cy={22 + i * 14} r={2.6} fill="rgba(242,242,242,.6)" />
            <circle cx={756} cy={22 + i * 14} r={2.6} fill="rgba(242,242,242,.6)" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/* 6 - the close: a market, drawn candle by candle */
function BackCandles() {
  const { candles, ma } = useMemo(() => {
    const r = rndSeq(400, 47);
    let px = 210;
    const out = [];
    for (let i = 0; i < 52; i++) {
      const o = px;
      px += (r[i] - 0.46) * 46;
      px = Math.max(70, Math.min(330, px));
      const c = px;
      const hi = Math.max(o, c) + r[i + 100] * 22;
      const lo = Math.min(o, c) - r[i + 200] * 22;
      out.push({ x: 22 + i * 15, o, c, hi, lo, up: c >= o, vol: 14 + r[i + 300] * 52 });
    }
    const path = out
      .map((k, i) => {
        const w = out.slice(Math.max(0, i - 4), i + 1);
        const avg = w.reduce((s, v) => s + v.c, 0) / w.length;
        return `${i ? "L" : "M"} ${k.x + 4} ${(420 - avg).toFixed(1)}`;
      })
      .join(" ");
    return { candles: out, ma: path };
  }, []);

  return (
    <svg viewBox="0 0 800 420" preserveAspectRatio={slice} style={SVG}>
      <g className="fx-par-2">
        {candles.map((k, i) => {
          const c = k.up ? "#6EE7A8" : T.bad;
          const yTop = 420 - k.hi;
          const bodyTop = 420 - Math.max(k.o, k.c);
          const bodyH = Math.max(2, Math.abs(k.c - k.o));
          return (
            <g
              key={i}
              style={{
                transformBox: "fill-box",
                transformOrigin: "bottom",
                animation: `rise .5s cubic-bezier(.2,.9,.2,1) ${(i % 26) * 0.09}s both`,
              }}
            >
              <rect x={k.x + 6} y={414 - k.vol} width={7} height={k.vol} fill={c} opacity={0.16} />
              <line x1={k.x + 4.5} y1={yTop} x2={k.x + 4.5} y2={420 - k.lo} stroke={c} strokeWidth={1} opacity={0.6} />
              <rect x={k.x} y={bodyTop} width={9} height={bodyH} fill={c} opacity={0.75} rx={1} />
            </g>
          );
        })}
        <path d={ma} fill="none" stroke={T.gold} strokeWidth={1.8} opacity={0.9} />
      </g>
    </svg>
  );
}

function Backdrop({ active }) {
  const layers = [
    <HeroGraph key="h" />,
    <BackTape key="t" />,
    <BackFlow key="f" />,
    <BackScatter key="s" />,
    <BackCurve key="c" />,
    <BackResolve key="r" />,
    <BackCandles key="k" />,
  ];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div className="fx-dots-base" />
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
      <div className="fx-dots" />
      <div className="fx-scan" />
      <div className="fx-spot" />
    </div>
  );
}

export { BackTape, BackFlow, BackScatter, BackCurve, BackResolve, BackCandles, Backdrop };
