# Ledger

**An agent that reconciles a batch of bank wires against an open ledger, reports a match rate measured against known ground truth, hands back every exception it could not resolve — with the reason — and tells you what the gaps are costing you.**

**Live:** https://ledger-jab10.vercel.app/

Most reconciliation demos show you one match that worked. This one runs 40–60 wires,
grades itself against a planted answer key, and tells you what it got wrong.

---

## Contents

| | |
|---|---|
| [The problem](#the-problem) | why this is still done by hand |
| [What it does](#what-it-does) | six views and an export |
| [How it's measured](#how-its-measured) | real numbers, and how to reproduce them |
| [Why tiers](#why-tiers) | the ablation that justifies the architecture |
| [The reasoning tier](#the-reasoning-tier) | Groq or Anthropic, behind one interface |
| [Grounded Q&A](#grounded-qa) | answers that carry their own evidence |
| [Leakage](#leakage) | the pass that looks for money |
| [The audit pack](#the-audit-pack) | what the reconciliation is actually for |
| [Architecture](#architecture) | one substrate, several readers |
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
data whose answer you do not know.** Every generated batch here plants its ground truth
alongside it, which is the only way to *compute* precision rather than assert it.

## What it does

Set a noise level, hit reconcile, and watch four passes resolve the batch.

- **Graph** — bipartite canvas, bank left, ledger right, every match an edge coloured by
  the tier that made it, with a permanent legend. Click any wire to pin it and trace where
  it settled; N:M matches show the subset sum closing on the wire amount.
- **Ask** — grounded question answering over the current run. See [below](#grounded-qa).
- **Confidence** — every proposed match on a confidence axis with a draggable auto-clear
  threshold. Drag it down and watch coverage rise while wrong matches appear above the
  line. The precision/recall trade, made physical.
- **Forecast** — payment lag is *learned* from the wires just reconciled, not assumed, so
  the cash curve is a byproduct of the matching. It shows the day you breach your floor,
  ranks the collections that would fix it, and has a payroll dial to stress the month.
- **Leakage** — what the gaps are costing you. See [below](#leakage).
- **Exceptions** — everything unresolved, ranked by value at risk, each carrying why it
  failed. Review one, pick the invoices it settles from **ranked candidates with their
  evidence**, and the engine mines a durable rule from your decision. Re-run and the rules
  apply — the gap between decisions made and records fixed is the point.

Plus **CSV import** (bring your own bank and ledger files) and the
[audit pack](#the-audit-pack) export.

## How it's measured

Every generated batch plants its own answer key, so precision is computed, not claimed. A
match is correct only if its **complete set** of invoice ids equals the truth — a partially
right N:M match scores as wrong.

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
the console meters it live — every run reports how many wires the model actually saw, how
long it took, and what it cost.

Read the precision column too: each tier buys coverage and pays for it in precision. That
trade is why the auto-clear threshold is yours to set.

### The four tiers

| | tier | how it decides | confidence |
|---|---|---|---|
| 0 | **Learned** | rules mined from analyst decisions — aliases, per-customer fees, reference patterns | 0.97 |
| 1 | **Exact** | normalised reference equal *and* amount within half a cent | 0.995 |
| 2 | **Fuzzy** | weighted score on amount, reference, counterparty and date, plus a bounded subset-sum search for one wire covering several invoices | scored |
| 3 | **Reasoned** | a model, on the residual only | model-reported |

Tier 2 carries an **ambiguity penalty**: when the second-best candidate sits within 0.06 of
the best, confidence drops by 0.18 so the case escalates instead of silently clearing. When
two candidates both fit, the honest answer is "ask a human".

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
says so. Failures are named — `no_credit`, `bad_key`, `rate_limited` — with the fix
attached, because a status code tells nobody standing in front of a demo anything.

## Grounded Q&A

A chat wrapper on a dashboard would be the least differentiated thing here. What makes the
**Ask** tab worth having is what it is *not allowed* to do:

- it sees **one reconciliation**, passed as structured context, and nothing else
- the ground truth is deliberately excluded — it can tell you what the engine did and why,
  not whether a match was secretly right
- it must **cite the record ids** its answer rests on, returned as structured ids rather
  than parsed from prose
- any cited id **not present in the context is dropped and counted** — inventing an invoice
  number is precisely the failure this exists to prevent
- when it cannot ground an answer it says so and the reply is badged **ungrounded**

**The answer and its evidence are the same object.** Every reply renders its citations as
chips; clicking one jumps to the graph with that wire pinned and traced. No sentence has to
be taken on faith.

Two real exchanges:

> **"Which counterparty is costing me the most, and how much?"**
> *"Fairlight Media is costing the most at $38,132.64."* — 6 citations, 7.2s. Clicking
> `BNK-9014` pinned it on the graph, showing the tier-1 match to INV-4419 tying out exactly.

> **"Is Fairlight Media committing fraud, and will they pay us next month?"**
> **NOT GROUNDED** — *"The data shows Fairlight Media has short-paid two of six settlements
> (total $40) but provides no evidence of fraud or any indication of payments next month."*

## Leakage

Reconciliation answers *"does this tie out"*. Leakage answers *"what is it costing you that
it does not"*. Both read the same cleared matches, but matching is per-wire and leakage is
per-counterparty and across the batch, which is where systematic problems live.

Five checks, all arithmetic over reconciled pairs — no model, explainable line by line:

| check | finds |
|---|---|
| **short-pay** | counterparties who consistently remit less than billed |
| **fee-overcharge** | deductions above your contracted rate; a flat fee on a small invoice is where margin quietly goes |
| **duplicate** | same counterparty, same amount, within six days |
| **unattributed** | cash in the account with nothing to apply it to |
| **aged** | receivables past due and still open |

Split into two totals because they are different kinds of number: **recoverable** is money
someone owes you and you can go and ask for; **exposure** is money at risk that nobody has
done anything wrong to cause. At noise 5 a typical batch shows ~$330 recoverable against
~$87,000 exposure.

Every finding lists the record ids it was derived from. A number in a finance tool that you
cannot drill into is a number nobody will act on.

## The audit pack

Every other view ends at a screen. This ends at a document — one button produces a
self-contained HTML report that prints straight to PDF:

the headline metrics · how each tier resolved what · every cleared match with what was
billed against what arrived and the gap · the exceptions and their reasons · the analyst
decisions and the rules they produced · the leakage findings · **and a methodology note**.

The methodology note is the part that matters. It states how match rate and precision are
computed, and on uploaded data it says precision is **not computable** rather than printing
a number — *"any precision figure for this data would be fabricated"*. It also records that
tiers 0–2 are reproducible arithmetic while tier 3 is a model and is not, and that leakage
findings are indicative rather than an accusation.

## Architecture

Reconciliation is not one of several features. It is the substrate the others read from.

```
                    ┌──────────────────────┐
                    │  RECONCILIATION      │  ← the only hard part
                    │   · matches[]        │
                    │   · exceptions[]     │
                    │   · decision log     │
                    └──────────┬───────────┘
        ┌──────────────┬───────┴───────┬──────────────┐
        ▼              ▼               ▼              ▼
  CASH FORECAST    LEAKAGE       GROUNDED Q&A    AUDIT PACK
  learns payment   scans for     answers only    the record
  lag from         systematic    from this run,  a controller
  cleared matches  loss          with citations  sends onward
```

The coupling is real, not cosmetic: raise the auto-clear threshold and the forecast moves,
because fewer cleared matches means less lag data to learn from.

```
src/
├── engine/            the substrate — no React, no JSX, no theme imports
│   ├── generate.js    synthetic batches with planted ground truth
│   ├── match.js       four tiers, subset-sum, candidate ranking, rule mining, scoring
│   ├── forecast.js    cash curve derived from cleared matches
│   └── leakage.js     the five loss checks
├── console/           Console + Graph, NmTrace, Ask, Confidence, Forecast,
│                      Leakage, Exceptions
├── landing/           the marketing surface
├── lib/               csv, history, askContext, auditPack, motion, format, random
└── ui/                primitives, effects, styles, tier metadata
api/
├── _model.js          provider selection (Groq | Anthropic)
├── _provider*.js      one file each, same interface
├── reconcile.js       tier 3
├── ask.js             grounded Q&A
├── runs.js            run history
└── _store.js          Vercel KV, or in-process fallback
```

`src/engine/` is deliberately free of UI: it is the part that produces the numbers, and it
runs headless — which is how the tables above were measured.

## Honest limits

Named because a project that hides these invites someone to find them.

**Data is generated, not ingested — by design.** Ground truth is what makes measurement
possible. CSV upload exists, but uploaded data has no answer key, so precision is
*uncomputable*, not merely unknown. The console switches grading off and says so rather
than printing a meaningless 100%.

**Groq's free tier rate-limits rapid successive runs.** Each reconcile *and* each question
is an API call, and ~4k output tokens per reconcile adds up against a per-minute budget.
Three back to back hit the limit. The console degrades to the stub and reports
`rate_limited` rather than failing.

## Running it

```bash
npm install
cp .env.example .env.local   # add ONE key — see below
npm run dev                  # http://localhost:5173
```

Tier 3 and the Ask tab need a model key in `.env.local`. Everything else works without one —
the deterministic tiers do not call out, and tier 3 falls back to the stub.

```bash
GROQ_API_KEY=gsk_...         # free tier: https://console.groq.com/keys
# or
ANTHROPIC_API_KEY=sk-ant-... # needs credit: https://console.anthropic.com
```

`.env.local` is gitignored. **Never put a key in `.env.example`** — that file is the
template and it *is* committed.

`/api/*` is served during `npm run dev` by a Vite middleware, so the Vercel CLI is not
needed locally.

### Reproducing the numbers

The tables above come from running the engine headless across seeds 42–46 at threshold
0.70. `src/engine/` has no UI dependencies, so it can be imported and run directly from
Node.

---

Built with React and Vite.
