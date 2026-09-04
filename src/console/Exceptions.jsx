/* The residual, ranked by value at risk.

   Resolving one mines GENERALIZING rules - alias, fee, refnum - each of
   which applies to a class of records. The gap between decisions made and
   records fixed is the number worth saying out loud. */

import { fmt } from "../lib/format.js";
import { MONO, T } from "../theme.js";
import { PANEL } from "../ui/styles.js";

/* ---------- exception wall ---------- */
function Exceptions({ items, onResolve, resolved, rules }) {
  const done = new Set((resolved || []).map((r) => r.bankId));
  return (
    <div style={{ display: "flex", gap: 14, marginTop: 14, alignItems: "flex-start" }}>
      <div style={{ ...PANEL, flex: 1, minWidth: 0, padding: "22px 22px 26px" }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: T.dim }}>
          RANKED BY VALUE AT RISK
        </div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 1 }}>
          {items.length === 0 && (
            <div style={{ color: T.dim, fontFamily: MONO, fontSize: 12 }}>
              Nothing yet. Run a reconciliation.
            </div>
          )}
          {items.map((e, i) => {
            const isDone = done.has(e.id);
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 100px 1fr 90px 92px",
                  gap: 14,
                  padding: "12px 14px",
                  background: isDone ? "rgba(110,231,168,.06)" : i % 2 ? "transparent" : T.surface,
                  borderRadius: 6,
                  alignItems: "center",
                  fontFamily: MONO,
                  fontSize: 11,
                }}
              >
                <span style={{ color: e.kind === "No candidate" ? T.bad : T.gold }}>{e.kind}</span>
                <span style={{ color: T.text }}>{e.id}</span>
                <span style={{ color: T.muted }}>
                  {isDone
                    ? resolved.find((r) => r.bankId === e.id)?.note
                    : e.detail}
                </span>
                <span style={{ color: T.text, textAlign: "right" }}>{fmt(e.amount || 0)}</span>
                {isDone ? (
                  <span style={{ color: "#6EE7A8", fontSize: 10, textAlign: "center" }}>
                    resolved
                  </span>
                ) : (
                  <button
                    onClick={() => onResolve(e.id)}
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      padding: "6px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: "transparent",
                      border: `1px solid ${T.line}`,
                      color: T.text,
                    }}
                  >
                    RESOLVE
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...PANEL, width: 292, flexShrink: 0, padding: 22 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: T.dim }}>
          RULES LEARNED
        </div>
        {!rules.length && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: T.dim,
              marginTop: 14,
              lineHeight: 1.7,
            }}
          >
            Resolve an exception and the engine mines a durable rule from your decision. Rules
            generalize — fixing one counterparty alias fixes every wire from that counterparty.
            Then re-run.
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
                fontSize: 10.5,
                color: T.text,
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: "#6EE7A8", fontSize: 9, letterSpacing: "0.1em" }}>
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
