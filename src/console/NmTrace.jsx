/* The N:M moment: one wire fanning out to several invoices, with the
   subset sum ticking up to the wire amount. */

import { fmt } from "../lib/format.js";
import { MONO, T } from "../theme.js";
import { TIER_META } from "../ui/tiers.js";

/* ---------- the trace fan ----------------------------------------------
   This used to be a strip laid across the top of the graph, which hid the
   very rows it was talking about. It now lives in the side column, shaped
   for a narrow portrait space, so the fan and the full graph are on screen
   at the same time and you can see which edge is lit.
   ---------------------------------------------------------------------- */
function FocusFan({ m, bank, ledger, step }) {
  const b = bank.find((x) => x.id === m.bankId);
  const invs = m.invoiceIds.map((id) => ledger.find((l) => l.id === id)).filter(Boolean);
  if (!b || !invs.length) return null;
  const meta = TIER_META[m.tier];
  const n = invs.length;
  const W = 420;
  const H = 48 + n * 78;
  const xA = 62;
  const xB = 246;
  const mid = (xA + xB) / 2;
  const yMid = H / 2;
  const yFor = (i) => 40 + i * 78 + 39;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {invs.map((l, i) => {
        if (i >= step) return null;
        const y2 = yFor(i);
        const d = `M ${xA} ${yMid} C ${mid} ${yMid}, ${mid} ${y2}, ${xB} ${y2}`;
        return (
          <g key={l.id} style={{ animation: "edgeIn .4s ease-out" }}>
            <path d={d} fill="none" stroke={meta.color} strokeWidth={2.6} opacity={0.85} />
            <circle r={3.4} fill={meta.color}>
              <animateMotion dur="1.5s" repeatCount="indefinite" path={d} />
            </circle>
            <circle cx={xB} cy={y2} r={4.6} fill={T.gold} stroke={T.goldHi} strokeWidth={1.2} />
            <text x={xB + 16} y={y2 - 2} fontFamily={MONO} fontSize={14} fill={T.text}>
              {l.ref}
            </text>
            <text x={xB + 16} y={y2 + 17} fontFamily={MONO} fontSize={13} fill={T.muted}>
              {fmt(l.amount)}
            </text>
          </g>
        );
      })}
      <circle cx={xA} cy={yMid} r={6.5} fill={T.gold} stroke={T.goldHi} strokeWidth={1.4} />
      {/* the amount lives in the readout directly below; repeating it here only
          overflowed the narrow gutter */}
      <text x={xA} y={yMid - 18} textAnchor="middle" fontFamily={MONO} fontSize={12} fill={T.muted}>
        WIRE
      </text>
    </svg>
  );
}

function SubsetSum({ m, bank, ledger, step }) {
  const b = bank.find((x) => x.id === m.bankId);
  const invs = m.invoiceIds.map((id) => ledger.find((l) => l.id === id)).filter(Boolean);
  const total = invs.reduce((s, l) => s + l.amount, 0);
  const running = invs.slice(0, step).reduce((s, l) => s + l.amount, 0);
  const settled = step > invs.length;
  const delta = b ? Math.round((b.amount - total) * 100) / 100 : 0;
  const meta = TIER_META[m.tier];
  const row = { display: "flex", justifyContent: "space-between", gap: 10 };

  return (
    <div style={{ lineHeight: 1.7 }}>
      <div style={{ fontSize: 11.6, letterSpacing: "0.16em", color: meta.color }}>
        {invs.length > 1 ? "SUBSET SUM" : "TRACE"} &middot; TIER {m.tier}
      </div>
      <div style={{ color: T.text, fontSize: 14.9, fontWeight: 600, marginTop: 12 }}>
        {m.bankId} &middot; {invs.length > 1 ? `one wire, ${invs.length} invoices` : "one wire"}
      </div>
      <div style={{ color: T.dim }}>{b?.counterparty}</div>
      <div
        style={{
          fontSize: 28.1,
          fontWeight: 700,
          color: T.gold,
          letterSpacing: "-0.02em",
          margin: "8px 0 2px",
        }}
      >
        {b ? fmt(b.amount) : "—"}
      </div>
      <div style={{ fontSize: 11, letterSpacing: "0.16em", color: T.dim }}>TARGET</div>

      <div style={{ height: 1, background: T.line, margin: "16px 0 12px" }} />

      {invs.map((l, i) => (
        <div
          key={l.id}
          style={{
            ...row,
            opacity: i < step ? 1 : 0.12,
            transition: "opacity .3s ease",
            color: T.muted,
          }}
        >
          <span>{l.ref}</span>
          <span style={{ color: T.text }}>{fmt(l.amount)}</span>
        </div>
      ))}

      <div style={{ height: 1, background: T.line, margin: "12px 0" }} />

      <div style={{ ...row, color: T.muted }}>
        <span>subtotal</span>
        <span style={{ color: T.text, fontWeight: 700, fontSize: 15.5 }}>{fmt(running)}</span>
      </div>
      <div
        style={{
          ...row,
          color: T.muted,
          opacity: settled ? 1 : 0.12,
          transition: "opacity .3s ease",
        }}
      >
        <span>{Math.abs(delta) < 0.005 ? "exact" : delta < 0 ? "fee & FX" : "short-paid"}</span>
        <span style={{ color: T.text }}>{fmt(Math.abs(delta))}</span>
      </div>

      <div
        style={{
          marginTop: 14,
          opacity: settled ? 1 : 0,
          transition: "opacity .35s ease",
          color: T.ok,
          fontSize: 14,
        }}
      >
        ✓ {invs.length > 1 ? "reconciles within the $55 tolerance" : "matched within tolerance"}
      </div>

      <div style={{ height: 1, background: T.line, margin: "16px 0" }} />
      <div style={{ color: T.muted, lineHeight: 1.6 }}>{m.reason}</div>
      <div style={{ marginTop: 10, color: T.dim }}>
        confidence {m.confidence.toFixed(2)} &middot; {m.candidates} candidate(s) considered
      </div>
    </div>
  );
}

export { FocusFan, SubsetSum };
