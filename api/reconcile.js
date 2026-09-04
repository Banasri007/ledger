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

import { activeProvider, reasonOverResidual } from "./_model.js";

const MAX_WIRES = 40;
const MAX_INVOICES = 140;

function bad(res, status, error, detail, message) {
  return res
    .status(status)
    .json({ error, message: message || null, detail: detail || null, provider: activeProvider() });
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

  if (!activeProvider()) {
    /* not the user's mistake — the client reads this as "run the stub" */
    return bad(
      res,
      503,
      "no_key",
      "no provider key on the server",
      "No model key configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY — deterministic fallback in use."
    );
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
    /* "http_400" tells nobody anything. The three failures that actually
       happen in practice - no credit, bad key, rate limit - each need a
       different action from whoever is standing in front of the demo, so
       name them. Classify by status, then refine the 400 by message, since
       the billing case is a 400 that only its message identifies. */
    const status = e?.status;
    const msg = String(e?.message || e);
    let code = e?.code || "provider_error";
    let human = "The reasoning tier could not run.";

    if (status === 401 || status === 403) {
      code = "bad_key";
      human = `The API key was rejected. Check ${
        activeProvider() === "groq" ? "GROQ_API_KEY" : "ANTHROPIC_API_KEY"
      }.`;
    } else if (status === 429) {
      code = "rate_limited";
      human = "Rate limited by the API. Wait a moment and re-run.";
    } else if (status === 529 || status === 503) {
      code = "overloaded";
      human = "The API is overloaded. Re-run in a moment.";
    } else if (status === 400 && /credit balance is too low/i.test(msg)) {
      code = "no_credit";
      human =
        "The Anthropic account has no credit. Add credits at console.anthropic.com under Plans & Billing — the key itself is fine.";
    } else if (status === 404 && /model/i.test(msg)) {
      code = "bad_model";
      human = "That model id is not available on this provider. Check LEDGER_MODEL.";
    } else if (status === 400) {
      code = "bad_request";
      human = "The API rejected the request shape.";
    } else if (e?.code === "refusal") {
      human = "The model declined this request.";
    }

    return res
      .status(502)
      .json({ error: code, message: human, detail: msg, provider: activeProvider() });
  }
}
