/* The residual, ranked by value at risk — and the review queue that clears it.

   RESOLVE used to look the answer up in the planted ground truth. That was not
   review, it was reading the answer key, and on uploaded data (which has no
   key) it silently did nothing at all.

   It now does what an exception queue actually does: rank the open invoices
   against the wire, show the evidence for each, and let a person choose. You
   can pick several, because one wire settling several invoices is the case
   that matters — the running subtotal against the wire amount is right there
   as you tick them.

   The chosen invoices are what mineRules learns from, so the rules it derives
   come from a real decision rather than from the answer. */

import { useState } from "react";
import { fmt } from "../lib/format.js";
import { MONO, T } from "../theme.js";
import { PANEL } from "../ui/styles.js";

const TOL = 55; /* the same fee/FX window tier 2 uses */

function Candidate({ c, picked, onToggle }) {
  const evidence = [
    c.refHit ? "reference" : c.digitHit ? "trailing digits" : null,
    c.nameScore >= 0.5 ? `name ${c.nameScore.toFixed(2)}` : null,
    Math.abs(c.delta) < 0.005 ? "amount exact" : `Δ ${fmt(Math.abs(c.delta))}`,
    `${c.days}d apart`,
  ].filter(Boolean);

  return (
    <button
      onClick={onToggle}
      className="fx-mag"
      style={{
        display: "grid",
        gridTemplateColumns: "18px 96px 1fr 104px",
        gap: 12,
        alignItems: "center",
        textAlign: "left",
        width: "100%",
        padding: "10px 12px",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: MONO,
        fontSize: 12.6,
        color: T.text,
        background: picked ? "rgba(212,175,55,.1)" : "rgba(21,21,21,.6)",
        border: `1px solid ${picked ? T.gold : T.line}`,
      }}
    >
      <span style={{ color: picked ? T.gold : T.dim }}>{picked ? "▣" : "▢"}</span>
      <span>{c.inv.ref}</span>
      <span style={{ color: T.dim, fontSize: 11.5 }}>
        {c.inv.customer} · {evidence.join(" · ")}
      </span>
      <span style={{ textAlign: "right" }}>{fmt(c.inv.amount)}</span>
    </button>
  );
}

