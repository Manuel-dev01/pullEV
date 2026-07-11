# CLAUDE.md — PullEV Operating Manual

Persistent operating manual for **PullEV**, a solo hackathon build for the **Renaiss Tech Hackathon Season 1**. Read this fully at the start of every session. It outranks any one-off instruction except an explicit live correction from me.

---

## 1. MISSION & WINNING THESIS

**PullEV** is a provably-fair gacha decision tool for Renaiss's Infinite Gacha packs. It does two things no existing tool does:

- **EV verdict:** "Should I rip this pack?" — live expected value vs. cost, with the full value distribution and chance-of-profit, computed from the pack's vault-backed pool and FMV/CMV oracle prices.
- **Fairness verifier:** "Was my pull fair?" — independent, client-side Merkle-proof recomputation so the user trusts math, not Renaiss's claim.

A grounded **AI Pull Advisor** explains verdicts in plain language with mandatory inline citations to the underlying numbers.

**Why this wins (keep this in view on every decision):**
- **Ecosystem relevance:** Infinite Gacha *is* Renaiss's core revenue mechanic (260k users, $20M revenue). We make their flagship transparent — not adjacent to the ecosystem, the heart of it.
- **Innovation + Safety fused:** the independent fairness verifier is novel *and* the literal opposite of "presenting output as verified fact." It turns the rubric's two hardest criteria into one feature.
- **Clarity + provenance:** every number shows its source and timestamp by design — we pass the "label your data" test structurally while AI-heavy entries scramble to bolt on disclaimers.
- **Usability:** a judge uses it in <60s with no docs.

**The money shot:** PullEV audits Renaiss's own product's fairness, live, in front of the CTO who built it.

## 2. THE JUDGING RUBRIC IS THE SPEC

Every feature must defend itself against these five. If a feature doesn't move at least one, cut it.

1. **Usability** — Can a judge use/test it immediately? <60s to first value, no docs needed.
2. **Innovation** — Fresh approach. Our edge: client-side fairness recomputation, grounded AI.
3. **Ecosystem relevance** — Connects naturally to Renaiss (packs, FMV oracle, vault custody, SBTs).
4. **Clarity** — Easy to understand and explain. Plain verdicts, visible inputs.
5. **Safety** — Labeled data sources, no private data, AI output never presented as verified fact.

**Disqualifiers to never trigger** (from the hackathon brief): exposing private data; unclear data sources; presenting AI outputs as verified facts without context; pure PR/content/deck-only submissions; secrets/tokens in the repo; unsafe auth flows.

## 3. RENAISS GROUND TRUTH (verified facts — do not hallucinate beyond these)

- Renaiss = RWA liquidity infrastructure for real-world graded collectibles (trading cards first: Pokémon, One Piece), on **BNB Chain**.
- Each PSA/BGS-graded physical card → an **ERC-721 NFT** mirrored to a vaulted physical asset. Card stays in custody; NFT moves on-chain.
- **FMV/CMV oracle** aligns on-chain price to real market value. (FMV = fair market value; CMV = current market value.) This is our EV price source.
- **Infinite Gacha** = perpetual packs with continuously refreshed, vault-backed pools. The real lineup (verified live): **3 rippable Infinite packs** — Eden $150 (top prize $4,434), OMEGA $48 ($1,532), RenaCrypt $88 ($2,415) — plus **Champion Pack $100** (limited, sold out) and **11 previous $100 limited packs** (sold-out showcase). Each pack publishes a tiered "what is loaded" odds structure (e.g. Crown/Bloom/Thorn, Tier S/A/B/C). PullEV prices a ~148-card real graded-card library and models 16-card pools (bands ~2 Chase / 4 Mid / 10 Common) from it. Verify current prices/pools live before relying on them.
- Each pack draw is "sealed with blockchain-level fairness," anchored by **Merkle proofs + zero-knowledge validation**. This is the structure our verifier targets.
- **RenaissOS** turns vaults/card shops into multi-sig on-chain verification nodes.
- **No native token.** Identity/participation via **Soulbound Tokens (SBTs)**.
- App layer: **renaiss.xyz** (open/closed beta). The **Renaiss Index API (beta)** (`api.renaissos.com`) is now live and is PullEV's FMV oracle: real graded-card valuations by cert / structured card / search, plus market indices and price-history series (partner-keyed, X-Api-Key/X-Api-Secret). It exposes **no pool/odds/draw API**, so pool membership + draw odds stay a labeled PullEV model. The Renaiss gacha contract on BNB Chain exposes a real `getMerkleRoot(packId)`, which PullEV reads and displays for the 12 sealed packs (auditable on BscScan).

