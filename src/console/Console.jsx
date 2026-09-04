/* The console: runs the tier pipeline, computes the metrics, routes the
   four views.

   The threshold is applied at DISPLAY time, not match time, so dragging
   the slider recomputes every metric live without re-running anything.

   Match rate and precision are reported separately on purpose. A system
   matching 70% with zero false positives beats one matching 95% with 4%
   wrong, because the second forces a human to re-check everything. */

import { useState, useMemo, useEffect, useCallback } from "react";
import { Confidence } from "./Confidence.jsx";
import { Exceptions } from "./Exceptions.jsx";
import { Forecast } from "./Forecast.jsx";
import { Graph } from "./Graph.jsx";
import { generateBatch } from "../engine/generate.js";
import { mineRules, scoreMatch, tierExact, tierFuzzy, tierLLM, tierLearned } from "../engine/match.js";
import { pct } from "../lib/format.js";
import { MONO, SANS, T } from "../theme.js";
import { Control, Metric } from "../ui/primitives.jsx";
import { DIFF_HINT, SHELL_WIDE, btn } from "../ui/styles.js";
import { usePointerVars } from "../lib/motion.js";
import { GlobalFX } from "../ui/effects.jsx";
import { GlowCard } from "../ui/primitives.jsx";

/* A thin marquee of the run's own numbers under the header. It is the one
   piece of chrome that says "this thing is live" while a pass is streaming. */