function Picker({ wire, candidates, onConfirm, onOrphan, onCancel }) {
  const [sel, setSel] = useState([]);
  const chosen = candidates.filter((c) => sel.includes(c.inv.id));
  const subtotal = chosen.reduce((s, c) => s + c.inv.amount, 0);
  const delta = wire ? Math.round((wire.amount - subtotal) * 100) / 100 : 0;
  const within = sel.length > 0 && Math.abs(delta) <= TOL;

  const toggle = (id) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div
      style={{
        margin: "2px 0 10px",
        padding: "16px 16px 14px",
        borderRadius: 10,
        border: `1px solid rgba(212,175,55,.3)`,
        background: "rgba(212,175,55,.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: "0.14em",
          color: T.gold,
          marginBottom: 12,
        }}
      >
        <span>WHICH INVOICES DOES THIS WIRE SETTLE?</span>
        <span style={{ color: T.dim }}>
          {wire ? `${wire.counterparty} · ${wire.ref} · ${fmt(wire.amount)}` : ""}
        </span>
      </div>

      {candidates.length === 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 12.6, color: T.dim }}>
          No invoices are still open — nothing to match this against.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {candidates.map((c) => (
            <Candidate
              key={c.inv.id}
              c={c}
              picked={sel.includes(c.inv.id)}
              onToggle={() => toggle(c.inv.id)}
            />
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${T.line}`,
          fontFamily: MONO,
          fontSize: 12.6,
        }}
      >
        <span style={{ color: T.dim }}>
          selected <span style={{ color: T.text }}>{fmt(subtotal)}</span>
        </span>
        <span style={{ color: T.dim }}>
          wire <span style={{ color: T.text }}>{wire ? fmt(wire.amount) : "—"}</span>
        </span>
        <span style={{ color: sel.length === 0 ? T.dim : within ? T.ok : T.bad }}>
          {sel.length === 0
            ? "pick one or more"
            : within
            ? `✓ within ${fmt(TOL)} — Δ ${fmt(Math.abs(delta))}`
            : `Δ ${fmt(Math.abs(delta))} — outside tolerance`}
        </span>

        <div style={{ flex: 1 }} />

        <button onClick={onCancel} className="fx-mag" style={btnStyle(false)}>
          CANCEL
        </button>
        <button onClick={onOrphan} className="fx-mag" style={btnStyle(false)}>
          NOT A MATCH
        </button>
        <button
          onClick={() => onConfirm(sel)}
          disabled={!sel.length}
          className="fx-mag"
          style={{ ...btnStyle(true), opacity: sel.length ? 1 : 0.4 }}
        >
          CONFIRM {sel.length || ""}
        </button>
      </div>
    </div>
  );
}

function btnStyle(primary) {
  return {
    fontFamily: MONO,
    fontSize: 11.5,
    letterSpacing: "0.1em",
    padding: "8px 14px",
    borderRadius: 7,
    cursor: "pointer",
    color: primary ? "#0B0B0B" : T.text,
    background: primary ? `linear-gradient(180deg, ${T.goldHi}, ${T.goldLo})` : "transparent",
    border: primary ? "none" : `1px solid ${T.line}`,
    fontWeight: primary ? 700 : 400,
  };
}

function Exceptions({ items, onResolve, resolved, rules, wireFor, candidatesFor }) {
  const done = new Set((resolved || []).map((r) => r.bankId));
  const [picking, setPicking] = useState(null);

  return (
    <div style={{ display: "flex", gap: 14, marginTop: 14, alignItems: "flex-start" }}>
      <div style={{ ...PANEL, flex: 1, minWidth: 0, padding: "22px 22px 26px" }}>
        <div style={{ fontFamily: MONO, fontSize: 12.2, letterSpacing: "0.14em", color: T.dim }}>
          RANKED BY VALUE AT RISK
        </div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 1 }}>
          {items.length === 0 && (
            <div style={{ color: T.dim, fontFamily: MONO, fontSize: 13.8 }}>
              Nothing yet. Run a reconciliation.
            </div>
          )}
          {items.map((e, i) => {
            const isDone = done.has(e.id);
            const open = picking === e.id;
            return (
              <div key={e.id || i}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 100px 1fr 90px 92px",
                    gap: 14,
                    padding: "12px 14px",
                    background: isDone
                      ? "rgba(110,231,168,.06)"
                      : open
                      ? "rgba(212,175,55,.07)"
                      : i % 2
                      ? "transparent"
                      : T.surface,
                    borderRadius: 6,
                    alignItems: "center",
                    fontFamily: MONO,
                    fontSize: 13.4,
                  }}
                >
                  <span style={{ color: e.kind === "No candidate" ? T.bad : T.gold }}>{e.kind}</span>
                  <span style={{ color: T.text }}>{e.id}</span>
                  <span style={{ color: T.muted }}>
                    {isDone ? resolved.find((r) => r.bankId === e.id)?.note : e.detail}
                  </span>
                  <span style={{ color: T.text, textAlign: "right" }}>{fmt(e.amount || 0)}</span>
                  {isDone ? (
                    <span style={{ color: "#6EE7A8", fontSize: 12.2, textAlign: "center" }}>
                      resolved
                    </span>
                  ) : (
                    <button
                      onClick={() => setPicking(open ? null : e.id)}
                      className="fx-mag"
                      style={{
                        fontFamily: MONO,
                        fontSize: 12.2,
                        letterSpacing: "0.08em",
                        padding: "6px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        background: open ? "rgba(212,175,55,.12)" : "transparent",
                        border: `1px solid ${open ? T.gold : T.line}`,
                        color: open ? T.gold : T.text,
                      }}
                    >
                      {open ? "CLOSE" : "REVIEW"}
                    </button>
                  )}
                </div>

                {open && (
                  <Picker
                    wire={wireFor?.(e.id)}
                    candidates={candidatesFor?.(e.id) || []}
                    onCancel={() => setPicking(null)}
                    onOrphan={() => {
                      onResolve(e.id, []);
                      setPicking(null);
                    }}
                    onConfirm={(ids) => {
                      onResolve(e.id, ids);
                      setPicking(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...PANEL, width: 320, flexShrink: 0, padding: 22 }}>
        <div style={{ fontFamily: MONO, fontSize: 12.2, letterSpacing: "0.14em", color: T.dim }}>
          RULES LEARNED
        </div>
        {!rules.length && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12.8,
              color: T.dim,
              marginTop: 14,
              lineHeight: 1.7,
            }}
          >
            Review an exception, pick the invoices it settles, and the engine mines a durable rule
            from your decision. Rules generalize — fixing one counterparty alias fixes every wire
            from that counterparty. Then re-run.
          </div>
        )}
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map((r, i) => (
            <div
              key={i}
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                borderLeft: `2px solid #6EE7A8`,
                borderRadius: 8,
                padding: "10px 12px",
                fontFamily: MONO,
                fontSize: 12.8,
                color: T.text,
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: "#6EE7A8", fontSize: 11, letterSpacing: "0.1em" }}>
                {r.type.toUpperCase()}
              </div>
              {r.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { Exceptions };