**Anything not in this list, we verify before we trust.** Card prices are now REAL (Renaiss Index API, beta, cached); pool membership + draw odds remain a labeled PullEV model, and the client-side Merkle proof scheme is documented and pluggable. Label every model/assumption in code and UI.

## 4. ARCHITECTURE

Monorepo:

```
/web        Next.js (App Router) + TS + Tailwind — UI, fairness verifier (client-side), AI route
/engine     Go service — adapter layer, EV engine, caching, typed JSON API
/shared     Shared type definitions (pack, card, draw, proof, EV result)
engine/fixtures  Real Index-priced pools + committed seed for the 15 real packs (offline-safe, embedded)
docs/        README source, data-source labels, demo script
```

### 4.1 The Adapter Layer (most important architectural decision)

No official Renaiss data source exists. The entire data layer sits behind **one interface** with three implementations. The active adapter and per-datapoint freshness are always visible in the UI.

```go
type PackDataAdapter interface {
    ListPacks(ctx) ([]Pack, Provenance, error)
    GetPool(ctx, packID) (Pool, Provenance, error)        // cards currently in pool + FMV each
    GetDraw(ctx, drawID) (Draw, Provenance, error)        // leaf, proof path, published root
    Source() SourceKind                                    // Mock | Public | Sdk
}
```

- `Provenance` carries `{source, fetchedAt, isOfficial, notes}` and MUST surface in the UI.
- **MockAdapter** — deterministic fixtures; offline-safe; the demo fallback.
- **PublicAdapter** — best-effort read of public renaiss.xyz data; labeled UNOFFICIAL; graceful fallback to Mock on failure.
- **SdkAdapter** — stub returning "SDK not yet available"; ready for the real SDK.

Rule: **the UI must never render a number without its provenance reachable.** A "MOCK" / "UNOFFICIAL — scraped {time}" / "OFFICIAL" badge is non-negotiable.

### 4.2 EV Engine (the trust core — Go, tested)

- Input: pool (cards + per-card FMV) + pack cost.
- Output: `EVResult { expectedValue, evToCostRatio, distribution{p10,median,p90}, chanceOfProfit, inputsHash, sources[], computedAt }`.
- Must expose **every input** that produced the number. No black-box verdicts.
- Tested: unit tests for known pools; fuzz the distribution math; assert EV is deterministic given identical inputs (`inputsHash` reproducibility).
- Never claim precision the data doesn't support — if FMV is stale or scraped, the result inherits and displays that caveat.

### 4.3 Fairness Verifier (client-side — the headline feature)

- Runs **in the browser**, independent of our own backend. The entire point is "don't trust PullEV either — recompute it yourself."
- Given `{leaf, proofPath[], publishedRoot}`, recompute the root and compare.
- Output: `VERIFIED — recomputed locally` (green) or `MISMATCH` (red), showing each hash step.
- If Renaiss's exact hashing/leaf-encoding scheme is unconfirmed, implement against the **documented Merkle-proof primitive**, keep the hash function and leaf encoding **pluggable**, and label the scheme assumption explicitly. Confirm the real scheme at the coaching session.

### 4.4 AI Pull Advisor (grounded — DeepSeek API)

- Server route; the model receives ONLY the computed EV result + provenance as context.
- System prompt hard rule: **every sentence must cite a number and its source from the provided context; refuse to assert anything not in context; never present estimates as facts.**
- If asked something outside the data, it says so. This restraint is a feature we show off, not a limitation we hide.
- Model string: **DeepSeek** (`deepseek-chat`), OpenAI-compatible endpoint, kept swappable in one config constant (`web/lib/advisor.ts`). Deliberate deviation from the original Anthropic/Sonnet plan; key is server-only (`DEEPSEEK_API_KEY`, never `NEXT_PUBLIC`).

## 5. SCOPE DISCIPLINE (1 week, solo)

**IN:** adapter layer + mock data; EV engine + tests; client-side fairness verifier; public-data read (best-effort); grounded AI advisor; polished <60s-usable UI; hosted demo; README with sources/assumptions/limitations.

