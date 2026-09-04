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
import { Leakage } from "./Leakage.jsx";
import { generateBatch } from "../engine/generate.js";
import {
  mineRules,
  rankCandidates,
  scoreMatch,
  tierExact,
  tierFuzzy,
  tierLLM,
  tierLearned,
} from "../engine/match.js";
import { pct } from "../lib/format.js";
import { MONO, SANS, T } from "../theme.js";
import { Control, Metric } from "../ui/primitives.jsx";
import { DIFF_HINT, SHELL_WIDE, btn } from "../ui/styles.js";
import { usePointerVars } from "../lib/motion.js";
import { GlobalFX } from "../ui/effects.jsx";
import { GlowCard } from "../ui/primitives.jsx";
import { batchFromCsv, bankCsv, ledgerCsv } from "../lib/csv.js";
import { downloadAuditPack } from "../lib/auditPack.js";
import { findLeakage } from "../engine/leakage.js";
import { loadHistory, recordRun } from "../lib/history.js";

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
  const [meter, setMeter] = useState(null);
  const [upload, setUpload] = useState(null);
  const [csvErr, setCsvErr] = useState(null);
  const [durable, setDurable] = useState(false);

  const batch = useMemo(
    () => upload || generateBatch({ difficulty, nInvoices: 60, seed }),
    [difficulty, seed, upload]
  );

  /* Uploaded data carries no answer key, so precision is not merely unknown -
     it is uncomputable. Everything that scores against truth switches off
     rather than reporting a number that means nothing. */
  const graded = batch.truth.length > 0;
  const histKey = upload ? "csv" : `n${difficulty}-s${seed}`;

  async function loadCsv(files) {
    setCsvErr(null);
    try {
      const byName = {};
      for (const f of files) byName[/ledger|invoice|ar\b/i.test(f.name) ? "ledger" : "bank"] = f;
      if (!byName.bank || !byName.ledger)
        throw new Error("pick two files — one bank/statement CSV and one ledger/invoice CSV");
      const [b, l] = await Promise.all([byName.bank.text(), byName.ledger.text()]);
      setUpload(batchFromCsv(b, l));
    } catch (e) {
      setCsvErr(String(e?.message || e));
    }
  }

  function downloadSample() {
    const gen = generateBatch({ difficulty, nInvoices: 60, seed });
    for (const [name, text] of [
      ["ledger-bank-sample.csv", bankCsv(gen.bank)],
      ["ledger-invoices-sample.csv", ledgerCsv(gen.ledger)],
    ]) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  const reset = useCallback(() => {
    setMatches([]);
    setPass(0);
    setRules([]);
    setRuns([]);
    setResolved([]);
    setMeter(null);
  }, []);
  useEffect(reset, [difficulty, seed, reset]);

  useEffect(() => {
    let live = true;
    loadHistory(histKey).then(({ history, durable: d }) => {
      if (!live) return;
      setRuns(history);
      setDurable(d);
    });
    return () => {
      live = false;
    };
  }, [histKey]);

  async function run() {
    setRunning(true);
    setMatches([]);
    const acc = [];
    const cfg = { truth: batch.truth, seed, rules, onMeter: setMeter };
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
        /* The per-match pause exists purely so you can watch the passes land.
           It has to be skipped outright when the tab is hidden, not merely set
           to zero: Chrome clamps CHAINED timers to ~1s in a background tab
           whatever delay you ask for, so a 60-record batch took a minute with
           setTimeout(0). Yield on a microtask instead - no timer, no clamp. */
        if (document.hidden) {
          await Promise.resolve();
        } else {
          await new Promise((r) => setTimeout(r, i === 3 ? 90 : i === 2 ? 32 : 22));
        }
      }
      if (res.length && !document.hidden) await new Promise((r) => setTimeout(r, 320));
    }
    setPass(9);
    setRunning(false);

    const cl = acc.filter((m) => m.confidence >= threshold);
    const corr = cl.filter((m) => scoreMatch(m, batch.truth)).length;
    const entry = {
      rate: batch.bank.length ? cl.length / batch.bank.length : 0,
      precision: graded && cl.length ? corr / cl.length : null,
      rules: rules.length,
      graded,
    };
    setRuns((r) => [...r, entry]);
    recordRun(histKey, entry).then(({ history, durable: d }) => {
      setRuns(history);
      setDurable(d);
    });
  }

  /* An analyst decision. invoiceIds comes from the reviewer's own choice in
     the exception queue. This used to read batch.truth - which is not review,
     it is looking at the answer key, and it did nothing at all on uploaded
     data where no answer key exists. */
  function resolveException(bankId, invoiceIds) {
    const b = batch.bank.find((x) => x.id === bankId);
    if (!b) return;

    const invs = (invoiceIds || [])
      .map((id) => batch.ledger.find((l) => l.id === id))
      .filter(Boolean);

    if (!invs.length) {
      setResolved((r) => [...r, { bankId, note: "Confirmed as a genuine orphan — no invoice." }]);
      return;
    }
    const mined = mineRules(b, invs);
    setResolved((r) => [
      ...r,
      { bankId, note: `Matched to ${invs.map((i) => i.id).join(", ")}`, mined: mined.length },
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
    const gradable = batch.truth.length > 0;
    const correct = gradable ? cleared.filter((m) => scoreMatch(m, batch.truth)).length : 0;
    const falsePos = gradable ? cleared.length - correct : 0;
    const matchedB = new Set(matches.map((m) => m.bankId));
    const unresolvedBank = batch.bank.filter((b) => !matchedB.has(b.id));
    const claimed = new Set(cleared.flatMap((m) => m.invoiceIds));
    const openInv = batch.ledger.filter((l) => !claimed.has(l.id));
    return {
      cleared: cleared.length,
      escalated: escalated.length,
      correct,
      falsePos,
      graded: gradable,
      precision: gradable && cleared.length ? correct / cleared.length : 0,
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
            {["graph", "confidence", "forecast", "leakage", "exceptions"].map((v) => (
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
          <Control
            label={upload ? "NOISE LEVEL —" : `NOISE LEVEL ${difficulty}`}
            hint={upload ? "uploaded data, not generated" : DIFF_HINT[difficulty]}
          >
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={difficulty}
              disabled={running || !!upload}
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
            {upload ? (
              <button
                onClick={() => setUpload(null)}
                disabled={running}
                className="fx-mag"
                style={btn(false)}
              >
                Back to generated
              </button>
            ) : (
              <button
                onClick={() => setSeed((s) => s + 1)}
                disabled={running}
                className="fx-mag"
                style={btn(false)}
              >
                New batch
              </button>
            )}
            <button
              onClick={() =>
                downloadAuditPack({
                  batch,
                  matches,
                  stats,
                  threshold,
                  difficulty,
                  seed,
                  rules,
                  resolved,
                  meter,
                  leakage: findLeakage({ batch, matches, threshold }),
                })
              }
              disabled={running || !matches.length}
              className="fx-mag"
              style={{ ...btn(false), opacity: matches.length ? 1 : 0.45 }}
              title={matches.length ? "Download the audit pack" : "Run a reconciliation first"}
            >
              Audit pack
            </button>
            <label className="fx-mag" style={{ ...btn(false), display: "inline-block" }}>
              Load CSV
              <input
                type="file"
                accept=".csv,text/csv"
                multiple
                disabled={running}
                onChange={(e) => loadCsv([...e.target.files])}
                style={{ display: "none" }}
              />
            </label>
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
          {stats.graded ? (
            <Metric
              label="PRECISION"
              num={stats.precision * 100}
              decimals={1}
              suffix="%"
              sub={`${stats.falsePos} false match${stats.falsePos === 1 ? "" : "es"}`}
              series={runs.filter((r) => typeof r.precision === "number").map((r) => r.precision)}
              tone={stats.falsePos > 0 ? T.bad : T.ok}
            />
          ) : (
            <Metric label="PRECISION" value="—" sub="no answer key to score against" tone={T.dim} />
          )}
          <Metric label="ESCALATED" num={stats.escalated} sub="below threshold" />
          <Metric
            label="NO CANDIDATE"
            num={stats.unresolvedBank.length}
            sub="unmatched wires"
            tone={T.bad}
          />
          <Metric label="OPEN AR" num={stats.openInv.length} sub="invoices uncleared" />
        </div>

        {csvErr && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 18px",
              borderRadius: 12,
              border: `1px solid rgba(229,72,77,.4)`,
              background: "rgba(229,72,77,.07)",
              fontFamily: MONO,
              fontSize: 12.5,
              color: T.bad,
            }}
          >
            CSV: {csvErr}{" "}
            <span style={{ color: T.muted }}>
              — expected columns: bank id, date, amount, ref, counterparty · ledger id, ref,
              customer, amount, issueDate, dueDate. Use “Sample CSV” for the exact shape.
            </span>
          </div>
        )}

        {!graded && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              marginTop: 12,
              padding: "13px 20px",
              borderRadius: 12,
              border: `1px solid rgba(212,175,55,.34)`,
              background: "rgba(212,175,55,.06)",
              fontFamily: MONO,
              fontSize: 12.5,
            }}
          >
            <span style={{ color: T.gold, letterSpacing: "0.14em", fontSize: 10.5 }}>UNGRADED</span>
            <span style={{ color: T.muted }}>
              Uploaded data has no answer key, so precision cannot be computed — only match rate is
              meaningful here. Generated batches plant ground truth, which is what makes accuracy
              measurable rather than asserted.
            </span>
            <button onClick={downloadSample} className="fx-mag" style={btn(false)}>
              Sample CSV
            </button>
          </div>
        )}

        {meter && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              padding: "13px 20px",
              marginTop: 12,
              borderRadius: 12,
              border: `1px solid ${
                meter.source === "live" ? "rgba(79,209,197,.32)" : T.line
              }`,
              background:
                meter.source === "live" ? "rgba(79,209,197,.055)" : "rgba(14,14,14,.7)",
              fontFamily: MONO,
              fontSize: 12.5,
            }}
          >
            <span
              style={{
                color: meter.source === "live" ? T.llm : T.dim,
                letterSpacing: "0.14em",
                fontSize: 10.5,
              }}
            >
              TIER 3 · {meter.source === "live" ? "LIVE" : "STUB"}
              {meter.source === "live" && meter.provider ? ` · ${meter.provider.toUpperCase()}` : ""}
            </span>

            {meter.source === "live" ? (
              <>
                <span style={{ color: T.muted }}>{meter.model}</span>
                <span style={{ color: T.dim }}>
                  saw <span style={{ color: T.text }}>{meter.wires}</span> of{" "}
                  <span style={{ color: T.text }}>{batch.bank.length}</span> wires
                </span>
                <span style={{ color: T.dim }}>
                  <span style={{ color: T.text }}>{(meter.ms / 1000).toFixed(1)}s</span>
                </span>
                <span style={{ color: T.dim }}>
                  {meter.inputTokens.toLocaleString()} in /{" "}
                  {meter.outputTokens.toLocaleString()} out
                </span>
                {typeof meter.costUsd === "number" ? (
                  <span style={{ color: T.ok, fontWeight: 700 }}>
                    ${meter.costUsd.toFixed(4)}
                  </span>
                ) : (
                  <span style={{ color: T.dim }} title="set LEDGER_PRICE_IN / LEDGER_PRICE_OUT">
                    cost n/a
                  </span>
                )}
                {meter.invented > 0 && (
                  <span style={{ color: T.bad }}>
                    {meter.invented} invented id{meter.invented === 1 ? "" : "s"} dropped
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: T.muted }}>
                {meter.reason === "no_key"
                  ? "No ANTHROPIC_API_KEY on the server — deterministic fallback in use."
                  : meter.reason === "live_disabled"
                  ? "Live tier disabled — deterministic fallback in use."
                  : meter.reason === "unreachable"
                  ? "Could not reach the server — deterministic fallback in use."
                  : meter.message ||
                    `The reasoning tier could not run (${meter.reason}) — deterministic fallback in use.`}
              </span>
            )}
          </div>
        )}

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
            <span style={{ color: T.dim, marginLeft: "auto", fontSize: 10.5, letterSpacing: "0.12em" }}>
              {runs.length} RUN{runs.length === 1 ? "" : "S"} KEPT ·{" "}
              {durable ? "SERVER" : "THIS BROWSER"}
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
        {view === "leakage" && (
          <Leakage batch={batch} matches={matches} threshold={threshold} />
        )}
        {view === "exceptions" && (
          <Exceptions
            items={stats.exceptions}
            onResolve={resolveException}
            resolved={resolved}
            rules={rules}
            wireFor={(id) => batch.bank.find((b) => b.id === id)}
            candidatesFor={(id) => {
              const b = batch.bank.find((x) => x.id === id);
              return b ? rankCandidates(b, stats.openInv) : [];
            }}
          />
        )}
      </div>
    </div>
  );
}

export { Console };
