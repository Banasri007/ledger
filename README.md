# Ledger

**An agent that reconciles a batch of bank wires against an open ledger, reports a match rate measured against known ground truth, and hands back every exception it could not resolve — with the reason.**

Most reconciliation demos show you one match that worked. This one runs 40–60 wires,
grades itself against a planted answer key, and tells you what it got wrong.

---

## Contents

| | |
|---|---|
| [The problem](#the-problem) | why this is still done by hand |
| [What it does](#what-it-does) | the four views |
| [How it's measured](#how-its-measured) | real numbers, and how to reproduce them |
| [Why tiers](#why-tiers) | the ablation that justifies the architecture |
| [The reasoning tier](#the-reasoning-tier) | Groq or Anthropic, behind one interface |
| [Architecture](#architecture) | one substrate, three readers |
| [Honest limits](#honest-limits) | what is not real yet |
| [Running it](#running-it) | setup, keys, deployment |

---

## The problem

Reconciliation is still done by hand because **the cost of a wrong match is higher than
the cost of a slow one.** A tool that matches 95% of records and quietly gets 4% of them
wrong is worse than useless — someone has to re-check all of it anyway, so you have paid
for the automation and kept the labour.

So the number that matters is not throughput. It is throughput you can trust, with the
residual handed back honestly instead of buried.

That has a consequence for how you build the demo: **you cannot report accuracy against
data whose answer you do not know.** Every batch here is generated with its ground truth
planted alongside it, which is the only way to *compute* precision rather than assert it.

## What it does

Set a noise level, hit reconcile, and watch four passes resolve the batch. Four views:

- **Graph** — bipartite canvas, bank left, ledger right, every match an edge coloured by
  the tier that made it. Click any wire to pin it and trace where it settled; N:M matches
  show the subset sum closing on the wire amount.
- **Confidence** — every proposed match on a confidence axis with a draggable auto-clear
  threshold. Drag it down and watch coverage rise while wrong matches appear above the
  line. The precision/recall trade, made physical.
- **Forecast** — payment lag is *learned* from the wires just reconciled, not assumed, so
  the cash curve is a byproduct of the matching. It shows the day you breach your floor
  and ranks the collections that would fix it.
- **Exceptions** — everything unresolved, ranked by value at risk, each carrying why it
  failed. Review one, pick the invoices it settles, and the engine mines a durable rule
  from your decision. Re-run and the rules apply.

## How it's measured

Every batch plants its own answer key, so precision is computed, not claimed. A match is
correct only if its **complete set** of invoice ids equals the truth — a partially right
N:M match scores as wrong.

Two numbers are reported separately on purpose. **Match rate** is coverage; **precision**
is how much of that coverage was right. Most tools quote only the first.

### Degradation across noise levels

Noise is additive: level 4 contains everything from levels 1–3.

| noise | wires | match rate | precision | false matches | what it adds |
|---|---|---|---|---|---|
| 1 | 58 | 100.0% | 100.0% | 0.0 | clean references |
| 2 | 54 | 100.0% | 100.0% | 0.0 | + date & reference drift |
| 3 | 53 | 96.2% | 100.0% | 0.0 | + wire fees, FX drift, name variants |
| 4 | 44 | 86.5% | 92.6% | 2.8 | + merged & split payments |
| 5 | 46 | 84.5% | 89.3% | 4.2 | + duplicates, decoys, orphans |

*Mean of 5 seeds (42–46), auto-clear threshold 0.70, with the deterministic stub standing
in for the reasoning tier — see [the reasoning tier](#the-reasoning-tier).*

The curve is monotonic because the noise ladder is additive, and precision only starts to
fall at level 4, where merged payments make genuinely ambiguous cases possible.

## Why tiers

The architecture claim is that deterministic passes should clear the bulk so the model
only sees what survives. That is measurable rather than rhetorical:

| tiers enabled | match rate | precision | wires left for the next tier |
|---|---|---|---|
| exact only | 29.8% | 100.0% | 30.6 |
| + fuzzy | 79.9% | 97.1% | 8.4 |
| + reasoning | 86.5% | 92.6% | 2.6 |

*Noise 4, mean of 5 seeds.*

Read the last column. Arithmetic alone clears 80% of the batch, so the expensive pass is
asked about **~8 wires out of 44**, not all of them. That is the entire cost argument, and
the console meters it live — every run reports how many wires the model actually saw,
how long it took, and what it cost.

Read the precision column too: each tier buys coverage and pays for it in precision. That
trade is the reason the auto-clear threshold is yours to set.

### The four tiers

| | tier | how it decides | confidence |
|---|---|---|---|
| 0 | **Learned** | rules mined from analyst decisions — aliases, per-customer fees, reference patterns | 0.97 |
| 1 | **Exact** | normalised reference equal *and* amount within half a cent | 0.995 |
| 2 | **Fuzzy** | weighted score on amount, reference, counterparty and date, plus a bounded subset-sum search for one wire covering several invoices | scored |
| 3 | **Reasoned** | a model, on the residual only | model-reported |

Tier 2 also carries an **ambiguity penalty**: when the second-best candidate sits within
0.06 of the best, confidence drops by 0.18 so the case escalates instead of silently
clearing. When two candidates both fit, the honest answer is "ask a human".

## The reasoning tier

Tier 3 calls a real model through `/api/reconcile`, a serverless function that holds the
API key server-side. Two providers, chosen by whichever key is configured:

| provider | default model | notes |
|---|---|---|
| **Groq** | `openai/gpt-oss-120b` | free tier; strict `json_schema` decoding |
| **Anthropic** | `claude-opus-5` | requires credit on the account |

Three things are deliberate:

**Only the residual crosses the wire.** The unmatched wires and the still-open invoices —
never the answer key. The truth stays in the browser and is used afterwards to grade the
result, so the model is genuinely tested rather than fed the answer.

**Schema-constrained, not scraped.** Both providers use constrained decoding, so decisions
come back as validated JSON. A finance tool that regexes invoice numbers out of an LLM's
prose is one bad sentence from booking the wrong match.

**Output is checked before it is trusted.** A model can cite an invoice that was never
offered. Those are dropped and counted, and the count is shown in the meter.

If no key is set, or the provider errors, tier 3 falls back to a deterministic stub and
says so in the console. Failures are named — `no_credit`, `bad_key`, `rate_limited` — with
the fix attached, because a status code tells nobody standing in front of a demo anything.

## Architecture

Reconciliation is not one of four features. It is the substrate the others read from.

```
                  ┌──────────────────────┐
                  │  RECONCILIATION      │  ← the only hard part
                  │   · matches[]        │
                  │   · exceptions[]     │
                  │   · decision log     │
                  └──────────┬───────────┘
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
      CASH FORECAST     EXCEPTIONS      LEARNED RULES
      reads cleared     reads the       mined from
      matches to        residual        analyst decisions,
      learn payment                     fed back to tier 0
      lag
```

The coupling is real, not cosmetic: raise the auto-clear threshold and the forecast moves,
because fewer cleared matches means less lag data to learn from.

```
src/
├── engine/          the substrate — no React, no JSX, no theme imports
│   ├── generate.js  synthetic batches with planted ground truth
│   ├── match.js     four tiers, subset-sum, rule mining, scoring
│   └── forecast.js  cash curve derived from cleared matches
├── console/         the tool — Console plus the four views
├── landing/         the marketing surface
├── ui/  lib/        primitives, motion, formatters, CSV, history
api/
├── _model.js        provider selection
├── _provider*.js    Groq / Anthropic, same interface
├── reconcile.js     tier 3 endpoint
└── runs.js          run history
```

`src/engine/` is deliberately free of UI: it is the part that produces the numbers, and it
runs headless — which is how the tables above were measured.

## Honest limits

Named because a project that hides these invites someone to find them.

**Data is generated, not ingested — by design.** Ground truth is what makes measurement
possible. CSV upload exists, but uploaded data has no answer key, so precision is
*uncomputable*, not merely unknown. The console switches grading off and says so rather
than printing a meaningless 100%.

**"Learning" is rule mining, not ML.** `mineRules` is deterministic pattern extraction
from an analyst's decision. It generalizes — one alias fixes every wire from that
counterparty — but it is not a trained model, and calling it one would be overclaiming.

**The accuracy tables use the stubbed reasoning tier.** The stub is deliberately imperfect
(~15% wrong) so the numbers stay honest rather than flattering. Live-model accuracy is not
yet benchmarked across seeds; the live path is verified to work, not yet measured.

## Running it

```bash
npm install
cp .env.example .env.local   # add ONE key — see below
npm run dev                  # http://localhost:5173
```

Tier 3 needs a model key in `.env.local`. Everything else works without one — the
deterministic tiers do not call out, and tier 3 falls back to the stub.

```bash
GROQ_API_KEY=gsk_...         # free tier: https://console.groq.com/keys
# or
ANTHROPIC_API_KEY=sk-ant-... # needs credit: https://console.anthropic.com
```