**OUT (cut on sight):** new smart contracts; any on-chain transaction or deploy; token/SBT minting; user accounts/auth; wallet connection (we read, we don't transact); multi-collectible expansion beyond cards; anything that can break the live demo.

**The cut rule:** if a feature risks the demo working end-to-end on judging day, it loses to polish on what exists. A flawless three-feature demo beats a flaky five-feature one.

## 6. PHASE PLAN (maps to slices; coaching session is the midpoint gate)

| Phase | Days (Jul) | Goal | Demoable outcome |
|---|---|---|---|
| Slice 0 | 4 | Skeleton + adapter contract + MockAdapter | Pack pool renders from mock, MOCK badge + timestamp |
| Slice 1 | 5 | EV engine + Go tests | Pick a pack → EV verdict + distribution |
| **Coaching** | **2–3** | **CTO session: confirm pool shape, FMV access, Merkle scheme** | **Walk in with Slices 0–1 already working** |
| Slice 2 | 6 | Client-side fairness verifier | Replay a draw → VERIFIED/MISMATCH locally |
| Slice 3 | 7–8 | PublicAdapter (best-effort live) + fallback | Toggle live/mock, freshness visible |
| Slice 4 | 9 | Grounded AI Pull Advisor | "Explain this EV" → cited plain-language answer |
| Slice 5 | 10–11 | Polish, README, deploy, demo video | Hosted, <60s-usable, submission-ready |

**Coaching leverage:** the optional 1:1 with CTO Benjamin Tong (Jul 2–3) is a strategic asset. Walk in with a working EV demo, not questions about whether the idea is good. Use the 30 min to confirm exactly three things: (1) real pool/FMV data shape and whether there's any access path, (2) the exact Merkle leaf-encoding + hash scheme so the verifier matches production, (3) what would make him personally list this in the Tool Directory. Bring specifics; he's seen a hundred decks.

## 7. WORKING STYLE (how I want you to operate)

- **Direct, decisive.** Give me one concrete recommendation with the trade-off, not a menu. I move fast once trade-offs are clear.
- **Receipts over assertions.** Show the code, the test, the actual data shape. Don't tell me it works — show the passing test.
- **Verified over optimistic.** If data is scraped, stale, or assumed, say so loudly. Never dress an assumption as a fact — that's the exact failure mode that loses this hackathon.
- **No AI-prose.** No "delve," no "in today's fast-paced world," no filler. Plain engineering English.
- **Vertical slices.** Each ends in something I can run and see. After each, stop and tell me what to test.
- **Push back** when I'm wrong or about to over-scope. Update your position when I show you new evidence; I'll do the same.
- **Build in public friendly:** clean commits, readable diffs, a repo someone could screenshot.

## 8. SAFETY & COMPLIANCE CHECKLIST (re-check before every commit and before submission)

- [ ] No secrets, API keys, or tokens committed (`.env` gitignored; keys via env only).
- [ ] No private user data, no wallet keys, no auth flows.
- [ ] Every displayed number has reachable provenance (source + timestamp + official/unofficial).
- [ ] Mock and scraped data are visibly labeled; never shown as authoritative.
- [ ] AI advisor cites every claim and refuses out-of-context assertions.
- [ ] Card images/names shown for identification only; Renaiss/Pokémon/One Piece IP disclaimer mirrored in footer.
- [ ] README explicitly lists data sources, assumptions, and limitations.
- [ ] Fairness verifier runs client-side and is independent of our backend.

## 9. SUBMISSION CHECKLIST

- [ ] Hosted demo live and stable (Vercel), MockAdapter fallback guarantees it never shows a blank screen.
- [ ] Public GitHub repo, clean history, clear README.
- [ ] README: what it is, who it's for, **data sources + assumptions + limitations**, how to run, safety notes.
- [ ] 60–90s demo video: rip-decision verdict → fairness verification → grounded AI explain. Lead with the fairness verifier; it's the differentiator.
- [ ] One-line positioning: "PullEV makes Renaiss's Infinite Gacha provably fair and EV-transparent — verify any pull yourself, client-side."
- [ ] Submitted as **Tool** track (primary), AI advisor noted as grounded assist layer.

## 10. DEFINITION OF DONE

PullEV is done when a judge can, in under 90 seconds and with no help: pick a pack and see a sourced EV verdict, replay a draw and watch the fairness proof recompute in their own browser, and ask the AI to explain it and get a fully-cited answer — with every number on screen traceable to a labeled source. Everything else is polish or scope creep.