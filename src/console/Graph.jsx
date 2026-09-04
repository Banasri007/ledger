/* The hero: bipartite reconciliation graph.

   Bank left, ledger right, matches as cubic Beziers. Edge colour is the tier,
   thickness is confidence, dashed means N:M.

   Three things drive the layout:

   FIT. The canvas used to be a fixed 17-unit-per-row column inside a 58vh
   scroller, so a 60-invoice batch was cut in half and you had to scroll to see
   the shape you had just watched resolve. It now measures its own box and
   solves for the row height that puts every row on screen at once. Labels are
   dropped automatically when the rows get tighter than they can carry - at 60
   rows on a 1080p screen there is simply not room for both - and DETAIL
   switches back to the tall scrolling view with full-size labels.

   SELECT. Clicking any wire pins it: every other edge drops to 4%, the wire
   and the invoices it settles light gold, and the side column traces it. That
   works for a plain 1:1 match as well as an N:M one, which is what makes a
   dense graph readable.

   The trace lives in the side column, not in a strip over the graph, so the
   fan and the edge it describes are visible at the same time. */

import { useEffect, useRef, useState } from "react";
import { FocusFan, SubsetSum } from "./NmTrace.jsx";
import { dstr, fmt } from "../lib/format.js";
import { MONO, T } from "../theme.js";
import { PANEL } from "../ui/styles.js";
import { TIER_META } from "../ui/tiers.js";

const W = 720;
const ROW_MAX = 17;
const LABEL_MIN_PX = 12; /* real px per row below which labels stop fitting */

/* The edge colours mean nothing without this, and it used to live in the rail
   where it vanished the moment you hovered anything - and it omitted tier 0
   entirely, so the green edges that appear after a re-run had no key. */
function Legend({ matches, unresolved, nm }) {
  const swatch = (color, dashed) => (
    <svg width={22} height={6} style={{ display: "block", flexShrink: 0 }}>
      <line
        x1={0}
        y1={3}
        x2={22}
        y2={3}
        stroke={color}
        strokeWidth={2.2}
        strokeDasharray={dashed ? "3 2" : undefined}
      />
    </svg>
  );

  const item = (key, color, label, count, dashed) => (
    <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      {swatch(color, dashed)}
      <span style={{ color: T.muted }}>{label}</span>
      {count !== null && <span style={{ color: T.dim }}>{count}</span>}
    </span>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
        padding: "9px 26px",
        borderBottom: `1px solid ${T.line}`,
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: "0.04em",
        flexShrink: 0,
        background: "rgba(10,10,10,.5)",
      }}
    >
      {[0, 1, 2, 3].map((t) =>
        item(t, TIER_META[t].color, `Tier ${t} · ${TIER_META[t].name}`, matches.filter((m) => m.tier === t).length)
      )}
      {item("nm", T.gold, "N:M — one wire, many invoices", nm, true)}
      {item("un", T.bad, "Unresolved", unresolved)}
      <span style={{ flex: 1 }} />
      <span style={{ color: T.dim }}>thickness = confidence</span>
    </div>
  );
}