function Tape({ items }) {
  const row = items.concat(items);
  return (
    <div style={{ overflow: "hidden", whiteSpace: "nowrap", borderBottom: `1px solid ${T.line}`,
      background: "rgba(10,10,10,.7)" }}>
      <div style={{ display: "inline-flex", gap: 30, padding: "7px 0", willChange: "transform",
        animation: "tapeL 42s linear infinite" }}>
        {row.map(([k, v, c], i) => (
          <span key={i} style={{ fontFamily: MONO, fontSize: 11.6, letterSpacing: "0.14em",
            display: "inline-flex", gap: 8 }}>
            <span style={{ color: T.dim }}>{k}</span>
            <span style={{ color: c || T.muted }}>{v}</span>
            <span style={{ color: "rgba(212,175,55,.35)" }}>/</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Console({ onBack }) {
  usePointerVars();
  const [difficulty, setDifficulty] = useState(3);
  const [threshold, setThreshold] = useState(0.7);
  const [seed, setSeed] = useState(42);
  const [running, setRunning] = useState(false);
  const [pass, setPass] = useState(0);
  const [matches, setMatches] = useState([]);
  const [hover, setHover] = useState(null);
  const [view, setView] = useState("graph");
  const [rules, setRules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [resolved, setResolved] = useState([]);

  const batch = useMemo(
    () => generateBatch({ difficulty, nInvoices: 60, seed }),
    [difficulty, seed]
  );

  const reset = useCallback(() => {
    setMatches([]);
    setPass(0);
    setRules([]);
    setRuns([]);
    setResolved([]);
  }, []);
  useEffect(reset, [difficulty, seed, reset]);

  async function run() {
    setRunning(true);
    setMatches([]);
    const acc = [];
    const cfg = { truth: batch.truth, seed, rules };
    const tiers = [tierLearned, tierExact, tierFuzzy, tierLLM];

    for (const [i, fn] of tiers.entries()) {
      setPass(i);
      const claimed = new Set(acc.flatMap((m) => m.invoiceIds));
      const takenB = new Set(acc.map((m) => m.bankId));
      const res = await fn(
        batch.bank.filter((b) => !takenB.has(b.id)),
        batch.ledger.filter((l) => !claimed.has(l.id)),
        cfg
      );
      for (const m of res) {
        acc.push(m);
        setMatches([...acc]);
        await new Promise((r) => setTimeout(r, i === 3 ? 90 : i === 2 ? 32 : 22));
      }
      if (res.length) await new Promise((r) => setTimeout(r, 320));
    }
    setPass(9);
    setRunning(false);

    const cl = acc.filter((m) => m.confidence >= threshold);
    const corr = cl.filter((m) => scoreMatch(m, batch.truth)).length;
    setRuns((r) => [
      ...r,
      {
        rate: batch.bank.length ? cl.length / batch.bank.length : 0,
        precision: cl.length ? corr / cl.length : 0,
        rules: rules.length,
      },
    ]);
  }

  /* analyst resolves an exception -> mine generalizing rules */
  function resolveException(bankId) {
    const b = batch.bank.find((x) => x.id === bankId);
    const t = batch.truth.find((x) => x.bankId === bankId);
    if (!b) return;
    if (!t) {
      setResolved((r) => [...r, { bankId, note: "Confirmed as a genuine orphan — no invoice." }]);
      return;
    }
    const invs = t.invoiceIds.map((id) => batch.ledger.find((l) => l.id === id)).filter(Boolean);
    const mined = mineRules(b, invs);
    setResolved((r) => [
      ...r,
      { bankId, note: `Matched to ${t.invoiceIds.join(", ")}`, mined: mined.length },
    ]);
    setRules((prev) => {
      const key = (x) => x.type + (x.from || "") + (x.customer || "");
      const have = new Set(prev.map(key));
      return [...prev, ...mined.filter((m) => !have.has(key(m)))];
    });
  }

  /* ---------- metrics ---------- */
  const stats = useMemo(() => {
    const cleared = matches.filter((m) => m.confidence >= threshold);
    const escalated = matches.filter((m) => m.confidence < threshold);
    const correct = cleared.filter((m) => scoreMatch(m, batch.truth)).length;
    const falsePos = cleared.length - correct;
    const matchedB = new Set(matches.map((m) => m.bankId));
    const unresolvedBank = batch.bank.filter((b) => !matchedB.has(b.id));
    const claimed = new Set(cleared.flatMap((m) => m.invoiceIds));
    const openInv = batch.ledger.filter((l) => !claimed.has(l.id));
    return {
      cleared: cleared.length,
      escalated: escalated.length,
      correct,
      falsePos,
      precision: cleared.length ? correct / cleared.length : 0,
      rate: batch.bank.length ? cleared.length / batch.bank.length : 0,
      unresolvedBank,
      openInv,
      exceptions: [
        ...escalated.map((m) => ({
          kind: "Low confidence",
          id: m.bankId,
          detail: m.reason,
          conf: m.confidence,
          amount: batch.bank.find((b) => b.id === m.bankId)?.amount,
        })),
        ...unresolvedBank.map((b) => ({
          kind: "No candidate",
          id: b.id,
          detail: `${b.ref} · ${b.counterparty} — nothing in the ledger fits.`,
          conf: 0,
          amount: b.amount,
        })),
      ].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    };
  }, [matches, threshold, batch]);

  return (
    <div
      style={{
        background: T.bg,
        color: T.text,
        fontFamily: SANS,
        minHeight: "100vh",
        backgroundImage:
          "linear-gradient(rgba(212,175,55,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.055) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        position: "relative",
      }}
    >
      <GlobalFX />
      <div className="fx-spot-console" />

      {/* header */}
      <div
        style={{
          borderBottom: `1px solid ${T.line}`,
          background: "rgba(5,5,5,.88)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ ...SHELL_WIDE, display: "flex", alignItems: "center", gap: 26, height: 84 }}>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontWeight: 800,
              fontSize: 27,
              letterSpacing: "-0.03em",
              color: T.text,
              fontFamily: SANS,
            }}
          >
            Ledger
            <span
              style={{
                background: `linear-gradient(90deg, ${T.goldHi}, ${T.goldLo})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              .
            </span>
          </button>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12.5,
              color: T.dim,
              letterSpacing: "0.16em",
              paddingTop: 2,
              whiteSpace: "nowrap",
            }}
          >
            RECONCILIATION ENGINE
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 11px",
              borderRadius: 999,
              border: `1px solid ${running ? "rgba(212,175,55,.4)" : T.line}`,
              background: running ? "rgba(212,175,55,.08)" : "transparent",
              fontFamily: MONO,
              fontSize: 12,
              letterSpacing: "0.16em",
              color: running ? T.gold : T.dim,
              transition: "all .35s",
            }}
          >
            <span className="fx-live" style={{ background: running ? T.gold : T.ok }} />
            {running ? `PASS ${Math.min(pass + 1, 4)}/4` : pass === 9 ? "SETTLED" : "IDLE"}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 4 }}>
            {["graph", "confidence", "forecast", "exceptions"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: view === v ? "rgba(212,175,55,.1)" : "transparent",
                  border: `1px solid ${view === v ? "rgba(212,175,55,.45)" : "transparent"}`,
                  boxShadow: view === v ? "0 0 22px rgba(212,175,55,.18)" : "none",
                  transition: "all .28s",
                  borderRadius: 7,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 15,
                  letterSpacing: "0.09em",
                  padding: "11px 20px",
                  color: view === v ? T.gold : T.dim,
                }}
                className="fx-mag"
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Tape
        items={[
          ["SEED", seed],
          ["NOISE", difficulty],
          ["BANK", batch.bank.length],
          ["LEDGER", batch.ledger.length],
          ["TIER 1", matches.filter((m) => m.tier === 1).length, T.exact],
          ["TIER 2", matches.filter((m) => m.tier === 2).length, T.fuzzy],
          ["TIER 3", matches.filter((m) => m.tier === 3).length, T.llm],
          ["LEARNED", matches.filter((m) => m.tier === 0).length, "#6EE7A8"],
          ["RULES", rules.length, rules.length ? "#6EE7A8" : T.muted],
          ["CLEARED", stats.cleared, T.gold],
          ["WRONG", stats.falsePos, stats.falsePos ? T.bad : T.ok],
          ["OPEN AR", stats.openInv.length],
        ]}
      />

      <div style={SHELL_WIDE}>
        {/* control bar */}
        <GlowCard
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 34,
            padding: "22px 24px",
            marginTop: 22,
            background: "rgba(14,14,14,.82)",
            border: `1px solid ${T.line}`,
            borderRadius: 14,
            flexWrap: "wrap",
            backdropFilter: "blur(6px)",
          }}
        >
          <Control label={`NOISE LEVEL ${difficulty}`} hint={DIFF_HINT[difficulty]}>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={difficulty}
              disabled={running}
              onChange={(e) => setDifficulty(+e.target.value)}
              style={{ width: 150 }}
            />
          </Control>

          <Control
            label={`AUTO-CLEAR AT ${threshold.toFixed(2)}`}
            hint={`${stats.cleared} cleared · ${stats.falsePos} wrong`}
          >
            <input
              type="range"
              min={0.4}
              max={0.99}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(+e.target.value)}
              style={{ width: 170 }}
            />
          </Control>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setSeed((s) => s + 1)}
              disabled={running}
              className="fx-mag"
              style={btn(false)}
            >
              New batch
            </button>
            <button onClick={run} disabled={running} className="fx-mag" style={btn(true)}>
              {running
                ? `Pass ${Math.min(pass + 1, 4)} of 4…`
                : runs.length
                ? `Re-run with ${rules.length} rule${rules.length === 1 ? "" : "s"}`
                : "Reconcile"}
            </button>
          </div>
        </GlowCard>

        {/* metrics */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
            gap: 12,
            marginTop: 14,
          }}
        >
          <Metric
            label="MATCH RATE"
            num={stats.rate * 100}
            decimals={1}
            suffix="%"
            sub={`${stats.cleared} of ${batch.bank.length} wires cleared`}
            series={runs.map((r) => r.rate)}
            big
          />
          <Metric
            label="PRECISION"
            num={stats.precision * 100}
            decimals={1}
            suffix="%"
            sub={`${stats.falsePos} false match${stats.falsePos === 1 ? "" : "es"}`}
            series={runs.map((r) => r.precision)}
            tone={stats.falsePos > 0 ? T.bad : T.ok}
          />
          <Metric label="ESCALATED" num={stats.escalated} sub="below threshold" />
          <Metric
            label="NO CANDIDATE"
            num={stats.unresolvedBank.length}
            sub="unmatched wires"
            tone={T.bad}
          />
          <Metric label="OPEN AR" num={stats.openInv.length} sub="invoices uncleared" />
        </div>

        {runs.length >= 2 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              padding: "14px 20px",
              marginTop: 12,
              borderRadius: 12,
              border: `1px solid rgba(110,231,168,.28)`,
              background: "rgba(110,231,168,.06)",
              fontFamily: MONO,
              fontSize: 13.8,
            }}
          >
            <span style={{ color: "#6EE7A8", letterSpacing: "0.14em", fontSize: 11.6 }}>LEARNED</span>
            <span style={{ color: T.muted }}>
              Run {runs.length - 1} {pct(runs[runs.length - 2].rate)} → Run {runs.length}{" "}
              <span style={{ color: T.text, fontWeight: 700, fontSize: 16.1 }}>
                {pct(runs[runs.length - 1].rate)}
              </span>
            </span>
            <span style={{ color: T.dim }}>
              after {resolved.length} analyst decision{resolved.length === 1 ? "" : "s"} →{" "}
              {rules.length} rule{rules.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {view === "graph" && (
          <Graph
            key={`${difficulty}:${seed}`}
            batch={batch}
            matches={matches}
            threshold={threshold}
            hover={hover}
            setHover={setHover}
            pass={pass}
            difficulty={difficulty}
          />
        )}
        {view === "confidence" && (
          <Confidence matches={matches} threshold={threshold} truth={batch.truth} />
        )}
        {view === "forecast" && (
          <Forecast batch={batch} matches={matches} threshold={threshold} />
        )}
        {view === "exceptions" && (
          <Exceptions
            items={stats.exceptions}
            onResolve={resolveException}
            resolved={resolved}
            rules={rules}
          />
        )}
      </div>
    </div>
  );
}

export { Console };
