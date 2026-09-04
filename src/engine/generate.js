/* Synthetic batch generator with PLANTED GROUND TRUTH.

   Synthetic is not the same as fake: without a planted answer key you
   cannot compute accuracy at all, only assert it. Every bank record knows
   which invoices it actually pays, and scoreMatch grades against that.

   Difficulty is additive - level 4 contains everything from 1-3 - so the
   degradation curve stays monotonic and explainable. */

import { day } from "../lib/format.js";
import { mulberry32 } from "../lib/random.js";

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

export { CUSTOMERS, nameVariant, refVariant, generateBatch };
