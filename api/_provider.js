/* The model call for tier 3, deliberately isolated.

   Everything provider-specific lives in this file. If you ever move off
   Anthropic (Groq, for instance, which serves Llama rather than Claude), this
   is the only file that changes - `reasonOverResidual` keeps its signature and
   nothing upstream notices.

   Two things matter about what gets sent:

   1. Only the RESIDUAL goes to the model. Tiers 0-2 have already cleared the
      bulk arithmetically, so this call sees a dozen genuinely ambiguous wires
      rather than the whole batch. That is the cost argument the whole tiered
      architecture rests on, and the meter in the response makes it checkable.

   2. The response is schema-constrained, not parsed out of prose. A finance
      tool that regex-scrapes an LLM's paragraph for invoice numbers is one bad
      sentence away from booking the wrong match. */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MODEL = process.env.LEDGER_MODEL || "claude-opus-5";

/* $ per million tokens, for the cost meter. Opus 5 rates. */
const PRICE = { in: 5.0, out: 25.0, cacheRead: 0.5 };

const Decision = z.object({
  bankId: z.string(),
  invoiceIds: z.array(z.string()),
  confidence: z.number(),
  reason: z.string(),
});
const Result = z.object({ matches: z.array(Decision) });

const SYSTEM = `You are the reasoning tier of a bank-to-ledger reconciliation engine.

Two deterministic tiers have already run and cleared everything that matched on
exact reference plus amount, or on a fuzzy score over amount, reference,
counterparty and date. What reaches you is the residual: wires those tiers could
not resolve confidently. Expect genuinely ambiguous cases.

The noise present in this data:
- wire fees deducted from the remitted amount (commonly 15, 25, 30 or 42.50)
- FX rounding drift, up to about 0.4% of the amount
- reference drift: INV-4471 may arrive as inv4471, PMT/4471, REF 4471 or BULK PAYMENT
- counterparty name variants: casing, Pvt/Ltd/LLC suffixes, concatenation
- payment date skew of a few days either side of the invoice date
- one wire settling SEVERAL invoices from the same customer (report every invoice id)
- one invoice settled by two part-payments (each wire matches the same invoice)
- some wires are genuine orphans that settle nothing at all

Rules:
- Return one entry per wire you were given, in the same order.
- If nothing fits, return an empty invoiceIds array. An honest non-match is
  worth more than a guess: a wrong match costs more than a missed one, because
  a human then has to re-check everything.
- Only ever cite invoice ids that appear in that wire's candidate list.
- confidence is 0 to 1 and must reflect real uncertainty. Reserve above 0.9 for
  cases where the arithmetic actually closes. When two candidates both fit
  inside tolerance, say so and score it below 0.7 so it escalates.
- reason is one sentence naming the concrete evidence - the fee, the drift, the
  name variant, the subset that sums. Not "high similarity".`;

function buildPrompt(wires, candidatesFor) {
  const lines = wires.map((w) => {
    const cands = candidatesFor(w) || [];
    const rows = cands.length
      ? cands
          .map(
            (c) =>
              `      ${c.id}  ${c.amount.toFixed(2)}  ${c.customer}  due ${c.dueDate}`
          )
          .join("\n")
      : "      (no open invoice from a similar counterparty)";
    return [
      `  WIRE ${w.id}`,
      `    amount      ${w.amount.toFixed(2)}`,
      `    counterparty ${w.counterparty}`,
      `    reference   ${w.ref}`,
      `    value date  ${w.date}`,
      `    candidates:`,
      rows,
    ].join("\n");
  });

  return `Resolve each of these ${wires.length} unmatched wires against its candidate invoices.\n\n${lines.join(
    "\n\n"
  )}`;
}

/* → { matches, meter } — throws on transport/auth failure so the caller can
   decide whether to fall back. */
async function reasonOverResidual({ wires, candidatesFor, effort = "high" }) {
  const client = new Anthropic(); /* reads ANTHROPIC_API_KEY from the env */
  const started = Date.now();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: {
      effort,
      format: zodOutputFormat(Result),
    },
    messages: [{ role: "user", content: buildPrompt(wires, candidatesFor) }],
  });

  const ms = Date.now() - started;

  if (response.stop_reason === "refusal") {
    const err = new Error("model declined the request");
    err.code = "refusal";
    err.detail = response.stop_details || null;
    throw err;
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    const err = new Error("model returned no parseable output");
    err.code = "unparseable";
    throw err;
  }

  const u = response.usage || {};
  const inTok = u.input_tokens || 0;
  const outTok = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const cost =
    (inTok / 1e6) * PRICE.in +
    (outTok / 1e6) * PRICE.out +
    (cacheRead / 1e6) * PRICE.cacheRead;

  return {
    matches: parsed.matches,
    meter: {
      model: response.model || MODEL,
      ms,
      inputTokens: inTok,
      outputTokens: outTok,
      cacheReadTokens: cacheRead,
      costUsd: Math.round(cost * 1e6) / 1e6,
      wires: wires.length,
    },
  };
}

export { reasonOverResidual, MODEL };
