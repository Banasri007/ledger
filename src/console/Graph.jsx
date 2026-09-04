/* The hero: bipartite reconciliation graph.

   Bank left, ledger right, matches as cubic Beziers. Edge colour is the
   tier, thickness is confidence, dashed means N:M. Matches stream in one
   at a time during a run so the three passes visibly land in sequence. */

import { useState, useRef, useEffect } from "react";
import { FocusFan, SubsetSum } from "./NmTrace.jsx";
import { dstr, fmt } from "../lib/format.js";
import { MONO, T } from "../theme.js";
import { PANEL } from "../ui/styles.js";
import { TIER_META } from "../ui/tiers.js";

/* ---------- the hero: bipartite graph ---------- */
function Graph({ batch, matches, threshold, hover, setHover, pass, difficulty }) {
  const { bank, ledger } = batch;
  const rowH = 16;
  const H = Math.max(bank.length, ledger.length) * rowH + 24;
  const W = 620;
  const xL = 205,
    xR = 415;

  const yB = (i) => 14 + i * rowH;
  const yL = (i) => 14 + i * rowH;
  const bIdx = Object.fromEntries(bank.map((b, i) => [b.id, i]));
  const lIdx = Object.fromEntries(ledger.map((l, i) => [l.id, i]));

  const matchedB = new Set(matches.map((m) => m.bankId));
  const matchedL = new Set(matches.flatMap((m) => m.invoiceIds));

  /* ---- N:M spotlight: one fat wire fanning out, subset sum ticking up ---- */
  const nm = matches.filter((m) => m.invoiceIds.length > 1);
  const [spot, setSpot] = useState(null);
  const scrollRef = useRef(null);
  /* derived, so a re-run that empties matches drops the spotlight on its own */
  const spotM = spot ? matches.find((m) => m.bankId === spot) : null;
  const spotId = spotM ? spotM.bankId : null;
  const spotLen = spotM ? spotM.invoiceIds.length : 0;
  const spotPos = spotId ? nm.findIndex((m) => m.bankId === spotId) : -1;

  /* reveal the legs one at a time, then settle. keyed by wire so the
     count resets without a synchronous setState on spotlight change. */
  const [tick, setTick] = useState({ id: null, n: 0 });
  const step = tick.id === spotId ? tick.n : 0;
  useEffect(() => {
    if (!spotId || !spotLen) return;
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setTick({ id: spotId, n: i });
      if (i > spotLen) clearInterval(iv);
    }, 420);
    return () => clearInterval(iv);
  }, [spotId, spotLen]);

  /* bring the fan into view inside the scroller */
  useEffect(() => {
    const el = scrollRef.current;
    if (!spotM || !el) return;
    const rows = [bIdx[spotM.bankId], ...spotM.invoiceIds.map((i) => lIdx[i])].filter(
      (v) => v !== undefined
    );
    if (!rows.length) return;
    const ys = rows.map(yB);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const scale = el.clientWidth / W || 1;
    el.scrollTop = Math.max(0, mid * scale - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);

  function cycle() {
    if (!nm.length) return;
    setHover(null);
    setSpot(spotPos === nm.length - 1 ? null : nm[spotPos + 1].bankId);
  }

  const chip = {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: "0.14em",
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
    background: spotM ? "rgba(212,175,55,.1)" : "transparent",
    border: "1px solid " + (spotM ? T.gold : T.line),
    color: spotM ? T.gold : T.muted,
  };

  return (
    <div style={{ display: "flex", gap: 14, marginTop: 14, alignItems: "flex-start" }}>
      <div style={{ ...PANEL, flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "11px 26px",
            borderBottom: `1px solid ${T.line}`,
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: "0.16em",
            color: T.dim,
          }}
        >
          <span>BANK &middot; {bank.length}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: T.muted, letterSpacing: "0.06em" }}>
              {matches.length} of {bank.length} resolved
            </span>
            {nm.length > 0 ? (
              <button onClick={cycle} style={chip}>
                {spotM ? `N:M ${spotPos + 1} / ${nm.length} ›` : `TRACE N:M · ${nm.length}`}
              </button>
            ) : matches.length > 0 && difficulty < 4 ? (
              <span style={{ color: T.dim }}>MERGED WIRES START AT NOISE 4</span>
            ) : null}
          </span>
          <span>LEDGER &middot; {ledger.length}</span>
        </div>
        {spotM && (
          <div
            style={{
              borderBottom: `1px solid ${T.line}`,
              background: "rgba(212,175,55,.04)",
              padding: "16px 26px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: "0.16em",
                color: T.gold,
                marginBottom: 10,
              }}
            >
              <span>
                TRACING {spotM.bankId} &middot; ONE WIRE, {spotM.invoiceIds.length} INVOICES
              </span>
              <button
                onClick={() => setSpot(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: "0.16em",
                  color: T.dim,
                  padding: 0,
                }}
              >
                CLOSE &times;
              </button>
            </div>
            <FocusFan m={spotM} bank={bank} ledger={ledger} step={step} />
          </div>
        )}
        <div
          ref={scrollRef}
          style={{ overflowY: "auto", maxHeight: spotM ? "34vh" : "58vh", padding: "10px 0 16px" }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>

          {/* edges */}
          {matches.map((m, k) => {
            const meta = TIER_META[m.tier];
            const cleared = m.confidence >= threshold;
            const y1 = yB(bIdx[m.bankId]);
            const isSpot = !!spotM && m.bankId === spotId;
            const shaded = !!spotM && !isSpot;
            const isHover = !spotM && hover?.bankId === m.bankId;
            return m.invoiceIds.map((iid, j) => {
              if (isSpot && j >= step) return null;
              const y2 = yL(lIdx[iid]);
              const mid = (xL + xR) / 2;
              const d = `M ${xL} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${xR} ${y2}`;
              return (
                <g key={k + "-" + j}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isSpot || cleared ? meta.color : T.dim}
                    strokeWidth={
                      isSpot ? 2.4 : isHover ? 2.2 : cleared ? 0.5 + m.confidence * 1.1 : 0.5
                    }
                    opacity={shaded ? 0.05 : isSpot || isHover ? 1 : cleared ? 0.55 : 0.22}
                    strokeDasharray={!isSpot && m.invoiceIds.length > 1 ? "3 2" : undefined}
                    style={{ animation: "edgeIn .35s ease-out" }}
                  />
                  {isSpot && (
                    <circle r={2.8} fill={meta.color}>
                      <animateMotion dur="1.5s" repeatCount="indefinite" path={d} />
                    </circle>
                  )}
                </g>
              );
            });
          })}

          {/* nodes */}
          {bank.map((b, i) => {
            const isSpotB = spotId === b.id;
            const shaded = !!spotM && !isSpotB;
            const lit = isSpotB || hover?.bankId === b.id;
            return (
              <g
                key={b.id}
                opacity={shaded ? 0.28 : 1}
                onMouseEnter={() =>
                  setHover({
                    side: "bank",
                    bankId: b.id,
                    rec: b,
                    m: matches.find((x) => x.bankId === b.id),
                  })
                }
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  const mm = matches.find((x) => x.bankId === b.id);
                  setSpot(mm && mm.invoiceIds.length > 1 ? b.id : null);
                }}
                style={{ cursor: "pointer" }}
              >
                <rect x={8} y={yB(i) - 8} width={xL - 6} height={16} fill="transparent" />
                <text
                  x={20}
                  y={yB(i) + 2.6}
                  fontFamily={MONO}
                  fontSize={7.4}
                  fill={lit ? T.gold : T.dim}
                >
                  {b.counterparty.length > 20
                    ? b.counterparty.slice(0, 20) + "…"
                    : b.counterparty}
                </text>
                <text
                  x={xL - 10}
                  y={yB(i) + 2.6}
                  textAnchor="end"
                  fontFamily={MONO}
                  fontSize={7.4}
                  fill={lit ? T.gold : matchedB.has(b.id) ? T.text : T.bad}
                >
                  {fmt(b.amount)}
                </text>
                <circle
                  cx={xL}
                  cy={yB(i)}
                  r={isSpotB ? 4.2 : hover?.bankId === b.id ? 3.4 : 2.1}
                  fill={isSpotB ? T.gold : matchedB.has(b.id) ? T.surfaceUp : T.bad}
                  stroke={isSpotB ? T.goldHi : matchedB.has(b.id) ? T.muted : T.bad}
                  strokeWidth={0.9}
                  style={
                    !matchedB.has(b.id) && pass === 9 ? { animation: "pulse 2s infinite" } : {}
                  }
                />
              </g>
            );
          })}

          {ledger.map((l, i) => {
            const leg = spotM ? spotM.invoiceIds.indexOf(l.id) : -1;
            const lit = leg >= 0 && leg < step;
            const shaded = !!spotM && !lit;
            return (
              <g key={l.id} opacity={shaded ? 0.28 : 1}>
                <circle
                  cx={xR}
                  cy={yL(i)}
                  r={lit ? 4.2 : 2.1}
                  fill={lit ? T.gold : matchedL.has(l.id) ? T.surfaceUp : T.bad}
                  stroke={lit ? T.goldHi : matchedL.has(l.id) ? T.muted : T.bad}
                  strokeWidth={0.9}
                />
                <text
                  x={xR + 10}
                  y={yL(i) + 2.6}
                  fontFamily={MONO}
                  fontSize={7.4}
                  fill={lit ? T.gold : T.muted}
                >
                  {l.ref}
                </text>
                <text
                  x={xR + 62}
                  y={yL(i) + 2.6}
                  fontFamily={MONO}
                  fontSize={7.4}
                  fill={lit ? T.gold : T.dim}
                >
                  {fmt(l.amount)}
                </text>
              </g>
            );
          })}
          </svg>
        </div>
      </div>

      {/* inspector */}
      <div
        style={{
          ...PANEL,
          width: 292,
          flexShrink: 0,
          padding: 22,
          fontFamily: MONO,
          fontSize: 11,
          color: T.muted,
          position: "sticky",
          top: 76,
        }}
      >
        {spotM ? (
          <SubsetSum m={spotM} bank={bank} ledger={ledger} step={step} />
        ) : !hover ? (
          <div style={{ color: T.dim, lineHeight: 1.7 }}>
            Hover any wire to trace how it resolved.
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 9 }}>
              {[1, 2, 3].map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 16, height: 2, background: TIER_META[t].color }} />
                  <span style={{ color: T.muted }}>
                    Tier {t} &middot; {TIER_META[t].name}
                  </span>
                  <span style={{ color: T.dim }}>
                    {matches.filter((m) => m.tier === t).length}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 16, height: 2, background: T.bad }} />
                <span>Unresolved</span>
              </div>
            </div>
            {nm.length > 0 && (
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
                <span style={{ color: T.gold }}>{nm.length}</span> dashed edges are one wire paying
                several invoices. Click one &mdash; or hit TRACE N:M &mdash; to watch the subset sum
                land.
              </div>
            )}
          </div>
        ) : (
          <div style={{ lineHeight: 1.8 }}>
            <div style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{hover.rec.id}</div>
            <div>{fmt(hover.rec.amount)}</div>
            <div>{hover.rec.counterparty}</div>
            <div>{dstr(hover.rec.date)}</div>
            <div style={{ color: T.dim }}>ref {hover.rec.ref}</div>
            <div style={{ height: 1, background: T.line, margin: "16px 0" }} />
            {hover.m ? (
              <>
                <div style={{ color: TIER_META[hover.m.tier].color }}>
                  Tier {hover.m.tier} &middot; {TIER_META[hover.m.tier].name}
                </div>
                <div style={{ color: T.text, fontSize: 22, fontWeight: 700, margin: "6px 0" }}>
                  {hover.m.confidence.toFixed(2)}
                </div>
                <div style={{ color: T.muted, lineHeight: 1.6 }}>{hover.m.reason}</div>
                <div style={{ marginTop: 12, color: T.dim }}>
                  &rarr; {hover.m.invoiceIds.join(", ")}
                </div>
                <div style={{ color: T.dim }}>{hover.m.candidates} candidate(s) considered</div>
                {hover.m.invoiceIds.length > 1 && (
                  <div style={{ marginTop: 12, color: T.gold }}>
                    Click to trace the subset sum &rarr;
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: T.bad }}>
                No candidate found. Escalated to the exception list.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { Graph };
