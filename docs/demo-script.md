# Demo script (60 to 90 seconds)

Lead with the fairness verifier. It is the differentiator: a tool that audits Renaiss's own product's
fairness, live, in the viewer's own browser.

## Setup

- App: https://pullev.vercel.app
- Engine: https://pullev-engine-production.up.railway.app (keep it live so numbers read LIVE, not BUNDLED SNAPSHOT).

## Beat 1: the fairness verifier (about 30s)

1. Open `/app` and swipe to **Station 04, Proof Vault** (or open `/verify` directly).
2. Load the **EXAMPLE valid** proof. Click recompute. The Merkle ladder folds and lands on green
   **VERIFIED, ROOT MATCH**. Say: "This ran entirely in your browser via Web Crypto. PullEV's server
   was not involved."
3. Switch to the **EXAMPLE tampered** proof. Recompute. It lands on red **MISMATCH, DO NOT TRUST**.
   Say: "One corrupted hash and the proof breaks. You do not trust PullEV; you trust your own math."
4. Point out the label: the example is clearly marked EXAMPLE, and the root is labeled "computed by
   PullEV over the labeled pool, not Renaiss's on-chain root."

## Beat 2: the EV verdict (about 20s)

1. Swipe back to **Station 01, Floor**. Each pack shows its live edge.
2. Open **Station 02, X-Ray Bay** on a pack. Show EV vs cost, the edge, chance of profit, and the value
   histogram. Note the per-card LIVE and ASSUMED tags, and that the verdict spread is believable:
   Omega reads RIP, Renacrypt and Eden read SKIP (house edge).
3. Say: "Card prices are real Renaiss Index valuations. The pool model and odds are a labeled PullEV
   assumption, because Renaiss exposes no odds API."

## Beat 3: the grounded advisor (about 20s)

1. Open the floating advisor orb. Ask: "Should I rip this pack?"
2. It answers in plain words and cites every number with [1] to [4] tags, ending with "Not financial
   advice."
3. Ask something out of context, for example "What is Bitcoin doing?" It refuses, because the answer is
   not in the provided context. Say: "Restraint is the point. It never presents anything it cannot source."

## One-line positioning

PullEV makes Renaiss's Infinite Gacha provably fair and EV-transparent. Verify any pull yourself,
client-side.
