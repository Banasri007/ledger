/* Which model provider tier 3 uses.

   Picked from whichever key is configured, so switching is an environment
   change rather than a code change:

     GROQ_API_KEY        → Groq (openai/gpt-oss-120b by default)
     ANTHROPIC_API_KEY   → Anthropic (claude-opus-5 by default)
     LEDGER_PROVIDER     → force one when both keys are present

   The import is dynamic on purpose: loading the Anthropic provider pulls in its
   SDK, and there is no reason to pay that on a cold start when Groq is the one
   actually running.

   Both providers implement the same reasonOverResidual({ wires, candidatesFor })
   and return { matches, meter }, so api/reconcile.js - and everything above it
   in the app - is provider-agnostic. */

function activeProvider() {
  const forced = (process.env.LEDGER_PROVIDER || "").trim().toLowerCase();
  if (forced === "groq") return process.env.GROQ_API_KEY ? "groq" : null;
  if (forced === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

async function loadProvider() {
  const p = activeProvider();
  if (!p) return null;
  return p === "groq" ? import("./_provider-groq.js") : import("./_provider.js");
}

async function reasonOverResidual(args) {
  const mod = await loadProvider();
  if (!mod) {
    const err = new Error("no provider configured");
    err.code = "no_key";
    throw err;
  }
  const out = await mod.reasonOverResidual(args);
  return {
    ...out,
    meter: { provider: activeProvider(), ...out.meter },
  };
}

async function modelId() {
  const mod = await loadProvider();
  return mod?.MODEL || null;
}

export { activeProvider, reasonOverResidual, modelId };
