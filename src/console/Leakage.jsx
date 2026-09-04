/* Leakage — what the reconciliation found that costs money.

   Matching answers "does this tie out". This answers "what is it costing you
   that it does not". Two totals, because they are different kinds of number:
   recoverable is money someone owes you and you can go and ask for; exposure
   is money at risk that nobody has done anything wrong to cause yet.

   Every finding lists the records it came from. A number in a finance tool
   that you cannot drill into is a number nobody will act on. */

import { useMemo, useState } from "react";
import { findLeakage } from "../engine/leakage.js";
import { fmt } from "../lib/format.js";
import { MONO, T } from "../theme.js";
import { GlowCard } from "../ui/primitives.jsx";
import { PANEL } from "../ui/styles.js";

const TONE = {
  "short-pay": { color: T.bad, label: "SHORT PAID" },
  "fee-overcharge": { color: T.gold, label: "FEE" },
  duplicate: { color: "#C77C0B", label: "DUPLICATE" },
  unattributed: { color: T.bad, label: "UNATTRIBUTED" },
  aged: { color: T.llm, label: "AGED" },
};

function Total({ label, value, sub, color }) {
  return (
    <GlowCard
      className="fx-lift"
      style={{
        flex: 1,
        minWidth: 240,
        padding: "20px 24px 18px",
        background: "rgba(14,14,14,.82)",
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: T.dim }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: "-0.045em",
          marginTop: 10,
          lineHeight: 1,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmt(value)}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11.5, color: T.muted, marginTop: 9, lineHeight: 1.5 }}>
        {sub}
      </div>
    </GlowCard>
  );
}

function Leakage({ batch, matches, threshold, contractedRate = 0.02 }) {
  const [open, setOpen] = useState(null);
  const res = useMemo(
    () => findLeakage({ batch, matches, threshold, contractedRate }),
    [batch, matches, threshold, contractedRate]
  );

  if (!matches.length)
    return (
      <div style={{ padding: 40, fontFamily: MONO, fontSize: 13, color: T.dim }}>
        Run a reconciliation first — leakage is read off the matches it produces.
      </div>
    );

  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Total
          label="RECOVERABLE"
          value={res.recoverable}
          color={T.gold}
          sub="Short payments, deductions above your contracted rate, and duplicates. Money someone owes you that you can go and ask for."
        />
        <Total
          label="EXPOSURE"
          value={res.exposure}
          color={T.bad}
          sub="Cash received you cannot attribute, plus receivables already past due. Nothing has gone wrong yet — this is what is at risk."
        />
      </div>

      <div style={{ ...PANEL, padding: "22px 22px 26px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: MONO,
            fontSize: 12,
            letterSpacing: "0.14em",
            color: T.dim,
          }}
        >
          <span>FINDINGS · RANKED BY VALUE</span>
          <span>CONTRACTED FEE {(contractedRate * 100).toFixed(2)}%</span>
        </div>

        {res.findings.length === 0 && (
          <div style={{ fontFamily: MONO, fontSize: 13.5, color: T.dim, marginTop: 18 }}>
            Nothing found. Every settlement tied out, nothing was short-paid, and no receivable
            is past due — at this noise level that is the correct answer, not a broken check.
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {res.findings.map((f, i) => {
            const tone = TONE[f.kind] || { color: T.muted, label: f.kind.toUpperCase() };
            const isOpen = open === i;
            return (
              <div
                key={i}
                style={{
                  border: `1px solid ${isOpen ? tone.color : T.line}`,
                  borderLeft: `3px solid ${tone.color}`,
                  borderRadius: 10,
                  background: isOpen ? "rgba(21,21,21,.8)" : T.surface,
                  overflow: "hidden",
                  transition: "border-color .25s",
                }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="fx-mag"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "116px 1fr 130px 26px",
                    gap: 16,
                    alignItems: "center",
                    width: "100%",
                    textAlign: "left",
                    padding: "15px 18px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: MONO,
                  }}
                >
                  <span style={{ color: tone.color, fontSize: 10, letterSpacing: "0.14em" }}>
                    {tone.label}
                  </span>
                  <span style={{ color: T.text, fontSize: 13.5 }}>{f.title}</span>
                  <span
                    style={{
                      color: tone.color,
                      fontSize: 16,
                      fontWeight: 700,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(f.amount)}
                  </span>
                  <span style={{ color: T.dim, textAlign: "right", fontSize: 12 }}>
                    {isOpen ? "−" : "+"}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding: "0 18px 16px 18px" }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.65,
                        color: T.muted,
                        maxWidth: 760,
                        marginBottom: 12,
                      }}
                    >
                      {f.detail}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        color: T.dim,
                        marginBottom: 8,
                      }}
                    >
                      DERIVED FROM {f.ids.length} RECORD{f.ids.length === 1 ? "" : "S"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {f.ids.map((id) => (
                        <span
                          key={id}
                          style={{
                            fontFamily: MONO,
                            fontSize: 11.5,
                            padding: "4px 9px",
                            borderRadius: 5,
                            background: T.surfaceUp,
                            border: `1px solid ${T.line}`,
                            color: T.muted,
                          }}
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { Leakage };
