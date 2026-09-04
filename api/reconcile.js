/* POST /api/reconcile — tier 3.

   The client sends only the residual: the wires tiers 0-2 could not clear, plus
   the invoices still open. No ground truth ever crosses this boundary, which is
   the point — the answer key stays in the browser and is used only to grade the
   result afterwards, so the model is genuinely being tested rather than fed the
   answer the way the stub was.

   Failure is a first-class path here. If there is no key, or the API is
   unreachable, or the model declines, this returns a typed error and the client
   falls back to the deterministic stub. A demo should never die on stage
   because someone's wifi dropped. */

import { reasonOverResidual, MODEL } from "./_provider.js";

const MAX_WIRES = 40;
const MAX_INVOICES = 140;

function bad(res, status, error, detail) {
  return res.status(status).json({ error, detail: detail || null, model: MODEL });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "method_not_allowed");

  const body = req.body || {};
  const wires = Array.isArray(body.wires) ? body.wires : null;
  const invoices = Array.isArray(body.invoices) ? body.invoices : null;
  if (!wires || !invoices) return bad(res, 400, "bad_request", "expected { wires[], invoices[] }");

  /* an empty residual means tiers 0-2 cleared everything — nothing to reason
     about, and no reason to report a missing key */
  if (!wires.length) return res.status(200).json({ matches: [], meter: null });

  if (!process.env.ANTHROPIC_API_KEY) {
    /* not the user's mistake — the client reads this as "run the stub" */
    return bad(res, 503, "no_key", "ANTHROPIC_API_KEY is not set on the server");
  }

  if (wires.length > MAX_WIRES) return bad(res, 400, "too_many_wires", `max ${MAX_WIRES}`);
  if (invoices.length > MAX_INVOICES) return bad(res, 400, "too_many_invoices", `max ${MAX_INVOICES}`);

  const valid = new Set(invoices.map((i) => i.id));

  try {
    const { matches, meter } = await reasonOverResidual({
      wires,
      candidatesFor: () => invoices,
      effort: body.effort === "low" || body.effort === "medium" ? body.effort : "high",
    });

    /* Guard the model's output before it becomes a booked match. A real model
       can cite an invoice that was never offered; silently trusting that would
       put a fabricated id into the ledger. Drop them and report the count. */
    const seen = new Set();
    let invented = 0;
    let duplicated = 0;
    const clean = [];

    for (const m of matches) {
      const ids = [];
      for (const id of m.invoiceIds || []) {
        if (!valid.has(id)) {
          invented += 1;
          continue;
        }
        if (seen.has(id)) {
          duplicated += 1;
          continue;
        }
        ids.push(id);
      }
      if (!ids.length) continue; /* an honest non-match stays unresolved */
      ids.forEach((id) => seen.add(id));
      clean.push({
        bankId: m.bankId,
        invoiceIds: ids,
        tier: 3,
        confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0)),
        reason: String(m.reason || "").slice(0, 400),
        candidates: invoices.length,
      });
    }

    return res.status(200).json({
      matches: clean,
      meter: { ...meter, proposed: matches.length, kept: clean.length, invented, duplicated },
    });
  } catch (e) {
    const code = e?.code || (e?.status ? `http_${e.status}` : "provider_error");
    const status = e?.status === 401 || e?.status === 403 ? 502 : 502;
    return bad(res, status, code, e?.message || String(e));
  }
}
