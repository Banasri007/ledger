/* Confidence spectrum with a draggable threshold.

   The demo move: drag the threshold down and watch match rate climb while
   red dots (wrong matches) appear above the line. Precision/recall made
   physical, with no equation on screen. */

import { scoreMatch } from "../engine/match.js";
import { MONO, T } from "../theme.js";
import { PANEL } from "../ui/styles.js";
import { TIER_META } from "../ui/tiers.js";

/* ---------- confidence spectrum ---------- */
function Confidence({ matches, threshold, truth }) {
  const W = 900,
    H = 260;
  return (
    <div style={{ ...PANEL, marginTop: 14, padding: "26px 28px 30px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
        <line x1={40} y1={H - 40} x2={W - 40} y2={H - 40} stroke={T.line} />
        {[0.4, 0.55, 0.7, 0.85, 1].map((t) => {
          const x = 40 + ((t - 0.4) / 0.6) * (W - 80);
          return (
            <g key={t}>
              <text x={x} y={H - 22} fill={T.dim} fontFamily={MONO} fontSize={9} textAnchor="middle">
                {t.toFixed(2)}
              </text>
            </g>
          );
        })}
        <line
          x1={40 + ((threshold - 0.4) / 0.6) * (W - 80)}
          y1={20}
          x2={40 + ((threshold - 0.4) / 0.6) * (W - 80)}
          y2={H - 40}
          stroke={T.gold}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {matches.map((m, i) => {
          const x = 40 + ((m.confidence - 0.4) / 0.6) * (W - 80);
          const correct = scoreMatch(m, truth);
          const cleared = m.confidence >= threshold;
          return (
            <circle
              key={i}
              cx={Math.max(42, Math.min(W - 42, x))}
              cy={H - 60 - (i % 22) * 8}
              r={3}
              fill={correct ? TIER_META[m.tier].color : T.bad}
              opacity={cleared ? 0.95 : 0.25}
            />
          );
        })}
      </svg>
      <div style={{ fontFamily: MONO, fontSize: 11, color: T.muted, marginTop: 10 }}>
        Each dot is one proposed match. Red is wrong. Faded sits below your threshold and gets
        escalated instead of cleared. Drag the auto-clear slider and watch the trade.
      </div>
    </div>
  );
}

export { Confidence };
