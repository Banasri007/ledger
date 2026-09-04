/* Build the context the Q&A endpoint is allowed to answer from.

   Everything the model may say has to be in here, so this is the file that
   decides what it can and cannot know. Keys are short because every one of
   them is paid for on every question, and the whole batch has to fit.

   Ground truth is deliberately absent. The answer key never leaves the engine,
   so the model cannot quietly answer "was this match right?" by reading it —
   the same discipline the reasoning tier follows. */

const round2 = (n) => Math.round(n * 100) / 100;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

const CAP = { matches: 70, exceptions: 45, open: 70 };

function buildAskContext({ batch, matches, stats, threshold, difficulty, seed, leakage }) {
  const byBank = new Map(batch.bank.map((b) => [b.id, b]));
  const byInv = new Map(batch.ledger.map((l) => [l.id, l]));
  const cleared = matches.filter((m) => m.confidence >= threshold);
  const graded = batch.truth.length > 0;

  return {
    summary: {
      source: graded ? `generated, noise ${difficulty}, seed ${seed}` : "uploaded CSV (no answer key)",
      credits: batch.bank.length,
      invoices: batch.ledger.length,
      threshold,
      cleared: stats.cleared,
      escalated: stats.escalated,
      noCandidate: stats.unresolvedBank.length,
      openInvoices: stats.openInv.length,
      matchRate: round2(stats.rate),
      precision: graded ? round2(stats.precision) : null,
      precisionNote: graded
        ? "measured against planted ground truth"
        : "not computable — uploaded data has no answer key",
      tiers: {
        learned: matches.filter((m) => m.tier === 0).length,
        exact: matches.filter((m) => m.tier === 1).length,
        fuzzy: matches.filter((m) => m.tier === 2).length,
        reasoned: matches.filter((m) => m.tier === 3).length,
      },
    },

    /* b=credit id, cp=counterparty, amt=received, inv=invoices applied,
       billed=their total, gap=received-billed, t=tier, c=confidence */
    matches: cleared.slice(0, CAP.matches).map((m) => {
      const b = byBank.get(m.bankId);
      const invs = m.invoiceIds.map((i) => byInv.get(i)).filter(Boolean);
      const billed = round2(invs.reduce((s, l) => s + l.amount, 0));
      return {
        b: m.bankId,
        cp: b?.counterparty,
        amt: b?.amount,
        date: b ? iso(b.date) : null,
        inv: m.invoiceIds,
        billed,
        gap: round2((b?.amount || 0) - billed),
        t: ["learned", "exact", "fuzzy", "reasoned"][m.tier],
        c: m.confidence,
        why: m.reason,
      };
    }),

    exceptions: stats.exceptions.slice(0, CAP.exceptions).map((e) => ({
      id: e.id,
      kind: e.kind,
      amt: e.amount,
      c: e.conf || 0,
      why: e.detail,
    })),

    openInvoices: stats.openInv.slice(0, CAP.open).map((l) => ({
      id: l.id,
      cust: l.customer,
      amt: l.amount,
      due: iso(l.dueDate),
    })),

    leakage: (leakage?.findings || []).map((f) => ({
      kind: f.kind,
      title: f.title,
      amount: f.amount,
      ids: f.ids.slice(0, 20),
    })),
  };
}

export { buildAskContext };
