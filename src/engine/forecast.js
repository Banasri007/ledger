/* Cash forecast, derived from reconciliation output rather than modelled
   separately. Payment lag is LEARNED from cleared matches, which is what
   makes the forecaster a genuine byproduct of the matcher: change the
   auto-clear threshold and the forecast moves, because fewer cleared
   matches means less lag data. */

import { day } from "../lib/format.js";

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

export { PAYROLL_DEFAULT, buildForecast };
