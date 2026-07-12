# Guided walkthrough

Drive PullEV yourself in about two minutes. This is a click-through you can follow live, not a video script.
Each step is one action, what you will see, and why it matters. **Lead with the fairness verifier** (step 2): it
is the differentiator, a tool that audits Renaiss's own flagship product for fairness, live, in your own browser,
against Renaiss's real on-chain commitment.

## Where to run it

- **Hosted (nothing to install):** [pullev.vercel.app](https://pullev.vercel.app). Engine health at
  [`/api/health`](https://pullev-engine-production.up.railway.app/api/health).
- **Locally:** see [Run locally](../README.md#run-locally) in the README (engine on `:8080`, web on `:3000`).

Everything is reads-only. No wallet, no account, no sign-in. If the engine is down, every surface still renders
from a committed snapshot (badged `BUNDLED SNAPSHOT`) and the verifier still works, because it runs in your
browser. That fallback is part of the safety design, so it is fine to show.

## The walkthrough

### 1. Land on the front page (`/`)

Read the one-liner, then look at the featured pack's EV console: a real edge, chance of profit, and a value curve.
Note the floating `EDGE` and `CHASE` chips are labeled, and every figure is sourced. Click **RIP THE FIRST PACK**
to enter the app (`/app`), or **Verify a pull** to jump straight to the verifier.

> Why it matters: live EV on Renaiss's flagship, up front, before you pay.

### 2. Verify a pull (`/verify`, or Station 04 in `/app`): the money shot

1. Pick the **Champion pack** (marked with a chain icon). The page shows Renaiss's **real on-chain Merkle root**,
   read live from the gacha contract on BNB Chain, with a **BscScan link** so you can reproduce the lookup
   yourself. All 12 sealed packs carry their genuine committed root.
2. Load the **EXAMPLE (valid)** proof and click recompute. Watch the hash ladder resolve in your browser via Web
   Crypto and land green **VERIFIED**.
3. Switch to **EXAMPLE (tampered)** and recompute. One corrupted byte, red **MISMATCH**.
4. Note the labels: the on-chain root is real; the recompute is a labeled EXAMPLE over the labeled pool, never
   presented as a real Renaiss draw.

> Why it matters: the recompute runs on your machine, against Renaiss's real on-chain commitment. You never trust
> PullEV, you check the math yourself.

### 3. The Floor (`/app`, Station 01)

See Renaiss's real lineup: 3 live Infinite packs plus a sold-out showcase of 12 limiteds, each with a live edge
and a real refresh timestamp (prices are re-priced off the Renaiss Index on a schedule). Tap a pack to send it to
X-Ray.

> Why it matters: real packs, real prices, real freshness, not a frozen build.

### 4. X-Ray Bay (`/app`, Station 02)

Read the EV verdict: expected value vs cost, the distribution histogram, and the **"what is loaded"** three-band
model (Chase / Mid / Common). Every card shows a `LIVE` Index price. Then open the **"Under the hood"** panel to
see the glass-box computation: the band-by-band sum that builds the expected value, the edge and profit formulas
with real values, and the `inputsHash` fingerprint.

> Why it matters: real prices on every card, the odds are the only labeled model, and the verdict is a
> reproducible computation from PullEV's own engine, not a black box.

### 5. Rip a sample pull (`/app`, Station 03)

Rip a pull. It draws one card from the pool by the real weights (labeled a sample, not Renaiss's official on-chain
sealed draw), builds a real inclusion proof, and hands it to the Proof Vault (step 2's verifier).

> Why it matters: the sample draw and the fairness recompute are connected end to end.

### 6. Ask the grounded advisor (floating orb in `/app`)

Ask "should I rip this pack?" The answer cites every number with `[1]`-`[4]` source chips and ends with
"Not financial advice." Then ask something off-topic ("what is Bitcoin doing?") and watch it decline.

> Why it matters: an AI that must cite every number or refuse. Restraint is the feature, not a limitation.

### 7. The supporting pages

- **Vault Index (`/vault`):** the full ~148-card real graded-card library the pools price from, with real
  price-history sparklines.
- **Oracle lookup (`/value`):** enter any PSA/CGC/BGS cert number for its real Renaiss Index valuation.

> Why it matters: every EV number traces back to a real card you can open and inspect.

## What to take away

Every number on screen traces to a labeled source; model and example data are never dressed as fact; PullEV reads
Renaiss and never touches your wallet; and it proves fairness against a real on-chain root instead of claiming it.

**PullEV makes Renaiss's Infinite Gacha provably fair and EV-transparent. Verify any pull yourself, client-side.**
