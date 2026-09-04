/* The landing hero backdrop is the REAL matcher running tiers 1 and 2 on
   a real generated batch, looping - the same code path as the console,
   not a decorative particle field. */

import { useState, useMemo, useEffect } from "react";
import { generateBatch } from "../engine/generate.js";
import { tierExact, tierFuzzy } from "../engine/match.js";
import { T } from "../theme.js";
import { TIER_META } from "../ui/tiers.js";

function HeroGraph() {
  const batch = useMemo(() => generateBatch({ difficulty: 4, nInvoices: 34, seed: 7 }), []);
  const [ms, setMs] = useState([]);

  useEffect(() => {
    let dead = false;
    async function loop() {
      while (!dead) {
        const acc = [];
        for (const fn of [tierExact, tierFuzzy]) {
          const taken = new Set(acc.map((m) => m.bankId));
          const claimed = new Set(acc.flatMap((m) => m.invoiceIds));
          const res = await fn(
            batch.bank.filter((b) => !taken.has(b.id)),
            batch.ledger.filter((l) => !claimed.has(l.id)),
            { truth: batch.truth, seed: 7 }
          );
          for (const m of res) {
            if (dead) return;
            acc.push(m);
            setMs([...acc]);
            await new Promise((r) => setTimeout(r, 70));
          }
        }
        await new Promise((r) => setTimeout(r, 2600));
        if (dead) return;
        setMs([]);
        await new Promise((r) => setTimeout(r, 700));
      }
    }
    loop();
    return () => {
      dead = true;
    };
  }, [batch]);

  const rowH = 15;
  const H = Math.max(batch.bank.length, batch.ledger.length) * rowH + 30;
  const W = 700;
  const xL = 150,
    xR = 550;
  const bIdx = Object.fromEntries(batch.bank.map((b, i) => [b.id, i]));
  const lIdx = Object.fromEntries(batch.ledger.map((l, i) => [l.id, i]));
  const mB = new Set(ms.map((m) => m.bankId));
  const mL = new Set(ms.flatMap((m) => m.invoiceIds));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.5,
        pointerEvents: "none",
      }}
      preserveAspectRatio="xMidYMid slice"
    >
      {ms.map((m, k) =>
        m.invoiceIds.map((iid, j) => {
          const y1 = 16 + bIdx[m.bankId] * rowH;
          const y2 = 16 + lIdx[iid] * rowH;
          const mid = (xL + xR) / 2;
          return (
            <path
              key={k + "-" + j}
              d={`M ${xL} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${xR} ${y2}`}
              fill="none"
              stroke={TIER_META[m.tier].color}
              strokeWidth={0.7}
              opacity={0.5}
              style={{ animation: "edgeIn .5s ease-out" }}
            />
          );
        })
      )}
      {batch.bank.map((b, i) => (
        <circle
          key={b.id}
          cx={xL}
          cy={16 + i * rowH}
          r={1.7}
          fill={mB.has(b.id) ? T.muted : "rgba(229,72,77,.6)"}
        />
      ))}
      {batch.ledger.map((l, i) => (
        <circle
          key={l.id}
          cx={xR}
          cy={16 + i * rowH}
          r={1.7}
          fill={mL.has(l.id) ? T.muted : "rgba(229,72,77,.6)"}
        />
      ))}
    </svg>
  );
}

export { HeroGraph };
