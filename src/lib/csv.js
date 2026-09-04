/* CSV import.

   A deliberate caveat lives here. Every accuracy number this project reports -
   precision, false matches, the red dots in the confidence view - is scored
   against ground truth planted by the generator. Uploaded data has no answer
   key, so those numbers are not merely unknown, they are uncomputable.

   The import therefore returns `truth: []` and the console switches grading
   off and says so, rather than scoring every match as wrong (which is what a
   naive `scoreMatch` against an empty truth array would do) or quietly
   printing a 100% that means nothing. Match rate still works - it only counts
   what cleared - but precision does not, and pretending otherwise would
   undercut the one claim the project is actually built on. */

const day = 86400000;

/* --- a small RFC-4180-ish parser: quoted fields, doubled quotes, CRLF --- */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, ""); /* strip BOM */

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const norm = (h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/* Header aliases, so a real export does not have to be renamed by hand. */
const ALIAS = {
  id: ["id", "transactionid", "txnid", "reference2", "recordid", "invoiceid", "invoiceno", "invoicenumber"],
  amount: ["amount", "value", "amt", "credit", "amountusd", "total", "gross"],
  date: ["date", "valuedate", "postingdate", "transactiondate", "bookingdate", "paymentdate"],
  ref: ["ref", "reference", "narrative", "description", "details", "memo", "remittanceinfo"],
  counterparty: ["counterparty", "payer", "originator", "remitter", "fromaccount", "name", "customer"],
  customer: ["customer", "client", "account", "debtor", "billto", "counterparty", "name"],
  issueDate: ["issuedate", "invoicedate", "date", "created"],
  dueDate: ["duedate", "due", "maturity", "paymentdue"],
  currency: ["currency", "ccy", "curr"],
};

function indexer(header) {
  const cols = header.map(norm);
  return (field) => {
    for (const a of ALIAS[field] || [field]) {
      const i = cols.indexOf(a);
      if (i !== -1) return i;
    }
    return -1;
  };
}

const money = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

const when = (v, fallback) => {
  const t = Date.parse(String(v ?? "").trim());
  return Number.isFinite(t) ? t : fallback;
};

function parseBank(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("bank CSV has no data rows");
  const at = indexer(rows[0]);
  const iId = at("id");
  const iAmt = at("amount");
  if (iAmt === -1) throw new Error("bank CSV needs an amount column");
  const iDate = at("date");
  const iRef = at("ref");
  const iCp = at("counterparty");
  const base = Date.UTC(2026, 5, 1);

  const out = [];
  rows.slice(1).forEach((r, k) => {
    const amount = money(r[iAmt]);
    if (!Number.isFinite(amount)) return;
    out.push({
      id: (iId !== -1 && r[iId]?.trim()) || `BNK-${9000 + k}`,
      amount,
      date: when(r[iDate], base + k * day),
      ref: (iRef !== -1 && r[iRef]?.trim()) || "",
      counterparty: (iCp !== -1 && r[iCp]?.trim()) || "UNKNOWN",
      currency: "USD",
    });
  });
  if (!out.length) throw new Error("bank CSV produced no usable rows");
  return out.sort((a, b) => a.date - b.date);
}

function parseLedger(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("ledger CSV has no data rows");
  const at = indexer(rows[0]);
  const iId = at("id");
  const iAmt = at("amount");
  if (iAmt === -1) throw new Error("ledger CSV needs an amount column");
  const iRef = at("ref");
  const iCust = at("customer");
  const iIssue = at("issueDate");
  const iDue = at("dueDate");
  const base = Date.UTC(2026, 5, 1);

  const out = [];
  rows.slice(1).forEach((r, k) => {
    const amount = money(r[iAmt]);
    if (!Number.isFinite(amount)) return;
    const id = (iId !== -1 && r[iId]?.trim()) || `INV-${4400 + k}`;
    const issue = when(r[iIssue], base + k * day);
    out.push({
      id,
      ref: (iRef !== -1 && r[iRef]?.trim()) || id,
      customer: (iCust !== -1 && r[iCust]?.trim()) || "UNKNOWN",
      amount,
      issueDate: issue,
      dueDate: when(r[iDue], issue + 30 * day),
      currency: "USD",
    });
  });
  if (!out.length) throw new Error("ledger CSV produced no usable rows");
  return out;
}

/* → a batch in exactly the generator's shape, minus the answer key */
function batchFromCsv(bankText, ledgerText) {
  return { bank: parseBank(bankText), ledger: parseLedger(ledgerText), truth: [], source: "csv" };
}

/* Sample exports, so the expected shape is discoverable without documentation. */
function toCsv(rows, cols) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

const iso = (t) => new Date(t).toISOString().slice(0, 10);

function bankCsv(bank) {
  return toCsv(
    bank.map((b) => ({ ...b, date: iso(b.date) })),
    ["id", "date", "amount", "currency", "ref", "counterparty"]
  );
}

function ledgerCsv(ledger) {
  return toCsv(
    ledger.map((l) => ({ ...l, issueDate: iso(l.issueDate), dueDate: iso(l.dueDate) })),
    ["id", "ref", "customer", "amount", "issueDate", "dueDate", "currency"]
  );
}

export { batchFromCsv, parseBank, parseLedger, parseCsv, bankCsv, ledgerCsv };
