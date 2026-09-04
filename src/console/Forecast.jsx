/* Cash forecast view: the balance curve, the day it breaches the floor,
   and the ranked collections that would fix it. */

import { useState, useMemo, useRef, useEffect } from "react";
import { PAYROLL_DEFAULT, buildForecast } from "../engine/forecast.js";
import { fmt } from "../lib/format.js";
import { MONO, T } from "../theme.js";
import { PANEL } from "../ui/styles.js";

function Forecast({ batch, matches, threshold }) {
  const [payrollRate, setPayrollRate] = useState(PAYROLL_DEFAULT);
  const f = useMemo(
    () => buildForecast({ batch, matches, threshold, payrollRate }),
    [batch, matches, threshold, payrollRate]
  );
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(null);
  /* dragging payroll rebuilds f every tick — don't replay the 75-day draw-in */
  const skipDraw = useRef(false);

  useEffect(() => {
    if (skipDraw.current) {
      skipDraw.current = false;
      setCursor(f.days.length);
      return;
    }
    setCursor(0);
    setSel(null);
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setCursor(i);
      if (i >= f.days.length) clearInterval(iv);
    }, 22);
    return () => clearInterval(iv);
  }, [f]);

  if (!matches.length)
    return (
      <div style={{ padding: 40, fontFamily: MONO, fontSize: 13.8, color: T.dim }}>
        Run a reconciliation first — the forecast learns its payment lag from cleared matches.
      </div>
    );

  const W = 940,
    H = 340,
    padL = 70,
    padR = 30,
    padT = 24,
    padB = 46;
  const vals = f.days.map((d) => d.bal);
  const lo = Math.min(...vals, 0) * 1.15;
  const hi = Math.max(...vals) * 1.08;
  const x = (i) => padL + (i / (f.days.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const shown = f.days.slice(0, Math.max(cursor, 1));
  const path = shown.map((d, i) => `${i ? "L" : "M"} ${x(i)} ${y(d.bal)}`).join(" ");

  const ghost = sel ? f.curve({ [sel.inv.id]: f.pullTo }) : null;
  const ghostPath = ghost
    ? ghost.map((d, i) => `${i ? "L" : "M"} ${x(i)} ${y(d.bal)}`).join(" ")
    : null;

  const breachIdx = f.breach ? f.days.findIndex((d) => d.t === f.breach.t) : -1;

  return (
    <div style={{ display: "flex", gap: 14, marginTop: 14, alignItems: "flex-start" }}>
      <div style={{ ...PANEL, flex: 1, minWidth: 0, padding: "24px 20px 20px" }}>
        {/* headline + payroll stress dial */}
        <div
          style={{
            padding: "0 0 18px 50px",
            display: "flex",
            alignItems: "flex-end",
            gap: 26,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 320 }}>
            {f.breach ? (
              <>
                <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.03em" }}>
                  You break the floor on{" "}
                  <span style={{ color: T.bad }}>
                    {new Date(f.breach.t).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 14, color: T.muted, marginTop: 6 }}>
                  Trough {fmt(f.trough.bal)} against a {fmt(f.floor)} floor · payroll{" "}
                  {fmt(f.payroll)} on the 15th
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.03em" }}>
                  Cash holds through the horizon
                </div>
                <div style={{ fontFamily: MONO, fontSize: 14, color: T.muted, marginTop: 6 }}>
                  Trough {fmt(f.trough.bal)} stays above the {fmt(f.floor)} floor · payroll{" "}
                  {fmt(f.payroll)} on the 15th
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 2 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12.2,
                letterSpacing: "0.12em",
                color: T.muted,
              }}
            >
              PAYROLL {fmt(f.payroll)}
            </div>
            <input
              type="range"
              min={0.05}
              max={0.34}
              step={0.005}
              value={payrollRate}
              onChange={(e) => {
                skipDraw.current = true;
                setPayrollRate(+e.target.value);
              }}
              style={{ width: 190 }}
            />
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11.6,
                color: f.breach ? T.bad : T.dim,
              }}
            >
              {f.breach
                ? `breaches ${new Date(f.breach.t).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })} · trough ${fmt(f.trough.bal)}`
                : `holds · trough ${fmt(f.trough.bal)}`}
            </div>
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
          {/* floor */}
          <line
            x1={padL}
            y1={y(f.floor)}
            x2={W - padR}
            y2={y(f.floor)}
            stroke={T.bad}
            strokeWidth={1}
            strokeDasharray="5 4"
            opacity={0.7}
          />
          <text x={padL - 8} y={y(f.floor) + 3} textAnchor="end" fontFamily={MONO} fontSize={11} fill={T.bad}>
            FLOOR
          </text>

          {/* zero */}
          {lo < 0 && (
            <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke={T.line} strokeWidth={1} />
          )}

          {/* outflow ticks */}
          {f.days.map((d, i) =>
            d.outflow > 0 && i < cursor ? (
              <line
                key={i}
                x1={x(i)}
                y1={padT}
                x2={x(i)}
                y2={H - padB}
                stroke={T.line}
                strokeWidth={d.items[0]?.label === "Payroll" ? 1.4 : 0.6}
              />
            ) : null
          )}

          {/* ghost counterfactual */}
          {ghostPath && (
            <path d={ghostPath} fill="none" stroke={T.ok} strokeWidth={1.6} strokeDasharray="4 3" opacity={0.9} />
          )}

          {/* main curve */}
          <path d={path} fill="none" stroke={T.gold} strokeWidth={2} />

          {/* breach marker */}
          {breachIdx >= 0 && cursor > breachIdx && (
            <>
              <circle cx={x(breachIdx)} cy={y(f.days[breachIdx].bal)} r={4.5} fill={T.bad} />
              <circle
                cx={x(breachIdx)}
                cy={y(f.days[breachIdx].bal)}
                r={9}
                fill="none"
                stroke={T.bad}
                strokeWidth={1}
                style={{ animation: "pulse 2s infinite" }}
              />
            </>
          )}

          {/* axis */}
          {f.days.map((d, i) =>
            new Date(d.t).getUTCDate() === 1 || new Date(d.t).getUTCDate() === 15 ? (
              <text
                key={"t" + i}
                x={x(i)}
                y={H - 22}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize={11}
                fill={T.dim}
              >
                {new Date(d.t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </text>
            ) : null
          )}
          {[hi, (hi + lo) / 2, lo].map((v, i) => (
            <text
              key={"y" + i}
              x={padL - 8}
              y={y(v) + 3}
              textAnchor="end"
              fontFamily={MONO}
              fontSize={11}
              fill={T.dim}
            >
              {"$" + Math.round(v / 1000) + "k"}
            </text>
          ))}
        </svg>
      </div>

      {/* drivers */}
      <div style={{ ...PANEL, width: 352, flexShrink: 0, padding: 24 }}>
        <div style={{ fontFamily: MONO, fontSize: 12.2, letterSpacing: "0.14em", color: T.dim }}>
          {f.breach ? "COLLECTIONS THAT FIX IT" : "LARGEST OPEN POSITIONS"}
        </div>

        {f.breach && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12.8,
              color: T.muted,
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            Pull any of these in before{" "}
            {new Date(f.pullTo).toLocaleDateString("en-US", { month: "short", day: "numeric" })} and
            the trough lifts by the amount shown.
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 2 }}>
          {(f.drivers.length
            ? f.drivers
            : f.open
                .slice()
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 6)
                .map((inv) => ({ inv, lift: 0, clears: false }))
          ).map((d, i) => {
            const active = sel?.inv.id === d.inv.id;
            return (
              <button
                key={d.inv.id}
                onClick={() => setSel(active ? null : d)}
                style={{
                  textAlign: "left",
                  background: active ? T.surfaceUp : i % 2 ? "transparent" : T.surface,
                  border: `1px solid ${active ? T.ok : "transparent"}`,
                  borderRadius: 8,
                  padding: "11px 13px",
                  cursor: "pointer",
                  fontFamily: MONO,
                  color: T.text,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span>{d.inv.customer}</span>
                  <span>{fmt(d.inv.amount)}</span>
                </div>
                <div style={{ fontSize: 12.2, color: T.dim, marginTop: 4 }}>
                  {d.inv.ref} · expected{" "}
                  {new Date(d.inv.expected).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {d.inv.learned ? ` · lag ${Math.round(d.inv.lag)}d` : " · lag est."}
                </div>
                {d.lift > 0 && (
                  <div style={{ fontSize: 12.8, color: d.clears ? T.ok : T.gold, marginTop: 6 }}>
                    {d.clears ? "Clears the breach" : "Lifts trough"} +{fmt(d.lift)}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: `1px solid ${T.line}`,
            fontFamily: MONO,
            fontSize: 12.2,
            color: T.dim,
            lineHeight: 1.7,
          }}
        >
          Lag learned from {matches.filter((m) => m.confidence >= threshold).length} cleared matches.
          Blended average {f.globalLag.toFixed(1)}d past due.
        </div>
      </div>
    </div>
  );
}

export { Forecast };
