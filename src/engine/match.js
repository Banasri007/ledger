/* The matcher. Four tiers, one identical async signature:

     async function tierX(bank, ledger, cfg) -> Promise<Match[]>
     Match = { bankId, invoiceIds[], tier, confidence, reason, candidates }

   That uniformity is the most important interface decision here: the LLM
   tier can go from stub to live fetch() without touching anything above
   it, because every caller already awaits.

   invoiceIds is an array from day one - N:M is the actual hard problem in
   reconciliation, and retrofitting it would have touched every consumer.

   tierLLM is the only stub. See the note above it. */

import { day, fmt } from "../lib/format.js";
import { mulberry32 } from "../lib/random.js";

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

/* --- TIER 3 — REASONED -----------------------------------------------
   Calls the real model through /api/reconcile, which holds the API key
   server-side. Only the residual crosses the wire: the wires tiers 0-2 could
   not clear, plus the invoices still open. The planted answer key never
   leaves this file, so the model is genuinely being tested rather than being
   handed the answer.

   Falls back to the deterministic stub whenever the endpoint is unavailable -
   no key configured, offline, provider error. A demo should not die because
   the wifi did. cfg.onMeter receives the real cost and latency when the live
   path runs, and cfg.live === false forces the stub.
   -------------------------------------------------------------------- */
async function tierLLM(bank, ledger, cfg) {
  if (!bank.length) return [];

  if (cfg?.live !== false) {
    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wires: bank.map((b) => ({
            id: b.id,
            amount: b.amount,
            counterparty: b.counterparty,
            ref: b.ref,
            date: dstrShort(b.date),
          })),
          invoices: ledger.map((l) => ({
            id: l.id,
            amount: l.amount,
            customer: l.customer,
            dueDate: dstrShort(l.dueDate),
          })),
          effort: cfg?.effort,
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data && Array.isArray(data.matches)) {
        cfg?.onMeter?.({ ...data.meter, source: "live" });
        return data.matches;
      }
      cfg?.onMeter?.({
        source: "stub",
        reason: data?.error || `http_${res.status}`,
        message: data?.message || null,
        detail: data?.detail || null,
      });
    } catch (e) {
      cfg?.onMeter?.({ source: "stub", reason: "unreachable", detail: String(e?.message || e) });
    }
  } else {
    cfg?.onMeter?.({ source: "stub", reason: "live_disabled" });
  }

  return tierLLMStub(bank, ledger, cfg);
}

const dstrShort = (t) => new Date(t).toISOString().slice(0, 10);

/* --- the stub, kept as the fallback ----------------------------------
   Deliberately imperfect: ~15% wrong, so when it stands in for the real
   tier the accuracy numbers stay honest rather than flattering.
   -------------------------------------------------------------------- */
async function tierLLMStub(bank, ledger, cfg) {
  const { truth, seed } = cfg;
  /* The stub only "reasons" by reading the planted answer key. On uploaded
     data there is no key, so it has nothing to work from - returning random
     guesses there would be worse than returning nothing. */
  if (!truth || !truth.length) return [];
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

export { normRef, normName, nameScore, tierExact, tierFuzzy, subsetSum, tierLLM, tierLLMStub, digitsOf, tierLearned, mineRules, scoreMatch };
