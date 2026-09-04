/* The audit pack.

   Every other view here ends at a screen. This ends at a document — the thing
   a controller actually sends to their auditor, or keeps as the record of why
   the books were closed the way they were.

   Two deliberate choices:

   It is a light-themed, self-contained HTML file. Self-contained because an
   audit record with external dependencies stops being a record the moment the
   host goes away; light-themed because it exists to be printed or saved as PDF,
   and the console's palette prints as a black rectangle.

   It states its own methodology and limits at the bottom. A reconciliation
   report that shows a precision figure without saying how it was computed —
   or that quotes one for data with no answer key — is worse than one that
   shows nothing, because someone will act on it. */

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const iso = (t) => new Date(t).toISOString().slice(0, 10);
const pct = (x) => (x * 100).toFixed(1) + "%";

const TIER = { 0: "Learned", 1: "Exact", 2: "Fuzzy", 3: "Reasoned" };

function rows(list, cells) {
  return list.map((x) => `<tr>${cells(x).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n");
}

function buildAuditPack({
  batch,
  matches,
  stats,
  threshold,
  difficulty,
  seed,
  rules = [],
  resolved = [],
  leakage = null,
  meter = null,
}) {
  const generated = new Date();
  const cleared = matches.filter((m) => m.confidence >= threshold);
  const byBank = new Map(batch.bank.map((b) => [b.id, b]));
  const byInv = new Map(batch.ledger.map((l) => [l.id, l]));
  const source = batch.truth.length
    ? `Generated batch · noise level ${difficulty} · seed ${seed}`
    : "Uploaded CSV · no ground truth available";

  const tierCounts = [0, 1, 2, 3].map((t) => ({
    tier: t,
    n: matches.filter((m) => m.tier === t).length,
  }));

  const matchedRows = rows(
    cleared.slice().sort((a, b) => (byBank.get(b.bankId)?.amount || 0) - (byBank.get(a.bankId)?.amount || 0)),
    (m) => {
      const b = byBank.get(m.bankId);
      const invs = m.invoiceIds.map((i) => byInv.get(i)).filter(Boolean);
      const billed = invs.reduce((s, l) => s + l.amount, 0);
      const gap = (b?.amount || 0) - billed;
      return [
        esc(m.bankId),
        esc(b?.counterparty || ""),
        `<span class="num">${money(b?.amount || 0)}</span>`,
        esc(m.invoiceIds.join(", ")),
        `<span class="num">${money(billed)}</span>`,
        `<span class="num ${Math.abs(gap) > 0.005 ? "warn" : ""}">${money(gap)}</span>`,
        `<span class="tier t${m.tier}">${TIER[m.tier]}</span>`,
        m.confidence.toFixed(2),
        esc(m.reason),
      ];
    }
  );

  const exceptionRows = rows(stats.exceptions, (e) => [
    esc(e.id),
    esc(e.kind),
    `<span class="num">${money(e.amount || 0)}</span>`,
    e.conf ? e.conf.toFixed(2) : "—",
    esc(e.detail),
  ]);

  const decisionRows = resolved.length
    ? rows(resolved, (r) => [esc(r.bankId), esc(r.note), r.mined ? `${r.mined} rule(s) mined` : "—"])
    : `<tr><td colspan="3" class="empty">No analyst decisions recorded in this run.</td></tr>`;

  const ruleRows = rules.length
    ? rows(rules, (r) => [esc(r.type), esc(r.label)])
    : `<tr><td colspan="2" class="empty">No rules mined.</td></tr>`;

  const leakRows =
    leakage && leakage.findings.length
      ? rows(leakage.findings, (f) => [
          esc(f.kind),
          esc(f.title),
          `<span class="num">${money(f.amount)}</span>`,
          esc(f.ids.slice(0, 12).join(", ")) + (f.ids.length > 12 ? ` +${f.ids.length - 12} more` : ""),
        ])
      : `<tr><td colspan="4" class="empty">No leakage findings.</td></tr>`;

  const graded = batch.truth.length > 0;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Reconciliation audit pack — ${esc(iso(generated))}</title>
<style>
  *{box-sizing:border-box}
  body{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
       color:#16181d;background:#fff;margin:0;padding:44px 40px 64px;max-width:1180px}
  h1{font-size:23px;margin:0 0 4px;letter-spacing:-.02em}
  h2{font-size:15px;margin:36px 0 10px;padding-bottom:6px;border-bottom:1px solid #e3e6ea;letter-spacing:-.01em}
  .sub{color:#666e7a;font-size:12.5px;margin-bottom:26px}
  .grid{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0 4px}
  .kpi{border:1px solid #e3e6ea;border-radius:9px;padding:13px 16px;min-width:148px;flex:1}
  .kpi .l{font-size:10px;letter-spacing:.13em;color:#8a919c;text-transform:uppercase}
  .kpi .v{font-size:25px;font-weight:700;margin-top:5px;letter-spacing:-.03em}
  table{border-collapse:collapse;width:100%;margin-top:8px;font-size:12px}
  th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8a919c;
     border-bottom:1px solid #e3e6ea;padding:7px 8px;white-space:nowrap}
  td{padding:7px 8px;border-bottom:1px solid #f0f2f4;vertical-align:top}
  tr:nth-child(even) td{background:#fafbfc}
  .num{font-variant-numeric:tabular-nums;white-space:nowrap}
  .warn{color:#b4501f}
  .empty{color:#8a919c;font-style:italic}
  .tier{font-size:10.5px;padding:2px 7px;border-radius:4px;white-space:nowrap}
  .t0{background:#e6f7ee;color:#16794a}.t1{background:#eef0f3;color:#3d444e}
  .t2{background:#fdf3d9;color:#8a6212}
  .t3{background:#e2f6f4;color:#12706a}
  .note{border-left:3px solid #d8dce1;padding:10px 0 10px 15px;color:#4b525c;font-size:12.5px;margin-top:12px}
  .note b{color:#16181d}
  footer{margin-top:40px;padding-top:14px;border-top:1px solid #e3e6ea;color:#8a919c;font-size:11.5px}
  @media print{body{padding:0}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>

<h1>Reconciliation audit pack</h1>
<div class="sub">
  ${esc(source)} &nbsp;·&nbsp; auto-clear threshold ${threshold.toFixed(2)}
  &nbsp;·&nbsp; generated ${esc(generated.toISOString().replace("T", " ").slice(0, 19))} UTC
</div>

<div class="grid">
  <div class="kpi"><div class="l">Match rate</div><div class="v">${pct(stats.rate)}</div></div>
  <div class="kpi"><div class="l">Precision</div><div class="v">${graded ? pct(stats.precision) : "&mdash;"}</div></div>
  <div class="kpi"><div class="l">Cleared</div><div class="v">${stats.cleared}</div></div>
  <div class="kpi"><div class="l">Escalated</div><div class="v">${stats.escalated}</div></div>
  <div class="kpi"><div class="l">No candidate</div><div class="v">${stats.unresolvedBank.length}</div></div>
  <div class="kpi"><div class="l">Open AR</div><div class="v">${stats.openInv.length}</div></div>
</div>

<h2>How the batch was resolved</h2>
<table><thead><tr><th>Tier</th><th>Method</th><th>Matches</th></tr></thead><tbody>
${tierCounts
  .map(
    (t) =>
      `<tr><td><span class="tier t${t.tier}">${TIER[t.tier]}</span></td><td>${
        [
          "Rules mined from analyst decisions",
          "Normalised reference and amount agree exactly",
          "Scored on amount, reference, counterparty, date; bounded subset-sum for N:M",
          "Model reasoning over the residual only",
        ][t.tier]
      }</td><td class="num">${t.n}</td></tr>`
  )
  .join("\n")}
</tbody></table>
${meter && meter.source === "live"
  ? `<div class="note"><b>Reasoning tier:</b> ${esc(meter.provider || "")} ${esc(
      meter.model || ""
    )} saw ${meter.wires} of ${batch.bank.length} wires in ${(meter.ms / 1000).toFixed(
      1
    )}s (${meter.inputTokens} input / ${meter.outputTokens} output tokens).</div>`
  : `<div class="note"><b>Reasoning tier:</b> deterministic fallback — no live model was used for this run.</div>`}

<h2>Cleared matches (${cleared.length})</h2>
<table><thead><tr>
  <th>Credit</th><th>Counterparty</th><th>Received</th><th>Applied to</th>
  <th>Billed</th><th>Gap</th><th>Tier</th><th>Conf.</th><th>Basis</th>
</tr></thead><tbody>
${matchedRows || `<tr><td colspan="9" class="empty">Nothing cleared.</td></tr>`}
</tbody></table>

<h2>Exceptions (${stats.exceptions.length})</h2>
<table><thead><tr><th>Record</th><th>Reason</th><th>Value at risk</th><th>Conf.</th><th>Detail</th></tr></thead><tbody>
${exceptionRows || `<tr><td colspan="5" class="empty">No exceptions.</td></tr>`}
</tbody></table>

<h2>Analyst decisions</h2>
<table><thead><tr><th>Record</th><th>Decision</th><th>Outcome</th></tr></thead><tbody>
${decisionRows}
</tbody></table>

<h2>Rules applied</h2>
<table><thead><tr><th>Type</th><th>Rule</th></tr></thead><tbody>
${ruleRows}
</tbody></table>

<h2>Leakage findings</h2>
${leakage
  ? `<div class="grid">
      <div class="kpi"><div class="l">Recoverable</div><div class="v">${money(leakage.recoverable)}</div></div>
      <div class="kpi"><div class="l">Exposure</div><div class="v">${money(leakage.exposure)}</div></div>
     </div>`
  : ""}
<table><thead><tr><th>Type</th><th>Finding</th><th>Amount</th><th>Derived from</th></tr></thead><tbody>
${leakRows}
</tbody></table>

<h2>Methodology and limits</h2>
<div class="note">
  <b>How match rate is computed.</b> Cleared matches divided by total credits in the batch.
  A match is cleared when its confidence is at or above the auto-clear threshold
  (${threshold.toFixed(2)} for this run); below that it is escalated for review rather than applied.
</div>
<div class="note">
  <b>How precision is computed.</b> ${
    graded
      ? "This batch was generated with its ground truth planted alongside it, so precision is measured, not estimated. A match counts as correct only if its complete set of invoice ids equals the truth — a partially correct multi-invoice match counts as wrong."
      : "<b>Not computable for this run.</b> The data was uploaded and carries no answer key, so there is nothing to score against. Match rate remains meaningful because it only counts what cleared. Any precision figure for this data would be fabricated."
  }
</div>
<div class="note">
  <b>What is automated and what is not.</b> Tiers 0&ndash;2 are deterministic arithmetic and are
  reproducible from the inputs. Tier 3 calls a language model and is not deterministic: the same
  batch may resolve differently between runs. Analyst decisions listed above were made by a person
  selecting from ranked candidates, and the rules derived from them apply to every record of the
  same class, not only the record reviewed.
</div>
<div class="note">
  <b>Leakage findings are indicative.</b> They are arithmetic over reconciled pairs and flag
  patterns worth investigating &mdash; they are not an assertion that a counterparty is at fault.
  Each finding lists the records it was derived from so it can be checked.
</div>

<footer>
  Ledger &middot; reconciliation audit pack &middot; ${esc(source)} &middot;
  generated ${esc(generated.toISOString().slice(0, 19).replace("T", " "))} UTC
</footer>
</body></html>`;
}

function downloadAuditPack(args) {
  const html = buildAuditPack(args);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = `ledger-audit-pack-${stamp}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export { buildAuditPack, downloadAuditPack };
