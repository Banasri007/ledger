/* Ask — grounded question answering over the current reconciliation.

   The design constraint that makes this worth having: an answer and its
   evidence are the same object. Every reply carries the record ids it rests
   on, rendered as chips; clicking one jumps to the graph with that wire pinned
   and traced. You are never asked to take a sentence on faith.

   When the model cannot ground an answer it says so and the reply is marked
   ungrounded rather than dressed up as fact. In a finance tool a confident
   wrong answer costs more than no answer. */

import { useMemo, useRef, useState } from "react";
import { findLeakage } from "../engine/leakage.js";
import { buildAskContext } from "../lib/askContext.js";
import { MONO, SANS, T } from "../theme.js";
import { PANEL } from "../ui/styles.js";

const SUGGESTED = [
  "Which counterparty is costing me the most, and how much?",
  "Why was the largest exception not matched?",
  "What is my total exposure from invoices already past due?",
  "Which matches should I not trust, and why?",
  "Summarise this run for my manager in three sentences.",
];

function Chip({ children, onClick, tone }) {
  return (
    <button
      onClick={onClick}
      className="fx-mag"
      style={{
        fontFamily: MONO,
        fontSize: 11.5,
        padding: "5px 10px",
        borderRadius: 6,
        cursor: "pointer",
        background: tone ? "rgba(212,175,55,.1)" : "rgba(21,21,21,.8)",
        border: `1px solid ${tone ? T.gold : T.line}`,
        color: tone ? T.gold : T.muted,
      }}
    >
      {children}
    </button>
  );
}

function Ask({ batch, matches, stats, threshold, difficulty, seed, onFocus }) {
  const [log, setLog] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const context = useMemo(
    () =>
      buildAskContext({
        batch,
        matches,
        stats,
        threshold,
        difficulty,
        seed,
        leakage: findLeakage({ batch, matches, threshold }),
      }),
    [batch, matches, stats, threshold, difficulty, seed]
  );

  async function send(text) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ("");
    setLog((l) => [...l, { role: "you", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, context }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLog((l) => [...l, { role: "err", text: data.message || data.error || "request failed" }]);
      } else {
        setLog((l) => [
          ...l,
          {
            role: "bot",
            text: data.answer,
            citations: data.citations || [],
            grounded: data.grounded,
            meter: data.meter,
          },
        ]);
      }
    } catch (e) {
      setLog((l) => [...l, { role: "err", text: String(e?.message || e) }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  }

  if (!matches.length)
    return (
      <div style={{ padding: 40, fontFamily: MONO, fontSize: 13, color: T.dim }}>
        Run a reconciliation first — there is nothing to ask about yet.
      </div>
    );

  return (
    <div style={{ ...PANEL, marginTop: 14, display: "flex", flexDirection: "column", height: "clamp(460px, calc(100vh - 300px), 1100px)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "13px 24px",
          borderBottom: `1px solid ${T.line}`,
          fontFamily: MONO,
          fontSize: 11.5,
          letterSpacing: "0.14em",
          color: T.dim,
          flexShrink: 0,
        }}
      >
        <span>ASK THIS RECONCILIATION</span>
        <span style={{ color: T.dim, letterSpacing: "0.06em" }}>
          answers only from this run · every claim cited
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
        {log.length === 0 && (
          <div style={{ color: T.dim, fontFamily: SANS, fontSize: 15, lineHeight: 1.7, maxWidth: 640 }}>
            It can see this run and nothing else — the matches, the exceptions, the open invoices
            and the leakage findings. It cannot see the answer key, so it cannot tell you whether a
            match was <em>right</em>, only what the engine did and why.
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
              {SUGGESTED.map((s) => (
                <Chip key={s} onClick={() => send(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {log.map((m, i) => (
          <div key={i} style={{ marginBottom: 22 }}>
            {m.role === "you" && (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  color: T.gold,
                  paddingLeft: 12,
                  borderLeft: `2px solid ${T.gold}`,
                }}
              >
                {m.text}
              </div>
            )}

            {m.role === "err" && (
              <div style={{ fontFamily: MONO, fontSize: 13, color: T.bad }}>{m.text}</div>
            )}

            {m.role === "bot" && (
              <div>
                {m.grounded === false && (
                  <div
                    style={{
                      display: "inline-block",
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      color: T.bad,
                      border: `1px solid rgba(229,72,77,.4)`,
                      borderRadius: 5,
                      padding: "3px 8px",
                      marginBottom: 9,
                    }}
                  >
                    NOT GROUNDED — the data does not settle this
                  </div>
                )}
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 15.5,
                    lineHeight: 1.7,
                    color: T.text,
                    maxWidth: 760,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.text}
                </div>
                {m.citations?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 9.5,
                        letterSpacing: "0.16em",
                        color: T.dim,
                        marginBottom: 7,
                      }}
                    >
                      EVIDENCE — CLICK TO SEE IT ON THE GRAPH
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {m.citations.map((c) => (
                        <Chip key={c} tone onClick={() => onFocus?.(c)}>
                          {c}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
                {m.meter && (
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.dim, marginTop: 10 }}>
                    {m.meter.provider} · {m.meter.model} · {(m.meter.ms / 1000).toFixed(1)}s ·{" "}
                    {m.meter.inputTokens} in / {m.meter.outputTokens} out
                    {m.meter.droppedCitations > 0 && (
                      <span style={{ color: T.bad }}>
                        {" "}
                        · {m.meter.droppedCitations} invented citation
                        {m.meter.droppedCitations === 1 ? "" : "s"} dropped
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ fontFamily: MONO, fontSize: 13, color: T.dim }}>
            <span className="fx-live" style={{ marginRight: 8 }} />
            reading the reconciliation…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "14px 24px",
          borderTop: `1px solid ${T.line}`,
          flexShrink: 0,
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about this batch — amounts, counterparties, why something failed…"
          style={{
            flex: 1,
            fontFamily: MONO,
            fontSize: 14,
            padding: "12px 14px",
            borderRadius: 8,
            background: "rgba(21,21,21,.8)",
            border: `1px solid ${T.line}`,
            color: T.text,
            outline: "none",
          }}
        />
        <button
          onClick={() => send()}
          disabled={busy || !q.trim()}
          className="fx-mag"
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            letterSpacing: "0.1em",
            padding: "11px 22px",
            borderRadius: 8,
            cursor: "pointer",
            color: "#0B0B0B",
            background: `linear-gradient(180deg, ${T.goldHi}, ${T.goldLo})`,
            border: "none",
            fontWeight: 700,
            opacity: busy || !q.trim() ? 0.45 : 1,
          }}
        >
          ASK
        </button>
      </div>
    </div>
  );
}

export { Ask };
