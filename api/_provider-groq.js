/* The model call for tier 3, Groq edition.

   Same `reasonOverResidual` signature as the Anthropic provider, so nothing
   upstream knows or cares which one is running. Raw REST rather than an SDK:
   this is one POST to an OpenAI-compatible endpoint, and keeping it dependency
   free means switching providers adds nothing to install.

   Groq's gpt-oss models support response_format json_schema with strict:true,
   which is constrained decoding - the same guarantee the Anthropic path gets
   from zodOutputFormat. That matters more than it sounds: it is the difference
   between a reconciliation engine that parses a schema and one that regexes
   invoice numbers out of a paragraph. */

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/* gpt-oss-120b is the strongest of the models that support strict mode.
   gpt-oss-20b is the faster, cheaper alternative if latency matters more. */
const MODEL = process.env.LEDGER_MODEL || "openai/gpt-oss-120b";

/* Groq's published rates are not machine-readable, and inventing a number in a
   project about honest measurement would be self-defeating. Set these to show
   dollars in the meter; leave them unset and it reports tokens and latency
   only, with cost shown as unknown. */
const priceIn = Number(process.env.LEDGER_PRICE_IN);
const priceOut = Number(process.env.LEDGER_PRICE_OUT);

const SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bankId: { type: "string" },
          invoiceIds: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["bankId", "invoiceIds", "confidence", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
};

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
  name variant, the subset that sums. Not "high similarity".

Reply with JSON only, matching the provided schema.`;

function buildPrompt(wires, candidatesFor) {
  const lines = wires.map((w) => {
    const cands = candidatesFor(w) || [];
    const rows = cands.length
      ? cands
          .map((c) => `      ${c.id}  ${c.amount.toFixed(2)}  ${c.customer}  due ${c.dueDate}`)
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

async function reasonOverResidual({ wires, candidatesFor }) {
  const started = Date.now();

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0, /* reconciliation is not a creative task */
      max_tokens: 8000,
      response_format: {
        type: "json_schema",
        json_schema: { name: "reconciliation", strict: true, schema: SCHEMA },
      },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildPrompt(wires, candidatesFor) },
      ],
    }),
  });

  const ms = Date.now() - started;
  const text = await res.text();

  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text)?.error?.message || text;
    } catch {
      /* keep the raw body */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error("provider returned non-JSON");
    err.code = "unparseable";
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const err = new Error("model output was not valid JSON");
    err.code = "unparseable";
    throw err;
  }
  if (!parsed || !Array.isArray(parsed.matches)) {
    const err = new Error("model output had no matches array");
    err.code = "unparseable";
    throw err;
  }

  const u = data.usage || {};
  const inTok = u.prompt_tokens || 0;
  const outTok = u.completion_tokens || 0;
  const known = Number.isFinite(priceIn) && Number.isFinite(priceOut);
  const cost = known ? (inTok / 1e6) * priceIn + (outTok / 1e6) * priceOut : null;

  return {
    matches: parsed.matches,
    meter: {
      provider: "groq",
      model: data.model || MODEL,
      ms,
      inputTokens: inTok,
      outputTokens: outTok,
      cacheReadTokens: 0,
      costUsd: cost === null ? null : Math.round(cost * 1e6) / 1e6,
      wires: wires.length,
    },
  };
}

export { reasonOverResidual, MODEL };
