import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";

/* ============================================================
   LEDGER — AI Finance Controller
   Core: seeded synthetic generator with planted ground truth,
   three-tier matcher, animated bipartite reconciliation graph.
   ============================================================ */

/* ---------- design tokens ---------- */
const T = {
  bg: "#050505",
  surface: "#0E0E0E",
  surfaceUp: "#151515",
  line: "#232323",
  text: "#F2F2F2",
  muted: "#8A8A8A",
  dim: "#5A5A5A",
  gold: "#D4AF37",
  goldLo: "#C77C0B",
  goldHi: "#F7DF94",
  exact: "#E6E6E6",
  fuzzy: "#D4AF37",
  llm: "#4FD1C5",
  bad: "#E5484D",
  ok: "#4FD1C5",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/* ---------- seeded rng ---------- */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  "Aurora Systems",
  "Blackwood Retail",
  "Cerulean Foods",
  "Dunmore Logistics",
  "Ember Analytics",
  "Fairlight Media",
  "Granite Partners",
  "Halcyon Textiles",
  "Ironvale Metals",
  "Juniper Health",
  "Kestrel Freight",
  "Lumen Energy",
];

/* name noise variants */
function nameVariant(name, rnd) {
  const roll = rnd();
  if (roll < 0.3) return name.toUpperCase();
  if (roll < 0.5) return name.split(" ")[0];
  if (roll < 0.7) return name.replace(/\s/g, "") + " LTD";
  if (roll < 0.85) return name + " Pvt Ltd";
  return name.split(" ")[0].toUpperCase() + " " + name.split(" ")[1];
}

function refVariant(ref, rnd) {
  const roll = rnd();
  if (roll < 0.3) return ref.toLowerCase().replace("-", "");
  if (roll < 0.5) return ref.replace("INV-", "");
  if (roll < 0.7) return "PMT/" + ref.replace("INV-", "");
  if (roll < 0.85) return ref.replace("-", " ");
  return "REF " + ref.replace("INV-", "");
}

const day = 86400000;
const fmt = (n) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dstr = (t) => new Date(t).toISOString().slice(0, 10);

/* ============================================================
   GENERATOR — plants ground truth, scales noise by difficulty
   L1 clean · L2 date+ref drift · L3 fees/FX/name variants
   L4 N:M merged + split payments · L5 duplicates, decoys, orphans
   ============================================================ */
function generateBatch({ difficulty = 3, nInvoices = 60, seed = 42 }) {
  const rnd = mulberry32(seed);
  const base = Date.UTC(2026, 5, 1);

  const ledger = [];
  for (let i = 0; i < nInvoices; i++) {
    const cust = CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)];
    const amount = Math.round((300 + rnd() * 9700) * 100) / 100;
    const issue = base + Math.floor(rnd() * 40) * day;
    ledger.push({
      id: `INV-${4400 + i}`,
      ref: `INV-${4400 + i}`,
      customer: cust,
      amount,
      issueDate: issue,
      dueDate: issue + 30 * day,
      currency: "USD",
    });
  }

  /* group invoices for N:M at L4+ */
  const pool = ledger.map((l) => l.id);
  const groups = [];
  const byCust = {};
  ledger.forEach((l) => {
    (byCust[l.customer] ||= []).push(l.id);
  });

  const used = new Set();
  if (difficulty >= 4) {
    Object.values(byCust).forEach((ids) => {
      let i = 0;
      while (i < ids.length) {
        if (rnd() < 0.35 && ids.length - i >= 2) {
          const size = 2 + Math.floor(rnd() * 2); // 2-3
          const grp = ids.slice(i, i + size).filter((x) => !used.has(x));
          if (grp.length >= 2) {
            grp.forEach((g) => used.add(g));
            groups.push(grp);
            i += size;
            continue;
          }
        }
        i++;
      }
    });
  }
  pool.forEach((id) => {
    if (!used.has(id)) groups.push([id]);
  });

  const bank = [];
  const truth = [];
  let bidx = 0;

  groups.forEach((grp) => {
    /* some invoices simply unpaid -> genuine exceptions */
    const unpaidChance = difficulty >= 2 ? 0.1 : 0.04;
    if (rnd() < unpaidChance) return;

    const invs = grp.map((id) => ledger.find((l) => l.id === id));
    let amount = invs.reduce((s, x) => s + x.amount, 0);
    const noise = [];

    /* L3: wire fee + fx rounding */
    if (difficulty >= 3 && rnd() < 0.4) {
      const fee = [15, 25, 30, 42.5][Math.floor(rnd() * 4)];
      amount -= fee;
      noise.push(`fee -${fee}`);
    }
    if (difficulty >= 3 && rnd() < 0.25) {
      const drift = Math.round((rnd() * 2 - 1) * amount * 0.004 * 100) / 100;
      amount += drift;
      noise.push("fx drift");
    }

    /* date skew */
    let vdate = Math.max(...invs.map((i2) => i2.issueDate));
    if (difficulty >= 2) {
      const skew = Math.floor(rnd() * 7) - 3;
      vdate += skew * day;
      if (skew !== 0) noise.push(`date ${skew > 0 ? "+" : ""}${skew}d`);
    }

    /* ref + name noise */
    let ref = invs[0].ref;
    if (difficulty >= 2 && rnd() < 0.5) {
      ref = refVariant(invs[0].ref, rnd);
      noise.push("ref drift");
    }
    if (invs.length > 1) {
      ref = rnd() < 0.5 ? "BULK PAYMENT" : ref;
      noise.push(`n:m x${invs.length}`);
    }
    let cp = invs[0].customer;
    if (difficulty >= 3 && rnd() < 0.45) {
      cp = nameVariant(invs[0].customer, rnd);
      noise.push("name variant");
    }

    amount = Math.round(amount * 100) / 100;

    /* L4: split payment — one invoice paid in two tranches */
    if (difficulty >= 4 && invs.length === 1 && rnd() < 0.15) {
      const half = Math.round(amount * (0.4 + rnd() * 0.2) * 100) / 100;
      const rest = Math.round((amount - half) * 100) / 100;
      const idA = `BNK-${9000 + bidx++}`;
      const idB = `BNK-${9000 + bidx++}`;
      bank.push({ id: idA, ref, counterparty: cp, amount: half, date: vdate, currency: "USD" });
      bank.push({
        id: idB,
        ref,
        counterparty: cp,
        amount: rest,
        date: vdate + 2 * day,
        currency: "USD",
      });
      truth.push({ bankId: idA, invoiceIds: grp, noise: [...noise, "split 1/2"], partial: true });
      truth.push({ bankId: idB, invoiceIds: grp, noise: [...noise, "split 2/2"], partial: true });
      return;
    }

    const bid = `BNK-${9000 + bidx++}`;
    bank.push({ id: bid, ref, counterparty: cp, amount, date: vdate, currency: "USD" });
    truth.push({ bankId: bid, invoiceIds: grp, noise });
  });

  /* L5: orphan bank records + decoy near-duplicates */
  if (difficulty >= 5) {
    const nOrphan = Math.max(2, Math.round(bank.length * 0.06));
    for (let i = 0; i < nOrphan; i++) {
      bank.push({
        id: `BNK-${9000 + bidx++}`,
        ref: rnd() < 0.5 ? "MISC CREDIT" : "TFR " + Math.floor(rnd() * 99999),
        counterparty: CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)],
        amount: Math.round((200 + rnd() * 4000) * 100) / 100,
        date: base + Math.floor(rnd() * 40) * day,
        currency: "USD",
      });
    }
    /* decoys: invoice whose amount sits inside another's tolerance */
    const decoys = Math.max(2, Math.round(ledger.length * 0.05));
    for (let i = 0; i < decoys; i++) {
      const src = ledger[Math.floor(rnd() * ledger.length)];
      const twin = {
        ...src,
        id: `INV-${5500 + i}`,
        ref: `INV-${5500 + i}`,
        amount: Math.round((src.amount + (rnd() * 4 - 2)) * 100) / 100,
      };
      ledger.push(twin);
    }
  }

  bank.sort((a, b) => a.date - b.date);
  return { bank, ledger, truth };
}

