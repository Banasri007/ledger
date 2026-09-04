/* Seven full-viewport scroll-snap sections.

   The scroll root is the container, not the body, and the
   IntersectionObserver in Snap uses it as its root.

   There is deliberately no "limitations" section here. That belongs in
   the README. A landing page sells; a README documents. */

import { useState, useRef, useEffect } from "react";
import { Backdrop } from "./backdrops.jsx";
import { Body, Eyebrow, H2 } from "./typography.jsx";
import { MONO, SANS, T } from "../theme.js";
import { PANEL, SHELL, btn } from "../ui/styles.js";

/* ---------- full-height snap section ---------- */
function Snap({ index, setActive, root, children, align = "center" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setActive(index),
      { threshold: 0.55, root: root.current || null }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [index, setActive, root]);
  return (
    <section
      ref={ref}
      style={{
        minHeight: "100vh",
        scrollSnapAlign: "start",
        display: "flex",
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
        position: "relative",
        zIndex: 1,
      }}
    >
      <div style={{ ...SHELL, padding: "96px 28px 72px", width: "100%" }}>{children}</div>
    </section>
  );
}

function Landing({ onLaunch }) {
  const [active, setActive] = useState(0);
  const root = useRef(null);

  return (
    <div
      ref={root}
      style={{
        height: "100vh",
        overflowY: "auto",
        scrollSnapType: "y mandatory",
        background: T.bg,
        color: T.text,
        fontFamily: SANS,
        position: "relative",
      }}
    >
      <style>{`
        @keyframes edgeIn { from { stroke-dashoffset:1; opacity:0 } to { stroke-dashoffset:0; opacity:1 } }
        @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:.7} }
        @keyframes drift { from { transform: translateY(0) } to { transform: translateY(-50%) } }
        @keyframes sweep { 0%,100% { transform: translateX(240px) } 50% { transform: translateX(620px) } }
        @keyframes draw { 0% { stroke-dashoffset:2400 } 55%,100% { stroke-dashoffset:0 } }
        @keyframes resolve { 0% { opacity:0; stroke-dashoffset:600 } 25% { opacity:.55 } 70% { opacity:.55; stroke-dashoffset:0 } 100% { opacity:0; stroke-dashoffset:0 } }
        @media (prefers-reduced-motion: reduce){ *{ animation:none !important; transition:none !important } }
      `}</style>

      <Backdrop active={active} />

      {/* nav */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          borderBottom: `1px solid ${T.line}`,
          background: "rgba(5,5,5,.7)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div style={{ ...SHELL, display: "flex", alignItems: "center", height: 64, gap: 26 }}>
          <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.03em" }}>
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
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {["Reconcile", "Measure", "Cash", "Learn"].map((label, i) => (
              <div
                key={label}
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: active === i + 2 ? T.gold : T.dim,
                  padding: "6px 8px",
                  transition: "color .4s",
                }}
              >
                {label.toUpperCase()}
              </div>
            ))}
            <button onClick={onLaunch} style={{ ...btn(true), padding: "10px 18px", marginLeft: 12 }}>
              Open the console
            </button>
          </div>
        </div>
      </div>

      {/* 0 — hero */}
      <Snap index={0} setActive={setActive} root={root}>
        <div style={{ textAlign: "center" }}>
          <Eyebrow>RECONCILIATION · FORECASTING · EXCEPTIONS</Eyebrow>
          <h1
            style={{
              fontSize: "clamp(48px, 8.4vw, 116px)",
              fontWeight: 800,
              letterSpacing: "-0.055em",
              lineHeight: 0.95,
              margin: 0,
            }}
          >
            Close the books.
            <br />
            <span
              style={{
                background: `linear-gradient(96deg, ${T.goldHi} 6%, ${T.goldLo} 76%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Show your working.
            </span>
          </h1>
          <p
            style={{
              fontSize: "clamp(16px, 1.35vw, 20px)",
              lineHeight: 1.7,
              color: T.muted,
              maxWidth: 660,
              margin: "34px auto 0",
            }}
          >
            An agent that reconciles a batch of bank wires against an open ledger, reports a match
            rate measured against known ground truth, and hands back every exception it could not
            resolve — with the reason.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 42 }}>
            <button onClick={onLaunch} style={{ ...btn(true), padding: "15px 30px", fontSize: 12 }}>
              Open the console
            </button>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: T.dim,
              marginTop: 30,
              letterSpacing: "0.08em",
            }}
          >
            THE WIRES BEHIND THIS ARE LIVE — EVERY EDGE IS THE MATCHER RESOLVING A REAL RECORD
          </div>
        </div>
      </Snap>

      {/* 1 — problem */}
      <Snap index={1} setActive={setActive} root={root} align="left">
        <Eyebrow>THE PROBLEM</Eyebrow>
        <H2>
          Generation got cheap.
          <br />
          Verification did not.
        </H2>
        <Body w={680}>
          Reconciliation is still done by hand because the cost of a wrong match is higher than the
          cost of a slow one. A tool that matches 95% of records and quietly gets 4% of them wrong
          is worse than useless — someone has to re-check all of it anyway.
        </Body>
        <Body w={680}>
          So the number that matters is not throughput. It is throughput you can trust, with the
          residual handed back honestly instead of buried.
        </Body>
      </Snap>

      {/* 2 — tiers */}
      <Snap index={2} setActive={setActive} root={root} align="left">
        <Eyebrow>HOW IT WORKS</Eyebrow>
        <H2>Three passes. The model only sees what survives.</H2>
        <Body w={680}>
          Most records do not need reasoning — they need arithmetic. Each tier clears what it can
          and hands the residual down, so the expensive pass runs on a dozen genuinely hard cases
          instead of the whole batch.
        </Body>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            marginTop: 44,
          }}
        >
          {[
            ["1", "Exact", T.exact, "Reference and amount agree to the cent. Deterministic, instant, and the bulk of any clean batch."],
            ["2", "Fuzzy", T.fuzzy, "Tolerance on amount and date, similarity on counterparty, plus a bounded subset-sum search for one wire covering several invoices."],
            ["3", "Reasoned", T.llm, "Only the residual. Ambiguous cases where two candidates sit inside tolerance and something has to weigh the context."],
          ].map(([n, name, color, copy]) => (
            <div key={n} style={{ ...PANEL, padding: "26px 24px 28px", background: "rgba(14,14,14,.72)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 26, height: 2, background: color }} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: T.dim, letterSpacing: "0.14em" }}>
                  TIER {n}
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 16, color }}>
                {name}
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.68, color: T.muted, marginTop: 12 }}>{copy}</p>
            </div>
          ))}
        </div>
      </Snap>

      {/* 3 — measurement */}
      <Snap index={3} setActive={setActive} root={root} align="left">
        <Eyebrow>MEASUREMENT</Eyebrow>
        <H2>The data is synthetic so the answer key exists.</H2>
        <Body w={680}>
          Every batch is generated with its ground truth planted alongside it. That is the only way
          to compute accuracy rather than assert it — and it means precision is reported separately
          from match rate, which is where most tools quietly hide their errors.
        </Body>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
            gap: 14,
            marginTop: 42,
          }}
        >
          {[
            ["NOISE DIAL", "Five levels", "Date drift, wire fees, FX rounding, name variants, merged and split payments, decoys."],
            ["MATCH RATE", "Measured", "Cleared wires over total, scored against the planted answer key."],
            ["PRECISION", "Reported apart", "How many cleared matches were right. The number that decides whether the rate means anything."],
            ["THRESHOLD", "Yours to set", "Drag the auto-clear line and watch coverage trade against error, live."],
          ].map(([label, value, copy]) => (
            <div key={label} style={{ ...PANEL, padding: "22px 20px 24px", background: "rgba(14,14,14,.72)" }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", color: T.dim }}>
                {label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", margin: "10px 0" }}>
                {value}
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: T.muted, margin: 0 }}>{copy}</p>
            </div>
          ))}
        </div>
      </Snap>

      {/* 4 — cash */}
      <Snap index={4} setActive={setActive} root={root} align="left">
        <Eyebrow>CASH POSITION</Eyebrow>
        <H2>
          Will you make payroll, and
          <br />
          which calls change the answer?
        </H2>
        <Body w={680}>
          The payment lag is not assumed. It is measured from the wires just reconciled — bank date
          minus due date, per counterparty — so the forecast is a byproduct of the reconciliation
          rather than a separate model with its own assumptions.
        </Body>
        <Body w={680}>
          Open receivables project forward on that lag, netted against scheduled outflows. When the
          curve crosses the floor, the invoices driving the dip are ranked by how much collecting
          each one lifts the trough. Click one and the counterfactual draws over the top.
        </Body>
      </Snap>

      {/* 5 — residual */}
      <Snap index={5} setActive={setActive} root={root} align="left">
        <Eyebrow>THE RESIDUAL</Eyebrow>
        <H2>Every exception comes back with its reason.</H2>
        <Body w={680}>
          Nothing unresolved is hidden. It is listed, ranked by value at risk, each carrying why it
          failed — no candidate, ambiguous, below threshold. An analyst clears most of the exposure
          in a handful of decisions.
        </Body>
        <Body w={680}>
          Each decision mines a durable rule, and the rules generalize. Teaching it that a
          counterparty remits net of a wire fee fixes every wire from that counterparty, not the one
          you touched. Re-run, and the gap between decisions made and records fixed is the whole
          point.
        </Body>
      </Snap>

      {/* 6 — cta */}
      <Snap index={6} setActive={setActive} root={root}>
        <div style={{ textAlign: "center" }}>
          <H2>Run a batch yourself.</H2>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              color: T.muted,
              maxWidth: 500,
              margin: "22px auto 36px",
            }}
          >
            Set the noise, reconcile, then drag the threshold until the precision number stops being
            comfortable.
          </p>
          <button onClick={onLaunch} style={{ ...btn(true), padding: "15px 32px", fontSize: 12 }}>
            Open the console
          </button>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: T.dim,
              marginTop: 64,
              letterSpacing: "0.1em",
            }}
          >
            LEDGER · SYNTHETIC DATA · PLANTED GROUND TRUTH · MEASURED OUTPUT
          </div>
        </div>
      </Snap>
    </div>
  );
}

export { Snap, Landing };