function Graph({ batch, matches, threshold, hover, setHover, pass, difficulty }) {
  const { bank, ledger } = batch;

  const [sel, setSel] = useState(null);
  const [fit, setFit] = useState(true);
  const [box, setBox] = useState({ w: 1200, h: 640 });
  const boxRef = useRef(null);

  /* the fit maths needs the real box, so measure it rather than guess */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox({ w: Math.max(320, r.width), h: Math.max(240, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = Math.max(bank.length, ledger.length, 1);
  const scale = box.w / W;
  const rowH = fit
    ? Math.max(4, Math.min(ROW_MAX, (box.h / scale - 26) / rows))
    : ROW_MAX;
  const H = rows * rowH + 26;
  const labels = rowH * scale >= LABEL_MIN_PX;
  const fs = Math.min(8.2, rowH * 0.6);

  /* the label gutters are only worth reserving when there are labels; in the
     dense view the columns claim that space so the fan spans the panel */
  const xL = labels ? 175 : 62;
  const xR = labels ? 545 : 658;
  const yAt = (i) => 14 + i * rowH;
  const bIdx = Object.fromEntries(bank.map((b, i) => [b.id, i]));
  const lIdx = Object.fromEntries(ledger.map((l, i) => [l.id, i]));

  const matchedB = new Set(matches.map((m) => m.bankId));
  const matchedL = new Set(matches.flatMap((m) => m.invoiceIds));

  const nm = matches.filter((m) => m.invoiceIds.length > 1);
  const selM = sel ? matches.find((m) => m.bankId === sel) : null;
  const selId = selM ? selM.bankId : null;
  const selLen = selM ? selM.invoiceIds.length : 0;
  const nmPos = selId ? nm.findIndex((m) => m.bankId === selId) : -1;

  /* reveal the legs one at a time, keyed by wire so the count resets without
     a synchronous setState when the selection changes */
  const [tick, setTick] = useState({ id: null, n: 0 });
  const step = tick.id === selId ? tick.n : 0;
  useEffect(() => {
    if (!selId || !selLen) return;
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setTick({ id: selId, n: i });
      if (i > selLen) clearInterval(iv);
    }, 380);
    return () => clearInterval(iv);
  }, [selId, selLen]);

  /* only the scrolling view needs bringing into view */
  useEffect(() => {
    const el = boxRef.current;
    if (fit || !selM || !el) return;
    const ys = [bIdx[selM.bankId], ...selM.invoiceIds.map((i) => lIdx[i])]
      .filter((v) => v !== undefined)
      .map(yAt);
    if (!ys.length) return;
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    el.scrollTop = Math.max(0, mid * scale - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, fit]);

  function cycleNm() {
    if (!nm.length) return;
    setHover(null);
    setSel(nmPos === nm.length - 1 ? null : nm[nmPos + 1].bankId);
  }

  const chip = (on) => ({
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: "0.14em",
    padding: "6px 12px",
    borderRadius: 6,
    cursor: "pointer",
    background: on ? "rgba(212,175,55,.1)" : "transparent",
    border: `1px solid ${on ? T.gold : T.line}`,
    color: on ? T.gold : T.muted,
  });

  const railW = selM ? 452 : 360;

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        marginTop: 14,
        alignItems: "stretch",
        /* a definite height is what lets the canvas solve for a row height
           that puts the whole batch on one screen */
        height: "clamp(460px, calc(100vh - 296px), 1200px)",
      }}
    >
      <div style={{ ...PANEL, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "13px 26px",
            borderBottom: `1px solid ${T.line}`,
            fontFamily: MONO,
            fontSize: 11.5,
            letterSpacing: "0.16em",
            color: T.dim,
            flexShrink: 0,
          }}
        >
          <span>BANK · {bank.length}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: T.muted, letterSpacing: "0.06em" }}>
              {matches.length} of {bank.length} resolved
            </span>
            <button onClick={() => setFit((f) => !f)} style={chip(false)}>
              {fit ? "DETAIL" : "FIT"}
            </button>
            {nm.length > 0 && (
              <button onClick={cycleNm} style={chip(!!selM && selLen > 1)}>
                {selM && selLen > 1 ? `N:M ${nmPos + 1} / ${nm.length} ›` : `TRACE N:M · ${nm.length}`}
              </button>
            )}
            {selM && (
              <button onClick={() => setSel(null)} style={chip(false)}>
                CLEAR ×
              </button>
            )}
          </span>
          <span>LEDGER · {ledger.length}</span>
        </div>

        <Legend
          matches={matches}
          unresolved={bank.length - new Set(matches.map((m) => m.bankId)).size}
          nm={nm.length}
        />

        <div
          ref={boxRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: fit ? "hidden" : "auto",
            overflowX: "hidden",
            padding: "10px 0 12px",
          }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            style={
              fit
                ? { width: "100%", height: "100%", display: "block" }
                : { width: "100%", display: "block" }
            }
          >
            {/* edges */}
            {matches.map((m, k) => {
              const meta = TIER_META[m.tier];
              const cleared = m.confidence >= threshold;
              const y1 = yAt(bIdx[m.bankId]);
              const isSel = !!selM && m.bankId === selId;
              const shaded = !!selM && !isSel;
              const isHover = !selM && hover?.bankId === m.bankId;
              return m.invoiceIds.map((iid, j) => {
                if (isSel && j >= step) return null;
                const y2 = yAt(lIdx[iid]);
                const mid = (xL + xR) / 2;
                const d = `M ${xL} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${xR} ${y2}`;
                return (
                  <g key={k + "-" + j}>
                    <path
                      d={d}
                      fill="none"
                      stroke={isSel || cleared ? meta.color : T.dim}
                      strokeWidth={
                        isSel ? 2.6 : isHover ? 2.2 : cleared ? 0.5 + m.confidence * 1.1 : 0.5
                      }
                      opacity={shaded ? 0.04 : isSel || isHover ? 1 : cleared ? 0.55 : 0.22}
                      strokeDasharray={!isSel && m.invoiceIds.length > 1 ? "3 2" : undefined}
                      style={{ animation: "edgeIn .35s ease-out" }}
                    />
                    {isSel && (
                      <circle r={3} fill={meta.color}>
                        <animateMotion dur="1.5s" repeatCount="indefinite" path={d} />
                      </circle>
                    )}
                  </g>
                );
              });
            })}

            {/* bank side */}
            {bank.map((b, i) => {
              const isSelB = selId === b.id;
              const shaded = !!selM && !isSelB;
              const lit = isSelB || hover?.bankId === b.id;
              const show = labels || isSelB;
              return (
                <g
                  key={b.id}
                  opacity={shaded ? 0.26 : 1}
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
                    setSel(mm && selId !== b.id ? b.id : null);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect x={0} y={yAt(i) - rowH / 2} width={xL - 4} height={rowH} fill="transparent" />
                  {show && (
                    <>
                      <text
                        x={12}
                        y={yAt(i) + fs * 0.35}
                        fontFamily={MONO}
                        fontSize={isSelB ? fs * 1.25 : fs}
                        fill={lit ? T.gold : T.dim}
                      >
                        {b.counterparty.length > 16
                          ? b.counterparty.slice(0, 16) + "…"
                          : b.counterparty}
                      </text>
                      <text
                        x={xL - 10}
                        y={yAt(i) + fs * 0.35}
                        textAnchor="end"
                        fontFamily={MONO}
                        fontSize={isSelB ? fs * 1.25 : fs}
                        fill={lit ? T.gold : matchedB.has(b.id) ? T.text : T.bad}
                      >
                        {fmt(b.amount)}
                      </text>
                    </>
                  )}
                  <circle
                    cx={xL}
                    cy={yAt(i)}
                    r={isSelB ? 5 : hover?.bankId === b.id ? 3.6 : Math.max(1.6, rowH * 0.13)}
                    fill={isSelB ? T.gold : matchedB.has(b.id) ? T.surfaceUp : T.bad}
                    stroke={isSelB ? T.goldHi : matchedB.has(b.id) ? T.muted : T.bad}
                    strokeWidth={0.9}
                    style={
                      !matchedB.has(b.id) && pass === 9 ? { animation: "pulse 2s infinite" } : {}
                    }
                  />
                </g>
              );
            })}

            {/* ledger side */}
            {ledger.map((l, i) => {
              const leg = selM ? selM.invoiceIds.indexOf(l.id) : -1;
              const isLit = leg >= 0 && leg < step;
              const shaded = !!selM && !isLit;
              const show = labels || isLit;
              return (
                <g key={l.id} opacity={shaded ? 0.26 : 1}>
                  <circle
                    cx={xR}
                    cy={yAt(i)}
                    r={isLit ? 5 : Math.max(1.6, rowH * 0.13)}
                    fill={isLit ? T.gold : matchedL.has(l.id) ? T.surfaceUp : T.bad}
                    stroke={isLit ? T.goldHi : matchedL.has(l.id) ? T.muted : T.bad}
                    strokeWidth={0.9}
                  />
                  {show && (
                    <>
                      <text
                        x={xR + 11}
                        y={yAt(i) + fs * 0.35}
                        fontFamily={MONO}
                        fontSize={isLit ? fs * 1.25 : fs}
                        fill={isLit ? T.gold : T.muted}
                      >
                        {l.ref}
                      </text>
                      <text
                        x={xR + 63}
                        y={yAt(i) + fs * 0.35}
                        fontFamily={MONO}
                        fontSize={isLit ? fs * 1.25 : fs}
                        fill={isLit ? T.gold : T.dim}
                      >
                        {fmt(l.amount)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {!labels && fit && (
          <div
            style={{
              padding: "9px 26px 12px",
              borderTop: `1px solid ${T.line}`,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: "0.1em",
              color: T.dim,
              flexShrink: 0,
            }}
          >
            {rows} ROWS — LABELS HIDDEN TO FIT. HOVER OR CLICK A WIRE, OR SWITCH TO DETAIL.
          </div>
        )}
      </div>

      {/* rail */}
      <div
        style={{
          ...PANEL,
          width: railW,
          flexShrink: 0,
          padding: 22,
          fontFamily: MONO,
          fontSize: 12.6,
          color: T.muted,
          alignSelf: "flex-start",
          maxHeight: "calc(100vh - 150px)",
          overflowY: "auto",
          transition: "width .3s cubic-bezier(.2,.9,.2,1)",
        }}
      >
        {selM ? (
          <>
            <FocusFan m={selM} bank={bank} ledger={ledger} step={step} />
            <div style={{ height: 1, background: T.line, margin: "18px 0" }} />
            <SubsetSum m={selM} bank={bank} ledger={ledger} step={step} />
          </>
        ) : !hover ? (
          <div style={{ color: T.dim, lineHeight: 1.7 }}>
            Click any wire to pin it and trace where it settled. Hover to peek.
            {nm.length > 0 ? (
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
                <span style={{ color: T.gold }}>{nm.length}</span> dashed edges are one wire paying
                several invoices — click one, or hit TRACE N:M.
              </div>
            ) : difficulty < 4 ? (
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
                Merged wires are planted from noise 4 up, so there is no N:M to trace at noise{" "}
                {difficulty}.
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ lineHeight: 1.8 }}>
            <div style={{ color: T.text, fontSize: 15, fontWeight: 600 }}>{hover.rec.id}</div>
            <div>{fmt(hover.rec.amount)}</div>
            <div>{hover.rec.counterparty}</div>
            <div>{dstr(hover.rec.date)}</div>
            <div style={{ color: T.dim }}>ref {hover.rec.ref}</div>
            <div style={{ height: 1, background: T.line, margin: "16px 0" }} />
            {hover.m ? (
              <>
                <div style={{ color: TIER_META[hover.m.tier].color }}>
                  Tier {hover.m.tier} · {TIER_META[hover.m.tier].name}
                </div>
                <div style={{ color: T.text, fontSize: 26, fontWeight: 700, margin: "6px 0" }}>
                  {hover.m.confidence.toFixed(2)}
                </div>
                <div style={{ color: T.muted, lineHeight: 1.6 }}>{hover.m.reason}</div>
                <div style={{ marginTop: 12, color: T.dim }}>
                  → {hover.m.invoiceIds.join(", ")}
                </div>
                <div style={{ color: T.dim }}>{hover.m.candidates} candidate(s) considered</div>
                <div style={{ marginTop: 12, color: T.gold }}>Click to pin this trace →</div>
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