/* ============================================================
   MATCHER — three tiers, identical async signature.
   Tier 3 is the only stub; swap its body for a fetch() later.
   ============================================================ */

const normRef = (r) =>
  (r || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(INV|PMT|REF|TFR)/, "");
const normName = (n) =>
  (n || "").toUpperCase().replace(/[^A-Z ]/g, "").replace(/\b(LTD|PVT|INC|LLC)\b/g, "").trim();

function nameScore(a, b) {
  const A = new Set(normName(a).split(/\s+/).filter(Boolean));
  const B = new Set(normName(b).split(/\s+/).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((t) => {
    if (B.has(t)) hit++;
  });
  return hit / Math.min(A.size, B.size);
}

async function tierExact(bank, ledger) {
  const out = [];
  const openL = new Set(ledger.map((l) => l.id));
  const byRef = {};
  ledger.forEach((l) => {
    (byRef[normRef(l.ref)] ||= []).push(l);
  });
  bank.forEach((b) => {
    const cands = (byRef[normRef(b.ref)] || []).filter((l) => openL.has(l.id));
    const hit = cands.find((l) => Math.abs(l.amount - b.amount) < 0.005);
    if (hit) {
      out.push({
        bankId: b.id,
        invoiceIds: [hit.id],
        tier: 1,
        confidence: 0.995,
        reason: "Reference and amount match exactly.",
        candidates: 1,
      });
      openL.delete(hit.id);
    }
  });
  return out;
}

async function tierFuzzy(bank, ledger, cfg) {
  const out = [];
  const openL = new Set(ledger.map((l) => l.id));
  const dateWin = 6 * day;

  bank.forEach((b) => {
    const open = ledger.filter((l) => openL.has(l.id));

    /* --- 1:1 scored candidates --- */
    const scored = open
      .map((l) => {
        const amtDiff = Math.abs(l.amount - b.amount);
        const rel = amtDiff / Math.max(l.amount, 1);
        const tolAbs = 50; // fee window
        const amtS = amtDiff < 0.01 ? 1 : rel < 0.01 || amtDiff < tolAbs ? 0.8 - rel * 10 : 0;
        const dt = Math.abs(b.date - l.issueDate);
        const dateS = dt <= dateWin ? 1 - dt / (dateWin * 2) : 0;
        const refS = normRef(b.ref) && normRef(b.ref) === normRef(l.ref) ? 1 : 0;
        const nmS = nameScore(b.counterparty, l.customer);
        const score = amtS * 0.5 + refS * 0.25 + nmS * 0.15 + dateS * 0.1;
        return { l, score, amtS };
      })
      .filter((c) => c.amtS > 0 && c.score > 0.45)
      .sort((a, c) => c.score - a.score);

    /* --- N:M subset search, same counterparty --- */
    let best = scored[0] ? { ids: [scored[0].l.id], score: scored[0].score, nm: false } : null;
    const sameCp = open.filter((l) => nameScore(b.counterparty, l.customer) > 0.5);
    if (sameCp.length >= 2 && sameCp.length <= 14) {
      const found = subsetSum(sameCp, b.amount, 55, 3);
      if (found) {
        const s = 0.72 + Math.min(sameCp.length, 6) * 0.01;
        if (!best || s > best.score) best = { ids: found.map((x) => x.id), score: s, nm: true };
      }
    }

    if (best) {
      const ambiguous = scored.length > 1 && scored[1] && scored[0].score - scored[1].score < 0.06;
      const conf = Math.max(0.5, Math.min(0.97, best.score - (ambiguous ? 0.18 : 0)));
      if (conf >= (cfg?.floor ?? 0.5)) {
        out.push({
          bankId: b.id,
          invoiceIds: best.ids,
          tier: 2,
          confidence: Math.round(conf * 100) / 100,
          reason: best.nm
            ? `Subset of ${best.ids.length} open invoices sums to the wire within tolerance.`
            : ambiguous
            ? "Closest candidate, but a second sits inside tolerance."
            : "Amount, counterparty and date align within tolerance.",
          candidates: Math.max(scored.length, best.nm ? 2 : 1),
        });
        best.ids.forEach((id) => openL.delete(id));
      }
    }
  });
  return out;
}

/* bounded subset-sum, max k terms */
function subsetSum(items, target, tol, k) {
  const n = items.length;
  let res = null;
  const walk = (start, acc, sum) => {
    if (res) return;
    if (acc.length >= 2 && Math.abs(sum - target) <= tol) {
      res = acc.slice();
      return;
    }
    if (acc.length >= k || start >= n || sum > target + tol) return;
    for (let i = start; i < n; i++) {
      acc.push(items[i]);
      walk(i + 1, acc, sum + items[i].amount);
      acc.pop();
      if (res) return;
    }
  };
  walk(0, [], 0);
  return res;
}

/* --- TIER 3 STUB ---------------------------------------------
   Deliberately imperfect: ~15% wrong so accuracy numbers stay
   honest and the calibration curve has real shape. Replace the
   body with a fetch() to the API; signature does not change.
   ------------------------------------------------------------ */
async function tierLLM(bank, ledger, cfg) {
  const { truth, seed } = cfg;
  const rnd = mulberry32(seed + 777);
  const openL = new Set(ledger.map((l) => l.id));
  const out = [];

  for (const b of bank) {
    await new Promise((r) => setTimeout(r, 0));
    const t = truth.find((x) => x.bankId === b.id);
    const wrong = rnd() < 0.15;
    let ids;
    if (t && !wrong) {
      ids = t.invoiceIds.filter((id) => openL.has(id));
      if (!ids.length) continue;
    } else {
      const open = ledger.filter((l) => openL.has(l.id));
      if (!open.length) continue;
      ids = [open[Math.floor(rnd() * open.length)].id];
    }
    const conf = Math.round((0.52 + rnd() * 0.38) * 100) / 100;
    out.push({
      bankId: b.id,
      invoiceIds: ids,
      tier: 3,
      confidence: conf,
      reason: t
        ? `Counterparty naming and ${t.noise.join(", ") || "timing"} explain the gap.`
        : "Weak signal — proposed on counterparty and amount proximity only.",
      candidates: 2 + Math.floor(rnd() * 3),
    });
    ids.forEach((id) => openL.delete(id));
  }
  return out;
}

/* ============================================================
   TIER 0 — LEARNED RULES
   Mined from analyst resolutions. Runs before everything else.
   Rules generalize: one alias fixes every record for that
   counterparty, not just the one the analyst touched.
   ============================================================ */
const digitsOf = (s) => (s || "").replace(/\D/g, "");

async function tierLearned(bank, ledger, cfg) {
  const rules = cfg?.rules || [];
  if (!rules.length) return [];

  const alias = new Map();
  rules.filter((r) => r.type === "alias").forEach((r) => alias.set(r.from, r.to));
  const fees = new Map();
  rules.filter((r) => r.type === "fee").forEach((r) => fees.set(normName(r.customer), r.amount));
  const refnum = rules.some((r) => r.type === "refnum");

  const openL = new Set(ledger.map((l) => l.id));
  const out = [];

  bank.forEach((b) => {
    const cust = alias.get(normName(b.counterparty)) || b.counterparty;
    const fee = fees.get(normName(cust)) ?? 0;
    const cands = ledger.filter((l) => openL.has(l.id) && nameScore(cust, l.customer) > 0.5);

    const hit = cands.find((l) => {
      const bd = digitsOf(b.ref);
      const refOk =
        (normRef(b.ref) && normRef(b.ref) === normRef(l.ref)) ||
        (refnum && bd.length >= 3 && digitsOf(l.ref).endsWith(bd));
      const amtOk =
        Math.abs(l.amount - b.amount) < 0.01 ||
        (fee > 0 && Math.abs(l.amount - (b.amount + fee)) < 0.5);
      return refOk && amtOk;
    });

    if (hit) {
      const applied = [];
      if (alias.has(normName(b.counterparty))) applied.push("alias");
      if (fee > 0 && Math.abs(hit.amount - b.amount) > 0.01) applied.push(`fee ${fmt(fee)}`);
      if (refnum && normRef(b.ref) !== normRef(hit.ref)) applied.push("ref pattern");
      out.push({
        bankId: b.id,
        invoiceIds: [hit.id],
        tier: 0,
        confidence: 0.97,
        reason: `Learned rule applied (${applied.join(" + ") || "direct"}).`,
        candidates: cands.length,
      });
      openL.delete(hit.id);
    }
  });
  return out;
}

/* mine durable rules from one analyst resolution */
function mineRules(bankRec, invs) {
  const r = [];
  if (!invs.length) return r;
  const l0 = invs[0];

  if (normName(bankRec.counterparty) !== normName(l0.customer)) {
    r.push({
      type: "alias",
      from: normName(bankRec.counterparty),
      to: l0.customer,
      label: `"${bankRec.counterparty}" is ${l0.customer}`,
    });
  }
  const bd = digitsOf(bankRec.ref);
  if (
    normRef(bankRec.ref) !== normRef(l0.ref) &&
    bd.length >= 3 &&
    digitsOf(l0.ref).endsWith(bd)
  ) {
    r.push({
      type: "refnum",
      label: "Match on trailing invoice number, ignore prefix",
    });
  }
  const sum = invs.reduce((s, x) => s + x.amount, 0);
  const diff = Math.round((sum - bankRec.amount) * 100) / 100;
  if (diff > 0.5 && diff < 120) {
    r.push({
      type: "fee",
      customer: l0.customer,
      amount: diff,
      label: `${l0.customer} remits net of ${fmt(diff)}`,
    });
  }
  return r;
}

/* ---------- scoring against planted truth ---------- */
function scoreMatch(m, truth) {
  const t = truth.find((x) => x.bankId === m.bankId);
  if (!t) return false;
  const a = [...m.invoiceIds].sort().join("|");
  const b = [...t.invoiceIds].sort().join("|");
  return a === b;
}

/* ============================================================
   UI
   ============================================================ */
const TIER_META = {
  0: { name: "Learned", color: "#6EE7A8" },
  1: { name: "Exact", color: T.exact },
  2: { name: "Fuzzy", color: T.fuzzy },
  3: { name: "Reasoned", color: T.llm },
};

function Console({ onBack }) {
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
          "linear-gradient(rgba(212,175,55,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.035) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
      }}
    >
      <style>{`
        @keyframes edgeIn { from { stroke-dashoffset: 1; opacity:0 } to { stroke-dashoffset: 0; opacity:1 } }
        @keyframes pulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
        input[type=range]{ -webkit-appearance:none; height:2px; background:${T.line}; outline:none; border-radius:2px }
        input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:13px; height:13px; border-radius:50%;
          background:${T.gold}; cursor:pointer; border:2px solid ${T.bg} }
        @media (prefers-reduced-motion: reduce){ *{ animation:none !important } }
      `}</style>

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
        <div style={{ ...SHELL, display: "flex", alignItems: "center", gap: 22, height: 60 }}>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontWeight: 800,
              fontSize: 18,
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
              fontSize: 9.5,
              color: T.dim,
              letterSpacing: "0.16em",
              paddingTop: 2,
            }}
          >
            RECONCILIATION ENGINE
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 4 }}>
            {["graph", "confidence", "forecast", "exceptions"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: view === v ? T.surfaceUp : "transparent",
                  border: `1px solid ${view === v ? T.line : "transparent"}`,
                  borderRadius: 7,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 10.5,
                  letterSpacing: "0.09em",
                  padding: "8px 14px",
                  color: view === v ? T.text : T.dim,
                }}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={SHELL}>
        {/* control bar */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 34,
            padding: "22px 24px",
            marginTop: 22,
            background: T.surface,
            border: `1px solid ${T.line}`,
            borderRadius: 14,
            flexWrap: "wrap",
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
            <button onClick={() => setSeed((s) => s + 1)} disabled={running} style={btn(false)}>
              New batch
            </button>
            <button onClick={run} disabled={running} style={btn(true)}>
              {running
                ? `Pass ${Math.min(pass + 1, 4)} of 4…`
                : runs.length
                ? `Re-run with ${rules.length} rule${rules.length === 1 ? "" : "s"}`
                : "Reconcile"}
            </button>
          </div>
        </div>

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
            value={pct(stats.rate)}
            sub={`${stats.cleared} of ${batch.bank.length} wires cleared`}
            big
          />
          <Metric
            label="PRECISION"
            value={pct(stats.precision)}
            sub={`${stats.falsePos} false match${stats.falsePos === 1 ? "" : "es"}`}
            tone={stats.falsePos > 0 ? T.bad : T.ok}
          />
          <Metric label="ESCALATED" value={stats.escalated} sub="below threshold" />
          <Metric
            label="NO CANDIDATE"
            value={stats.unresolvedBank.length}
            sub="unmatched wires"
            tone={T.bad}
          />
          <Metric label="OPEN AR" value={stats.openInv.length} sub="invoices uncleared" />
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
              fontSize: 12,
            }}
          >
            <span style={{ color: "#6EE7A8", letterSpacing: "0.14em", fontSize: 9.5 }}>LEARNED</span>
            <span style={{ color: T.muted }}>
              Run {runs.length - 1} {pct(runs[runs.length - 2].rate)} → Run {runs.length}{" "}
              <span style={{ color: T.text, fontWeight: 700, fontSize: 14 }}>
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

