/* Leakage analysis — the pass that looks for money rather than for matches.

   Reconciliation answers "does this tie out". This answers "what is it costing
   you that it does not". Both read the same cleared matches, but they ask
   different questions: matching is per-wire, leakage is per-counterparty and
   across the batch, which is where systematic problems actually show up.

   Every finding carries the ids it was derived from, so nothing here is a
   number you have to take on trust — the view can list the exact records, and
   an auditor can check them.

   Nothing in here is a model. It is arithmetic over reconciled pairs, which
   means it is explainable line by line and costs nothing to run. */

const day = 86400000;
const round2 = (n) => Math.round(n * 100) / 100;
const normName = (n) =>
  (n || "").toUpperCase().replace(/[^A-Z ]/g, "").replace(/\b(LTD|PVT|INC|LLC)\b/g, "").trim();

/* One reconciled pair: what was billed, what actually arrived, and the gap. */
function pairsFrom(batch, cleared) {
  const byBank = new Map(batch.bank.map((b) => [b.id, b]));
  const byInv = new Map(batch.ledger.map((l) => [l.id, l]));
  const out = [];
  for (const m of cleared) {
    const b = byBank.get(m.bankId);
    const invs = m.invoiceIds.map((id) => byInv.get(id)).filter(Boolean);
    if (!b || !invs.length) continue;
    const billed = invs.reduce((s, l) => s + l.amount, 0);
    out.push({
      bankId: b.id,
      invoiceIds: invs.map((l) => l.id),
      customer: invs[0].customer,
      billed: round2(billed),
      received: round2(b.amount),
      gap: round2(b.amount - billed), /* negative = you got less than you billed */
      date: b.date,
      dueDate: Math.max(...invs.map((l) => l.dueDate)),
    });
  }
  return out;
}

/* contractedRate: the fee you believe you agreed to. Anything above it is
   either a fee you did not expect or a flat fee eating a small invoice. */
function findLeakage({ batch, matches, threshold = 0.7, contractedRate = 0.02 }) {
  const cleared = matches.filter((m) => m.confidence >= threshold);
  const pairs = pairsFrom(batch, cleared);
  const findings = [];

  /* --- 1. systematic short payment, per counterparty ------------------- */
  const byCustomer = new Map();
  for (const p of pairs) {
    const k = normName(p.customer);
    if (!byCustomer.has(k)) byCustomer.set(k, { name: p.customer, all: [], short: [] });
    const e = byCustomer.get(k);
    e.all.push(p);
    if (p.gap < -0.5) e.short.push(p);
  }
  for (const e of byCustomer.values()) {
    if (e.short.length < 2) continue;
    const total = round2(e.short.reduce((s, p) => s + p.gap, 0));
    const billed = e.short.reduce((s, p) => s + p.billed, 0);
    const pct = billed ? Math.abs(total / billed) : 0;
    findings.push({
      kind: "short-pay",
      title: `${e.name} short-paid ${e.short.length} of ${e.all.length} settlements`,
      detail: `Consistently remits about ${(pct * 100).toFixed(2)}% less than billed. Either an unbilled fee or a deduction nobody agreed to.`,
      amount: Math.abs(total),
      counterparty: e.name,
      ids: e.short.map((p) => p.bankId),
      severity: Math.abs(total),
    });
  }

  /* --- 2. deductions above the contracted rate ------------------------- */
  const over = pairs
    .filter((p) => p.gap < -0.5 && p.billed > 0 && Math.abs(p.gap) / p.billed > contractedRate + 0.0005)
    .map((p) => ({ ...p, rate: Math.abs(p.gap) / p.billed }));
  if (over.length) {
    const excess = round2(
      over.reduce((s, p) => s + (Math.abs(p.gap) - p.billed * contractedRate), 0)
    );
    const worst = over.reduce((a, b) => (b.rate > a.rate ? b : a), over[0]);
    findings.push({
      kind: "fee-overcharge",
      title: `${over.length} settlements deducted more than ${(contractedRate * 100).toFixed(2)}%`,
      detail: `Worst is ${worst.bankId} at ${(worst.rate * 100).toFixed(2)}%. A flat fee on a small invoice costs far more in percentage terms — that is where margin quietly goes.`,
      amount: Math.abs(excess),
      ids: over.map((p) => p.bankId),
      severity: Math.abs(excess),
    });
  }

  /* --- 3. possible duplicate credits ----------------------------------- */
  const seen = new Map();
  const dupes = [];
  for (const b of batch.bank) {
    const k = `${normName(b.counterparty)}|${b.amount.toFixed(2)}`;
    const prior = seen.get(k);
    if (prior && Math.abs(b.date - prior.date) <= 6 * day) dupes.push([prior.id, b.id, b.amount]);
    else seen.set(k, b);
  }
  if (dupes.length) {
    findings.push({
      kind: "duplicate",
      title: `${dupes.length} possible duplicate credit${dupes.length === 1 ? "" : "s"}`,
      detail: `Same counterparty, same amount, within six days. Either a genuine repeat payment or the same settlement booked twice — worth a look before either is applied.`,
      amount: round2(dupes.reduce((s, d) => s + d[2], 0)),
      ids: dupes.flatMap((d) => [d[0], d[1]]),
      severity: round2(dupes.reduce((s, d) => s + d[2], 0)) * 0.5,
    });
  }

  /* --- 4. money received that could not be attributed ------------------ */
  const matchedB = new Set(matches.map((m) => m.bankId));
  const orphans = batch.bank.filter((b) => !matchedB.has(b.id));
  if (orphans.length) {
    const total = round2(orphans.reduce((s, b) => s + b.amount, 0));
    findings.push({
      kind: "unattributed",
      title: `${orphans.length} credit${orphans.length === 1 ? "" : "s"} could not be attributed`,
      detail: `Cash is in the account with nothing to apply it to. Until it is matched it cannot be recognised as revenue, and the payer may well chase you for it.`,
      amount: total,
      ids: orphans.map((b) => b.id),
      severity: total,
    });
  }

  /* --- 5. aged receivable exposure ------------------------------------- */
  const claimed = new Set(cleared.flatMap((m) => m.invoiceIds));
  const asOf = Math.max(...batch.bank.map((b) => b.date), 0);
  const aged = batch.ledger
    .filter((l) => !claimed.has(l.id) && asOf > l.dueDate)
    .map((l) => ({ ...l, daysLate: Math.round((asOf - l.dueDate) / day) }));
  if (aged.length) {
    const total = round2(aged.reduce((s, l) => s + l.amount, 0));
    const worst = aged.reduce((a, b) => (b.daysLate > a.daysLate ? b : a), aged[0]);
    findings.push({
      kind: "aged",
      title: `${aged.length} invoice${aged.length === 1 ? "" : "s"} past due and still open`,
      detail: `Oldest is ${worst.ref} at ${worst.daysLate} days past due. This is the exposure the cash forecast is projecting against.`,
      amount: total,
      ids: aged.map((l) => l.id),
      severity: total * 0.6,
    });
  }

  findings.sort((a, b) => b.severity - a.severity);

  return {
    findings,
    pairs,
    recoverable: round2(
      findings
        .filter((f) => f.kind === "short-pay" || f.kind === "fee-overcharge" || f.kind === "duplicate")
        .reduce((s, f) => s + f.amount, 0)
    ),
    exposure: round2(
      findings.filter((f) => f.kind === "aged" || f.kind === "unattributed").reduce((s, f) => s + f.amount, 0)
    ),
  };
}

export { findLeakage, pairsFrom };
