/* The N:M moment: one wire fanning out to several invoices, with the
   subset sum ticking up to the wire amount. */

import { fmt } from "../lib/format.js";
import { MONO, T } from "../theme.js";
import { TIER_META } from "../ui/tiers.js";

/* ---------- N:M money shot: one wire fanning out, at a scale that fits ----------
   The main graph is 60 rows tall inside a 58vh scroller, so a wire and its
   invoices can sit 1000px apart — no scroll position shows them together.
   This strip gives the fan its own coordinate space. ---------------------- */
function FocusFan({ m, bank, ledger, step }) {
  const b = bank.find((x) => x.id === m.bankId);
  const invs = m.invoiceIds.map((id) => ledger.find((l) => l.id === id)).filter(Boolean);
  if (!b || !invs.length) return null;
  const meta = TIER_META[m.tier];
  const n = invs.length;
  const W = 620;
  const H = 30 + n * 46;
  const xA = 210,
    xB = 420,
    mid = (xA + xB) / 2;
  const yMid = H / 2;
  const yFor = (i) => yMid + (i - (n - 1) / 2) * 46;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {invs.map((l, i) => {
        if (i >= step) return null;
        const y2 = yFor(i);
        const d = `M ${xA} ${yMid} C ${mid} ${yMid}, ${mid} ${y2}, ${xB} ${y2}`;
        return (
          <g key={l.id} style={{ animation: "edgeIn .4s ease-out" }}>
            <path d={d} fill="none" stroke={meta.color} strokeWidth={2.6} opacity={0.85} />
            <circle r={3.2} fill={meta.color}>
              <animateMotion dur="1.5s" repeatCount="indefinite" path={d} />
            </circle>
            <circle cx={xB} cy={y2} r={4} fill={T.gold} stroke={T.goldHi} strokeWidth={1.1} />
            <text x={xB + 13} y={y2 + 3.6} fontFamily={MONO} fontSize={12.2} fill={T.text}>
              {l.ref}
            </text>
            <text x={xB + 100} y={y2 + 3.6} fontFamily={MONO} fontSize={12.2} fill={T.muted}>
              {fmt(l.amount)}
            </text>
          </g>
        );
      })}
      <circle cx={xA} cy={yMid} r={5.5} fill={T.gold} stroke={T.goldHi} strokeWidth={1.2} />
      <text
        x={xA - 15}
        y={yMid - 4}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={11.6}
        fill={T.muted}
      >
        {b.counterparty}
      </text>
      <text
        x={xA - 15}
        y={yMid + 12}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={14.9}
        fill={T.gold}
      >
        {fmt(b.amount)}
      </text>
    </svg>
  );
}

/* ---------- N:M readout: the subset sum, ticking to the wire ---------- */
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
        SUBSET SUM &middot; TIER {m.tier}
      </div>
      <div style={{ color: T.text, fontSize: 14.9, fontWeight: 600, marginTop: 12 }}>
        {m.bankId} &middot; one wire
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
        ✓ reconciles within the $55 tolerance
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