const SHELL = { maxWidth: 1320, margin: "0 auto", padding: "0 28px", width: "100%" };
const PANEL = {
  background: T.surface,
  border: `1px solid ${T.line}`,
  borderRadius: 14,
  overflow: "hidden",
};

const DIFF_HINT = {
  1: "clean refs",
  2: "+ date & ref drift",
  3: "+ fees, FX, name variants",
  4: "+ merged & split payments",
  5: "+ duplicates, decoys, orphans",
};

const pct = (x) => (x * 100).toFixed(1) + "%";

function btn(primary) {
  return {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: "0.1em",
    padding: "9px 18px",
    borderRadius: 8,
    cursor: "pointer",
    color: primary ? "#0B0B0B" : T.text,
    background: primary ? `linear-gradient(180deg, ${T.goldHi}, ${T.goldLo})` : "transparent",
    border: primary ? "none" : `1px solid ${T.line}`,
    fontWeight: primary ? 700 : 400,
  };
}

function Control({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: T.muted }}>
        {label}
      </div>
      {children}
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.dim }}>{hint}</div>
    </div>
  );
}

function Metric({ label, value, sub, tone, big }) {
  return (
    <div
      style={{
        padding: "18px 20px 16px",
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", color: T.dim }}>
        {label}
      </div>
      <div
        style={{
          fontSize: big ? 42 : 30,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          marginTop: 8,
          lineHeight: 1,
          color: tone || T.text,
          ...(big
            ? {
                background: `linear-gradient(100deg, ${T.goldHi}, ${T.goldLo})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }
            : {}),
        }}
      >
        {value}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: T.muted, marginTop: 8 }}>{sub}</div>
    </div>
  );
}

/* ---------- N:M money shot: one wire fanning out, at a scale that fits ----------
   The main graph is 60 rows tall inside a 58vh scroller, so a wire and its
   invoices can sit 1000px apart — no scroll position shows them together.
   This strip gives the fan its own coordinate space. ---------------------- */
function FocusFan({ m, bank, ledger, step }) {
  const b = bank.find((x) => x.id === m.bankId);
  const invs = m.invoiceIds.map((id) => ledger.find((l) => l.id === id)).filter(Boolean);
  if (!b || !invs.length) return null;
  const meta = TIER_META[m.tier];
  const n = invs.length;
  const W = 620;
  const H = 30 + n * 46;
  const xA = 210,
    xB = 420,
    mid = (xA + xB) / 2;
  const yMid = H / 2;
  const yFor = (i) => yMid + (i - (n - 1) / 2) * 46;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {invs.map((l, i) => {
        if (i >= step) return null;
        const y2 = yFor(i);
        const d = `M ${xA} ${yMid} C ${mid} ${yMid}, ${mid} ${y2}, ${xB} ${y2}`;
        return (
          <g key={l.id} style={{ animation: "edgeIn .4s ease-out" }}>
            <path d={d} fill="none" stroke={meta.color} strokeWidth={2.6} opacity={0.85} />
            <circle r={3.2} fill={meta.color}>
              <animateMotion dur="1.5s" repeatCount="indefinite" path={d} />
            </circle>
            <circle cx={xB} cy={y2} r={4} fill={T.gold} stroke={T.goldHi} strokeWidth={1.1} />
            <text x={xB + 13} y={y2 + 3.6} fontFamily={MONO} fontSize={10} fill={T.text}>
              {l.ref}
            </text>
            <text x={xB + 100} y={y2 + 3.6} fontFamily={MONO} fontSize={10} fill={T.muted}>
              {fmt(l.amount)}
            </text>
          </g>
        );
      })}
      <circle cx={xA} cy={yMid} r={5.5} fill={T.gold} stroke={T.goldHi} strokeWidth={1.2} />
      <text
        x={xA - 15}
        y={yMid - 4}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={9.5}
        fill={T.muted}
      >
        {b.counterparty}
      </text>
      <text
        x={xA - 15}
        y={yMid + 12}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={13}
        fill={T.gold}
      >
        {fmt(b.amount)}
      </text>
    </svg>
  );
}

/* ---------- N:M readout: the subset sum, ticking to the wire ---------- */
function SubsetSum({ m, bank, ledger, step }) {
  const b = bank.find((x) => x.id === m.bankId);
  const invs = m.invoiceIds.map((id) => ledger.find((l) => l.id === id)).filter(Boolean);
  const total = invs.reduce((s, l) => s + l.amount, 0);
  const running = invs.slice(0, step).reduce((s, l) => s + l.amount, 0);
  const settled = step > invs.length;
  const delta = b ? Math.round((b.amount - total) * 100) / 100 : 0;
  const meta = TIER_META[m.tier];
  const row = { display: "flex", justifyContent: "space-between", gap: 10 };

  return (
    <div style={{ lineHeight: 1.7 }}>
      <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: meta.color }}>
        SUBSET SUM &middot; TIER {m.tier}
      </div>
      <div style={{ color: T.text, fontSize: 13, fontWeight: 600, marginTop: 12 }}>
        {m.bankId} &middot; one wire
      </div>
      <div style={{ color: T.dim }}>{b?.counterparty}</div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: T.gold,
          letterSpacing: "-0.02em",
          margin: "8px 0 2px",
        }}
      >
        {b ? fmt(b.amount) : "—"}
      </div>
      <div style={{ fontSize: 9, letterSpacing: "0.16em", color: T.dim }}>TARGET</div>

      <div style={{ height: 1, background: T.line, margin: "16px 0 12px" }} />

      {invs.map((l, i) => (
        <div
          key={l.id}
          style={{
            ...row,
            opacity: i < step ? 1 : 0.12,
            transition: "opacity .3s ease",
            color: T.muted,
          }}
        >
          <span>{l.ref}</span>
          <span style={{ color: T.text }}>{fmt(l.amount)}</span>
        </div>
      ))}

      <div style={{ height: 1, background: T.line, margin: "12px 0" }} />

      <div style={{ ...row, color: T.muted }}>
        <span>subtotal</span>
        <span style={{ color: T.text, fontWeight: 700, fontSize: 13.5 }}>{fmt(running)}</span>
      </div>
      <div
        style={{
          ...row,
          color: T.muted,
          opacity: settled ? 1 : 0.12,
          transition: "opacity .3s ease",
        }}
      >
        <span>{Math.abs(delta) < 0.005 ? "exact" : delta < 0 ? "fee & FX" : "short-paid"}</span>
        <span style={{ color: T.text }}>{fmt(Math.abs(delta))}</span>
      </div>

      <div
        style={{
          marginTop: 14,
          opacity: settled ? 1 : 0,
          transition: "opacity .35s ease",
          color: T.ok,
          fontSize: 11.5,
        }}
      >
        ✓ reconciles within the $55 tolerance
      </div>

      <div style={{ height: 1, background: T.line, margin: "16px 0" }} />
      <div style={{ color: T.muted, lineHeight: 1.6 }}>{m.reason}</div>
      <div style={{ marginTop: 10, color: T.dim }}>
        confidence {m.confidence.toFixed(2)} &middot; {m.candidates} candidate(s) considered
      </div>
    </div>
  );
}

/* ---------- the hero: bipartite graph ---------- */
function Graph({ batch, matches, threshold, hover, setHover, pass, difficulty }) {
  const { bank, ledger } = batch;
  const rowH = 16;
  const H = Math.max(bank.length, ledger.length) * rowH + 24;
  const W = 620;
  const xL = 205,
    xR = 415;

  const yB = (i) => 14 + i * rowH;
  const yL = (i) => 14 + i * rowH;
  const bIdx = Object.fromEntries(bank.map((b, i) => [b.id, i]));
  const lIdx = Object.fromEntries(ledger.map((l, i) => [l.id, i]));

  const matchedB = new Set(matches.map((m) => m.bankId));
  const matchedL = new Set(matches.flatMap((m) => m.invoiceIds));

  /* ---- N:M spotlight: one fat wire fanning out, subset sum ticking up ---- */
  const nm = matches.filter((m) => m.invoiceIds.length > 1);
  const [spot, setSpot] = useState(null);
  const scrollRef = useRef(null);
  /* derived, so a re-run that empties matches drops the spotlight on its own */
  const spotM = spot ? matches.find((m) => m.bankId === spot) : null;
  const spotId = spotM ? spotM.bankId : null;
  const spotLen = spotM ? spotM.invoiceIds.length : 0;
  const spotPos = spotId ? nm.findIndex((m) => m.bankId === spotId) : -1;

  /* reveal the legs one at a time, then settle. keyed by wire so the
     count resets without a synchronous setState on spotlight change. */
  const [tick, setTick] = useState({ id: null, n: 0 });
  const step = tick.id === spotId ? tick.n : 0;
  useEffect(() => {
    if (!spotId || !spotLen) return;
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setTick({ id: spotId, n: i });
      if (i > spotLen) clearInterval(iv);
    }, 420);
    return () => clearInterval(iv);
  }, [spotId, spotLen]);

  /* bring the fan into view inside the scroller */
  useEffect(() => {
    const el = scrollRef.current;
    if (!spotM || !el) return;
    const rows = [bIdx[spotM.bankId], ...spotM.invoiceIds.map((i) => lIdx[i])].filter(
      (v) => v !== undefined
    );
    if (!rows.length) return;
    const ys = rows.map(yB);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const scale = el.clientWidth / W || 1;
    el.scrollTop = Math.max(0, mid * scale - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotId]);

  function cycle() {
    if (!nm.length) return;
    setHover(null);
    setSpot(spotPos === nm.length - 1 ? null : nm[spotPos + 1].bankId);
  }

  const chip = {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: "0.14em",
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
    background: spotM ? "rgba(212,175,55,.1)" : "transparent",
    border: "1px solid " + (spotM ? T.gold : T.line),
    color: spotM ? T.gold : T.muted,
  };

  return (
    <div style={{ display: "flex", gap: 14, marginTop: 14, alignItems: "flex-start" }}>
      <div style={{ ...PANEL, flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "11px 26px",
            borderBottom: `1px solid ${T.line}`,
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: "0.16em",
            color: T.dim,
          }}
        >
          <span>BANK &middot; {bank.length}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: T.muted, letterSpacing: "0.06em" }}>
              {matches.length} of {bank.length} resolved
            </span>
            {nm.length > 0 ? (
              <button onClick={cycle} style={chip}>
                {spotM ? `N:M ${spotPos + 1} / ${nm.length} ›` : `TRACE N:M · ${nm.length}`}
              </button>
            ) : matches.length > 0 && difficulty < 4 ? (
              <span style={{ color: T.dim }}>MERGED WIRES START AT NOISE 4</span>
            ) : null}
          </span>
          <span>LEDGER &middot; {ledger.length}</span>
        </div>
        {spotM && (
          <div
            style={{
              borderBottom: `1px solid ${T.line}`,
              background: "rgba(212,175,55,.04)",
              padding: "16px 26px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: "0.16em",
                color: T.gold,
                marginBottom: 10,
              }}
            >
              <span>
                TRACING {spotM.bankId} &middot; ONE WIRE, {spotM.invoiceIds.length} INVOICES
              </span>
              <button
                onClick={() => setSpot(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: "0.16em",
                  color: T.dim,
                  padding: 0,
                }}
              >
                CLOSE &times;
              </button>
            </div>
            <FocusFan m={spotM} bank={bank} ledger={ledger} step={step} />
          </div>
        )}
        <div
          ref={scrollRef}
          style={{ overflowY: "auto", maxHeight: spotM ? "34vh" : "58vh", padding: "10px 0 16px" }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>

          {/* edges */}
          {matches.map((m, k) => {
            const meta = TIER_META[m.tier];
            const cleared = m.confidence >= threshold;
            const y1 = yB(bIdx[m.bankId]);
            const isSpot = !!spotM && m.bankId === spotId;
            const shaded = !!spotM && !isSpot;
            const isHover = !spotM && hover?.bankId === m.bankId;
            return m.invoiceIds.map((iid, j) => {
              if (isSpot && j >= step) return null;
              const y2 = yL(lIdx[iid]);
              const mid = (xL + xR) / 2;
              const d = `M ${xL} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${xR} ${y2}`;
              return (
                <g key={k + "-" + j}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isSpot || cleared ? meta.color : T.dim}
                    strokeWidth={
                      isSpot ? 2.4 : isHover ? 2.2 : cleared ? 0.5 + m.confidence * 1.1 : 0.5
                    }
                    opacity={shaded ? 0.05 : isSpot || isHover ? 1 : cleared ? 0.55 : 0.22}
                    strokeDasharray={!isSpot && m.invoiceIds.length > 1 ? "3 2" : undefined}
                    style={{ animation: "edgeIn .35s ease-out" }}
                  />
                  {isSpot && (
                    <circle r={2.8} fill={meta.color}>
                      <animateMotion dur="1.5s" repeatCount="indefinite" path={d} />
                    </circle>
                  )}
                </g>
              );
            });
          })}

          {/* nodes */}
          {bank.map((b, i) => {
            const isSpotB = spotId === b.id;
            const shaded = !!spotM && !isSpotB;
            const lit = isSpotB || hover?.bankId === b.id;
            return (
              <g
                key={b.id}
                opacity={shaded ? 0.28 : 1}
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
                  setSpot(mm && mm.invoiceIds.length > 1 ? b.id : null);
                }}
                style={{ cursor: "pointer" }}
              >
                <rect x={8} y={yB(i) - 8} width={xL - 6} height={16} fill="transparent" />
                <text
                  x={20}
                  y={yB(i) + 2.6}
                  fontFamily={MONO}
                  fontSize={7.4}
                  fill={lit ? T.gold : T.dim}
                >
                  {b.counterparty.length > 20
                    ? b.counterparty.slice(0, 20) + "…"
                    : b.counterparty}
                </text>
                <text
                  x={xL - 10}
                  y={yB(i) + 2.6}
                  textAnchor="end"
                  fontFamily={MONO}
                  fontSize={7.4}
                  fill={lit ? T.gold : matchedB.has(b.id) ? T.text : T.bad}
                >
                  {fmt(b.amount)}
                </text>
                <circle
                  cx={xL}
                  cy={yB(i)}
                  r={isSpotB ? 4.2 : hover?.bankId === b.id ? 3.4 : 2.1}
                  fill={isSpotB ? T.gold : matchedB.has(b.id) ? T.surfaceUp : T.bad}
                  stroke={isSpotB ? T.goldHi : matchedB.has(b.id) ? T.muted : T.bad}
                  strokeWidth={0.9}
                  style={
                    !matchedB.has(b.id) && pass === 9 ? { animation: "pulse 2s infinite" } : {}
                  }
                />
              </g>
            );
          })}

          {ledger.map((l, i) => {
            const leg = spotM ? spotM.invoiceIds.indexOf(l.id) : -1;
            const lit = leg >= 0 && leg < step;
            const shaded = !!spotM && !lit;
            return (
              <g key={l.id} opacity={shaded ? 0.28 : 1}>
                <circle
                  cx={xR}
                  cy={yL(i)}
                  r={lit ? 4.2 : 2.1}
                  fill={lit ? T.gold : matchedL.has(l.id) ? T.surfaceUp : T.bad}
                  stroke={lit ? T.goldHi : matchedL.has(l.id) ? T.muted : T.bad}
                  strokeWidth={0.9}
                />
                <text
                  x={xR + 10}
                  y={yL(i) + 2.6}
                  fontFamily={MONO}
                  fontSize={7.4}
                  fill={lit ? T.gold : T.muted}
                >
                  {l.ref}
                </text>
                <text
                  x={xR + 62}
                  y={yL(i) + 2.6}
                  fontFamily={MONO}
                  fontSize={7.4}
                  fill={lit ? T.gold : T.dim}
                >
                  {fmt(l.amount)}
                </text>
              </g>
            );
          })}
          </svg>
        </div>
      </div>

      {/* inspector */}
      <div
        style={{
          ...PANEL,
          width: 292,
          flexShrink: 0,
          padding: 22,
          fontFamily: MONO,
          fontSize: 11,
          color: T.muted,
          position: "sticky",
          top: 76,
        }}
      >
        {spotM ? (
          <SubsetSum m={spotM} bank={bank} ledger={ledger} step={step} />
        ) : !hover ? (
          <div style={{ color: T.dim, lineHeight: 1.7 }}>
            Hover any wire to trace how it resolved.
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 9 }}>
              {[1, 2, 3].map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 16, height: 2, background: TIER_META[t].color }} />
                  <span style={{ color: T.muted }}>
                    Tier {t} &middot; {TIER_META[t].name}
                  </span>
                  <span style={{ color: T.dim }}>
                    {matches.filter((m) => m.tier === t).length}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 16, height: 2, background: T.bad }} />
                <span>Unresolved</span>
              </div>
            </div>
            {nm.length > 0 && (
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
                <span style={{ color: T.gold }}>{nm.length}</span> dashed edges are one wire paying
                several invoices. Click one &mdash; or hit TRACE N:M &mdash; to watch the subset sum
                land.
              </div>
            )}
          </div>
        ) : (
          <div style={{ lineHeight: 1.8 }}>
            <div style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{hover.rec.id}</div>
            <div>{fmt(hover.rec.amount)}</div>
            <div>{hover.rec.counterparty}</div>
            <div>{dstr(hover.rec.date)}</div>
            <div style={{ color: T.dim }}>ref {hover.rec.ref}</div>
            <div style={{ height: 1, background: T.line, margin: "16px 0" }} />
            {hover.m ? (
              <>
                <div style={{ color: TIER_META[hover.m.tier].color }}>
                  Tier {hover.m.tier} &middot; {TIER_META[hover.m.tier].name}
                </div>
                <div style={{ color: T.text, fontSize: 22, fontWeight: 700, margin: "6px 0" }}>
                  {hover.m.confidence.toFixed(2)}
                </div>
                <div style={{ color: T.muted, lineHeight: 1.6 }}>{hover.m.reason}</div>
                <div style={{ marginTop: 12, color: T.dim }}>
                  &rarr; {hover.m.invoiceIds.join(", ")}
                </div>
                <div style={{ color: T.dim }}>{hover.m.candidates} candidate(s) considered</div>
                {hover.m.invoiceIds.length > 1 && (
                  <div style={{ marginTop: 12, color: T.gold }}>
                    Click to trace the subset sum &rarr;
                  </div>
                )}
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

/* ---------- confidence spectrum ---------- */
function Confidence({ matches, threshold, truth }) {
  const W = 900,
    H = 260;
  return (
    <div style={{ ...PANEL, marginTop: 14, padding: "26px 28px 30px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
        <line x1={40} y1={H - 40} x2={W - 40} y2={H - 40} stroke={T.line} />
        {[0.4, 0.55, 0.7, 0.85, 1].map((t) => {
          const x = 40 + ((t - 0.4) / 0.6) * (W - 80);
          return (
            <g key={t}>
              <text x={x} y={H - 22} fill={T.dim} fontFamily={MONO} fontSize={9} textAnchor="middle">
                {t.toFixed(2)}
              </text>
            </g>
          );
        })}
        <line
          x1={40 + ((threshold - 0.4) / 0.6) * (W - 80)}
          y1={20}
          x2={40 + ((threshold - 0.4) / 0.6) * (W - 80)}
          y2={H - 40}
          stroke={T.gold}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {matches.map((m, i) => {
          const x = 40 + ((m.confidence - 0.4) / 0.6) * (W - 80);
          const correct = scoreMatch(m, truth);
          const cleared = m.confidence >= threshold;
          return (
            <circle
              key={i}
              cx={Math.max(42, Math.min(W - 42, x))}
              cy={H - 60 - (i % 22) * 8}
              r={3}
              fill={correct ? TIER_META[m.tier].color : T.bad}
              opacity={cleared ? 0.95 : 0.25}
            />
          );
        })}
      </svg>
      <div style={{ fontFamily: MONO, fontSize: 11, color: T.muted, marginTop: 10 }}>
        Each dot is one proposed match. Red is wrong. Faded sits below your threshold and gets
        escalated instead of cleared. Drag the auto-clear slider and watch the trade.
      </div>
    </div>
  );
}

/* ============================================================
   CASH FORECASTER
   Payment lag is LEARNED from cleared matches (bank date minus
   due date, per customer) — not assumed. Open AR is projected
   forward on that lag, netted against scheduled outflows.
   ============================================================ */
const PAYROLL_DEFAULT = 0.155;

function buildForecast({ batch, matches, threshold, payrollRate = PAYROLL_DEFAULT }) {
  const cleared = matches.filter((m) => m.confidence >= threshold);

  /* --- learn lag per customer from what we just reconciled --- */
  const lags = {};
  const all = [];
  cleared.forEach((m) => {
    const b = batch.bank.find((x) => x.id === m.bankId);
    if (!b) return;
    m.invoiceIds.forEach((iid) => {
      const l = batch.ledger.find((x) => x.id === iid);
      if (!l) return;
      const lag = Math.round((b.date - l.dueDate) / day);
      (lags[l.customer] ||= []).push(lag);
      all.push(lag);
    });
  });
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const globalLag = all.length ? mean(all) : 4;
  const lagFor = (c) => (lags[c]?.length >= 2 ? mean(lags[c]) : globalLag);

  /* --- open AR --- */
  const claimed = new Set(cleared.flatMap((m) => m.invoiceIds));
  const open = batch.ledger
    .filter((l) => !claimed.has(l.id))
    .map((l) => ({
      ...l,
      lag: lagFor(l.customer),
      expected: l.dueDate + Math.round(lagFor(l.customer)) * day,
      learned: (lags[l.customer]?.length || 0) >= 2,
    }));

  /* --- horizon --- */
  const start = Math.max(...batch.bank.map((b) => b.date), Date.UTC(2026, 5, 1));
  const N = 75;
  const totalAR = batch.ledger.reduce((s, l) => s + l.amount, 0);
  const payroll = Math.round((totalAR * payrollRate) / 1000) * 1000;
  const rent = Math.round((totalAR * 0.035) / 500) * 500;
  const floor = Math.round((totalAR * 0.04) / 1000) * 1000;
  const opening = Math.round((totalAR * 0.11) / 1000) * 1000;

  const outflowsOn = (t) => {
    const d = new Date(t).getUTCDate();
    let o = 0;
    const items = [];
    if (d === 15) {
      o += payroll;
      items.push({ label: "Payroll", amt: payroll });
    }
    if (d === 1) {
      o += rent;
      items.push({ label: "Rent & fixed", amt: rent });
    }
    return { o, items };
  };

  function curve(overrides = {}) {
    let bal = opening;
    const days = [];
    for (let i = 0; i < N; i++) {
      const t = start + i * day;
      const inflow = open
        .filter((l) => {
          const e = overrides[l.id] ?? l.expected;
          return e >= t && e < t + day;
        })
        .reduce((s, l) => s + l.amount, 0);
      const { o, items } = outflowsOn(t);
      bal += inflow - o;
      days.push({ t, bal, inflow, outflow: o, items });
    }
    return days;
  }

  const days = curve();
  const breach = days.find((d) => d.bal < floor);
  const trough = days.reduce((a, b) => (b.bal < a.bal ? b : a), days[0]);

  /* --- counterfactual: which collections lift the trough? --- */
  let drivers = [];
  if (breach) {
    const pullTo = breach.t - day;
    drivers = open
      .filter((l) => l.expected > pullTo && l.amount > 0)
      .map((l) => {
        const alt = curve({ [l.id]: pullTo });
        const newTrough = alt.reduce((a, b) => (b.bal < a.bal ? b : a), alt[0]);
        const stillBreaches = alt.some((d) => d.bal < floor);
        return {
          inv: l,
          lift: newTrough.bal - trough.bal,
          clears: !stillBreaches,
        };
      })
      .filter((d) => d.lift > 0)
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 6);
  }

  return { days, floor, payroll, rent, opening, breach, trough, drivers, open, globalLag, curve, pullTo: breach ? breach.t - day : null };
}

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
      <div style={{ padding: 40, fontFamily: MONO, fontSize: 12, color: T.dim }}>
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
                <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em" }}>
                  You break the floor on{" "}
                  <span style={{ color: T.bad }}>
                    {new Date(f.breach.t).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11.5, color: T.muted, marginTop: 6 }}>
                  Trough {fmt(f.trough.bal)} against a {fmt(f.floor)} floor · payroll{" "}
                  {fmt(f.payroll)} on the 15th
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em" }}>
                  Cash holds through the horizon
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11.5, color: T.muted, marginTop: 6 }}>
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
                fontSize: 10,
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
                fontSize: 9.5,
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
          <text x={padL - 8} y={y(f.floor) + 3} textAnchor="end" fontFamily={MONO} fontSize={9} fill={T.bad}>
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
                fontSize={9}
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
              fontSize={9}
              fill={T.dim}
            >
              {"$" + Math.round(v / 1000) + "k"}
            </text>
          ))}
        </svg>
      </div>

      {/* drivers */}
      <div style={{ ...PANEL, width: 300, flexShrink: 0, padding: 22 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: T.dim }}>
          {f.breach ? "COLLECTIONS THAT FIX IT" : "LARGEST OPEN POSITIONS"}
        </div>

        {f.breach && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
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
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                  <span>{d.inv.customer}</span>
                  <span>{fmt(d.inv.amount)}</span>
                </div>
                <div style={{ fontSize: 10, color: T.dim, marginTop: 4 }}>
                  {d.inv.ref} · expected{" "}
                  {new Date(d.inv.expected).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {d.inv.learned ? ` · lag ${Math.round(d.inv.lag)}d` : " · lag est."}
                </div>
                {d.lift > 0 && (
                  <div style={{ fontSize: 10.5, color: d.clears ? T.ok : T.gold, marginTop: 6 }}>
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
            fontSize: 10,
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

/* ============================================================
   LANDING PAGE
   Scroll narrative. The hero background is the real matcher
   running on real generated data — not decoration.
   ============================================================ */

function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : "translateY(22px)",
        transition: `opacity .7s ease ${delay}s, transform .7s cubic-bezier(.2,.7,.3,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* live hero graph — runs the actual tiers */
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

const Eyebrow = ({ children }) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 10,
      letterSpacing: "0.2em",
      color: T.gold,
      marginBottom: 18,
    }}
  >
    {children}
  </div>
);

const H2 = ({ children }) => (
  <h2
    style={{
      fontSize: "clamp(28px, 3.4vw, 44px)",
      fontWeight: 800,
      letterSpacing: "-0.035em",
      lineHeight: 1.08,
      margin: 0,
      color: T.text,
    }}
  >
    {children}
  </h2>
);

const Body = ({ children, w = 620 }) => (
  <p
    style={{
      fontSize: 16.5,
      lineHeight: 1.75,
      color: T.muted,
      maxWidth: w,
      margin: "20px 0 0",
    }}
  >
    {children}
  </p>
);


/* ============================================================
   BACKDROP LAYERS
   One fixed canvas behind the whole page. Each scroll section
   crossfades to the visual that belongs to it.
   ============================================================ */

const rndSeq = (n, seed) => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => r());
};

/* 1 — drifting ledger columns, mismatches flagged */
function BackDrift() {
  const rows = useMemo(() => {
    const r = rndSeq(120, 11);
    return Array.from({ length: 40 }, (_, i) => ({
      a: (r[i] * 9000 + 300).toFixed(2),
      b: (r[i + 40] * 9000 + 300).toFixed(2),
      bad: r[i + 80] < 0.22,
    }));
  }, []);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-30% 0",
          display: "flex",
          justifyContent: "center",
          gap: "18vw",
          animation: "drift 44s linear infinite",
        }}
      >
        {[0, 1].map((col) => (
          <div key={col} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.concat(rows).map((x, i) => (
              <span
                key={i}
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: x.bad ? "rgba(229,72,77,.5)" : "rgba(160,160,160,.16)",
                }}
              >
                {col ? "INV " : "BNK "}
                {col ? x.b : x.a}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* 2 — funnel: many in, few out */
function BackFunnel() {
  const cols = [46, 20, 8];
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {cols.map((n, band) =>
        Array.from({ length: n }, (_, i) => {
          const x = 80 + (i / (n - 1 || 1)) * 640;
          const y = 90 + band * 120;
          return (
            <g key={band + "-" + i}>
              <circle
                cx={x}
                cy={y}
                r={2}
                fill={[T.exact, T.fuzzy, T.llm][band]}
                opacity={0.5}
                style={{ animation: `pulse ${3 + (i % 5) * 0.4}s ease-in-out infinite` }}
              />
              {band < 2 && i < cols[band + 1] && (
                <line
                  x1={x}
                  y1={y + 4}
                  x2={80 + (i / (cols[band + 1] - 1 || 1)) * 640}
                  y2={y + 116}
                  stroke={[T.exact, T.fuzzy][band]}
                  strokeWidth={0.4}
                  opacity={0.22}
                />
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

/* 3 — confidence scatter with a sweeping threshold */
function BackScatter() {
  const pts = useMemo(() => rndSeq(220, 23), []);
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {Array.from({ length: 110 }, (_, i) => {
        const c = 0.35 + pts[i] * 0.6;
        return (
          <circle
            key={i}
            cx={70 + c * 660}
            cy={40 + pts[i + 110] * 340}
            r={2.4}
            fill={c < 0.55 ? "rgba(229,72,77,.45)" : T.gold}
            opacity={c < 0.55 ? 0.5 : 0.35}
          />
        );
      })}
      <line
        x1={0}
        y1={20}
        x2={0}
        y2={400}
        stroke={T.gold}
        strokeWidth={1.2}
        strokeDasharray="5 4"
        opacity={0.55}
        style={{ animation: "sweep 9s ease-in-out infinite" }}
      />
    </svg>
  );
}

/* 4 — cash curve crossing a floor */
function BackCurve() {
  const d = useMemo(() => {
    const r = rndSeq(60, 31);
    let bal = 250;
    const pts = [];
    for (let i = 0; i < 60; i++) {
      bal += r[i] * 40 - 16;
      if (i === 22 || i === 44) bal -= 130;
      pts.push([i * (800 / 59), 380 - Math.max(bal, 20) * 0.8]);
    }
    return pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  }, []);
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <line x1={0} y1={300} x2={800} y2={300} stroke={T.bad} strokeWidth={1} strokeDasharray="6 5" opacity={0.4} />
      <path
        d={d}
        fill="none"
        stroke={T.gold}
        strokeWidth={1.6}
        opacity={0.45}
        strokeDasharray="2400"
        style={{ animation: "draw 11s ease-out infinite" }}
      />
    </svg>
  );
}

/* 5 — edges resolving green */
function BackResolve() {
  const rows = 26;
  return (
    <svg
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {Array.from({ length: rows }, (_, i) => {
        const y1 = 30 + i * 14;
        const y2 = 30 + ((i * 7) % rows) * 14;
        return (
          <path
            key={i}
            d={`M 170 ${y1} C 400 ${y1}, 400 ${y2}, 630 ${y2}`}
            fill="none"
            stroke="#6EE7A8"
            strokeWidth={0.6}
            opacity={0}
            strokeDasharray="600"
            style={{ animation: `resolve 7s ease-out ${(i % 9) * 0.35}s infinite` }}
          />
        );
      })}
      {Array.from({ length: rows }, (_, i) => (
        <g key={"n" + i}>
          <circle cx={170} cy={30 + i * 14} r={1.8} fill="rgba(160,160,160,.4)" />
          <circle cx={630} cy={30 + i * 14} r={1.8} fill="rgba(160,160,160,.4)" />
        </g>
      ))}
    </svg>
  );
}

function Backdrop({ active }) {
  const layers = [
    <HeroGraph key="h" />,
    <BackDrift key="d" />,
    <BackFunnel key="f" />,
    <BackScatter key="s" />,
    <BackCurve key="c" />,
    <BackResolve key="r" />,
    <BackFunnel key="f2" />,
  ];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      {layers.map((l, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            opacity: active === i ? 1 : 0,
            transition: "opacity 1s ease",
          }}
        >
          {l}
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(5,5,5,.9) 26%, rgba(5,5,5,.74) 58%, rgba(5,5,5,.5) 100%)",
        }}
      />
    </div>
  );
}

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

export default function App() {
  const [mode, setMode] = useState("landing");
  return mode === "landing" ? (
    <Landing onLaunch={() => setMode("app")} />
  ) : (
    <Console onBack={() => setMode("landing")} />
  );
}