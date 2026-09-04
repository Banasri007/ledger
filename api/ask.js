/* POST /api/ask — grounded question answering over one reconciliation.

   This is deliberately not a chatbot bolted onto a dashboard. The difference
   that matters is what it is allowed to say:

   - it sees only the current reconciliation, passed as structured context
   - it must cite the record ids its answer rests on
   - if the context does not contain the answer it must say so and set
     grounded:false, rather than producing something plausible

   That last rule is the whole point. In a finance tool a confident wrong
   answer is worse than no answer, and an LLM with no grounding constraint
   will happily invent an invoice number. The citations are returned as
   structured ids rather than prose so the console can highlight exactly the
   records the answer came from - the answer and its evidence are the same
   object. */

import { activeProvider } from "./_model.js";

const SYSTEM = `You answer questions about ONE reconciliation run, using only the JSON context supplied with the question.

Rules, in order of importance:

1. Answer only from the context. It contains the batch summary, the matches that
   were made, the exceptions that were not, the still-open invoices, and any
   leakage findings. If the answer is not derivable from that, set grounded to
   false and say plainly what is missing. Never invent a record id, an amount or
   a counterparty.
2. Cite every record your answer depends on in "citations", using ids exactly as
   they appear in the context (BNK-… for credits, INV-… for invoices). Cite the
   specific records, not everything you looked at.
3. Be concrete and short. Name amounts, ids and reasons. Two or three sentences
   is usually right. This is a finance tool, not a chat companion — no preamble,
   no "great question", no restating the question.
4. Arithmetic over the context is allowed and encouraged: totals, counts,
   differences, per-counterparty grouping. Show the number you computed.
5. If asked something the data cannot settle — intent, blame, what will happen
   next — say what the data does show and mark grounded false.`;

const SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    citations: { type: "array", items: { type: "string" } },
    grounded: { type: "boolean" },
  },
  required: ["answer", "citations", "grounded"],
  additionalProperties: false,
};

async function callGroq(question, context) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.LEDGER_MODEL || "openai/gpt-oss-120b",
      temperature: 0,
      max_tokens: 3000,
      response_format: {
        type: "json_schema",
        json_schema: { name: "grounded_answer", strict: true, schema: SCHEMA },
      },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `CONTEXT:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text)?.error?.message || text;
    } catch {
      /* raw body */
    }
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  const data = JSON.parse(text);
  return {
    parsed: JSON.parse(data.choices[0].message.content),
    usage: data.usage || {},
    model: data.model,
  };
}

async function callAnthropic(question, context) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { z } = await import("zod");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
  const Answer = z.object({
    answer: z.string(),
    citations: z.array(z.string()),
    grounded: z.boolean(),
  });
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: process.env.LEDGER_MODEL || "claude-opus-5",
    max_tokens: 4000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(Answer) },
    messages: [
      { role: "user", content: `CONTEXT:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
    ],
  });
  if (!res.parsed_output) {
    const e = new Error("model returned no parseable output");
    e.code = "unparseable";
    throw e;
  }
  return {
    parsed: res.parsed_output,
    usage: {
      prompt_tokens: res.usage?.input_tokens || 0,
      completion_tokens: res.usage?.output_tokens || 0,
    },
    model: res.model,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const provider = activeProvider();
  if (!provider)
    return res.status(503).json({
      error: "no_key",
      message: "No model key configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY.",
    });

  const { question, context } = req.body || {};
  if (typeof question !== "string" || !question.trim())
    return res.status(400).json({ error: "bad_request", message: "question is required" });
  if (question.length > 500)
    return res.status(400).json({ error: "bad_request", message: "question is too long" });
  if (!context || typeof context !== "object")
    return res.status(400).json({ error: "bad_request", message: "context is required" });

  const started = Date.now();
  try {
    const out =
      provider === "groq"
        ? await callGroq(question, context)
        : await callAnthropic(question, context);

    /* A cited id that is not in the context is exactly the failure mode this
       endpoint exists to prevent, so drop it rather than render it. */
    const known = new Set([
      ...(context.matches || []).map((m) => m.b),
      ...(context.matches || []).flatMap((m) => m.inv || []),
      ...(context.exceptions || []).map((e) => e.id),
      ...(context.openInvoices || []).map((i) => i.id),
    ]);
    const citations = [...new Set(out.parsed.citations || [])].filter((c) => known.has(c));
    const dropped = (out.parsed.citations || []).length - citations.length;

    return res.status(200).json({
      answer: out.parsed.answer,
      grounded: out.parsed.grounded !== false,
      citations,
      meter: {
        provider,
        model: out.model,
        ms: Date.now() - started,
        inputTokens: out.usage.prompt_tokens || 0,
        outputTokens: out.usage.completion_tokens || 0,
        droppedCitations: dropped,
      },
    });
  } catch (e) {
    const status = e?.status;
    const msg = String(e?.message || e);
    let message = "The model could not answer.";
    if (status === 401 || status === 403) message = "The API key was rejected.";
    else if (status === 429) message = "Rate limited by the API. Wait a moment and ask again.";
    else if (status === 400 && /credit balance is too low/i.test(msg))
      message = "The Anthropic account has no credit.";
    return res.status(502).json({ error: "provider_error", message, detail: msg });
  }
}
