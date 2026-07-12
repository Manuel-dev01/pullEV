# Architecture

How PullEV is built, and why. The design goal is one thing: **every number on screen is traceable to a
labeled source, and the two trust-critical computations (EV and fairness) can be reproduced independently.**
This document is the deep reference; the [README](../README.md) is the front door.

## Contents

- [System at a glance](#system-at-a-glance)
- [Repository layout](#repository-layout)
- [The data adapter layer](#the-data-adapter-layer)
- [Trust core 1: the EV engine](#trust-core-1-the-ev-engine)
- [Trust core 2: the client-side Merkle verifier](#trust-core-2-the-client-side-merkle-verifier)
- [Autonomous live pools](#autonomous-live-pools)
- [Provenance model](#provenance-model)
- [Engine API surface](#engine-api-surface)
- [Data flow: one EV verdict](#data-flow-one-ev-verdict)
- [Tech stack](#tech-stack)

## System at a glance

Two independently deployable services plus a shared type contract.

```
                        Renaiss Index API (beta)          BNB Chain
                        real card valuations              gacha contract
                        indices, price history            getMerkleRoot(packId)
                                  |                              |
                                  v                              v
   browser  ───HTTP──▶  Go engine (:8080)  ──reads──▶  [ FMV oracle ]   [ on-chain root ]
   (Next.js)             adapter · EV engine · cache
      │                       │
      │  if engine down:      └── typed JSON API (Sourced[T], every payload carries provenance)
      │  bundled snapshot
      │
      ├── EV verdict + distribution + "under the hood" glass-box math
      ├── client-side Merkle recompute (Web Crypto, server not involved)
      └── grounded AI advisor  ──server route──▶  DeepSeek (key server-only)
```

- The **web app** (Next.js) renders the UI, runs the fairness verifier entirely in the browser, and hosts the
  one server route that talks to the AI provider. It calls the engine over HTTP (`ENGINE_URL`).
- The **Go engine** is the data + math layer: it reads the Renaiss Index oracle and the on-chain root, builds
  pools, computes EV, and serves a typed JSON API where **every payload carries its provenance**.
- If the engine is unreachable, the web app falls back to a **bundled snapshot** committed at build time, so the
  app never shows a blank screen. The fallback is labeled `BUNDLED SNAPSHOT`, so it is never mistaken for live.

## Repository layout

```
/web        Next.js (App Router) + TypeScript + Tailwind. UI, client-side Merkle verifier, AI route.
/engine     Go service. Data adapter, EV engine, Renaiss Index client, autonomous pool loop, JSON API.
/shared     Type definitions shared by Go and TypeScript, kept in lockstep (the wire contract).
/docs       This doc, data-sources.md, safety.md, and the guided walkthrough (demo-script.md).
```

The `/shared/types.ts` file is the canonical wire contract; `engine/types.go` mirrors it field-for-field, so the
JSON the engine emits and the TypeScript the web consumes cannot drift.

## The data adapter layer

Renaiss ships a real Index API for card **valuations**, and commits each sealed pack's card pool as an on-chain
**Merkle root** on BNB Chain, but it exposes **no** REST API for pool contents, draw odds, or individual draw
proofs. The adapter layer is built around that reality:

- **Real, wherever a card resolves:** every card price is a live Renaiss Index valuation.
- **A labeled PullEV model, only where the data does not exist:** which real cards make up each pack, and the
  band draw chances.

Everything routes through one interface so the boundary between real and modeled is a single, testable seam:

```go
type PackDataAdapter interface {
    ListPacks(ctx) ([]Pack, Provenance, error)
    GetPool(ctx, packID) (Pool, Provenance, error)   // cards in pool + FMV each
    Source() SourceKind
}
```

Every method returns a `Provenance` alongside its data, and every payload the API emits is a `Sourced[T]`
(`{ data, provenance }`), so a value can never travel through the system without its origin attached. See
[`docs/data-sources.md`](data-sources.md) for the per-datapoint breakdown.

## Trust core 1: the EV engine

The EV verdict is computed by PullEV's own Go engine, **not** estimated by a model or a language model.
`ComputeEV` in [`../engine/ev.go`](../engine/ev.go) is a pure, deterministic function of its inputs: no clock, no
network, no hidden state. Given the pool (each card's real FMV and its draw weight) and the pack cost, it returns:

| Output | Formula |
| --- | --- |
| `expectedValue` | `Σ pᵢ · fmvᵢ`, where `pᵢ = weightᵢ / Σ weight` (one card drawn per pull). Equivalently, grouped by band, `Σ (band draw chance × band average FMV)`. |
| `evToCostRatio` | `expectedValue / cost` (the edge) |
| `chanceOfProfit` | `Σ pᵢ where fmvᵢ ≥ cost` |
| `distribution` | p10 / median / p90, inverse-CDF percentiles of the discrete outcome distribution |
| `inputsHash` | SHA-256 of the canonical inputs (order-independent, timestamp excluded), so identical inputs always reproduce the same verdict and the same hash |
| `caveats` | honest limitations derived from the inputs (real vs. assumed prices, unconfirmed pack price, model odds) |

It is covered by unit, determinism, and fuzz tests ([`../engine/ev_test.go`](../engine/ev_test.go)). Because the
verdict is the crux of the "should I rip this?" answer, the app does not hide the math: the X-Ray Bay's
**"Under the hood" panel** ([`../web/components/Filmstrip.tsx`](../web/components/Filmstrip.tsx)) renders the exact
band-by-band sum that builds the expected value, the edge and profit formulas with their real values, the
`inputsHash`, and a live count of how many prices are real Renaiss Index reads. It is the EV twin of the fairness
verifier: don't trust the verdict, read the computation that produced it.

## Trust core 2: the client-side Merkle verifier

The fairness check runs **entirely in the browser** via Web Crypto; PullEV's server is not involved in the
recompute. [`../web/lib/merkle.ts`](../web/lib/merkle.ts) and [`../engine/merkle.go`](../engine/merkle.go)
implement the same scheme byte-for-byte, so the browser recompute agrees with the engine.

Scheme (domain-separated SHA-256):

```
leaf = SHA256( 0x00 || "cardId:fmv:weight" )
node = SHA256( 0x01 || left || right )      odd nodes duplicate the last
```

Two things are kept deliberately distinct so nothing is presented as more than it is:

- **The real on-chain root.** For each of the 12 sealed packs, the engine reads Renaiss's genuine committed root
  from the gacha contract on BNB Chain via `getMerkleRoot(packId)` and shows it with a BscScan link, so anyone can
  reproduce the lookup and trust the chain, not us.
- **The example recompute.** Renaiss does not expose a sealed pack's full contents, so PullEV cannot yet rebuild
  that exact tree. The verifier demonstrates the identical verification math on labeled EXAMPLE proofs (one valid,
  one tampered) over the labeled pool; the example's root is labeled "computed by PullEV, not Renaiss's on-chain
  root." When the pool contents and leaf scheme are published, the same verifier checks the real root unchanged.

## Autonomous live pools

The engine runs a background loop ([`../engine/livepool.go`](../engine/livepool.go)) that keeps the data fresh
instead of frozen at build time:

1. Re-prices the whole ~148-card library off the Renaiss Index on `REFRESH_INTERVAL`.
2. Rotates each live pack's chase cards from that freshly priced library, so pool membership evolves over time.
3. Accepts a rotated pool **only if** its EV verdict lands in a believable band, so a demo never surfaces an
   absurd edge; otherwise the previous pool (or the embedded fixture) stands.

Each pool then carries a real last-refresh timestamp (the badge shows the date and time). With no partner keys the
loop stays off and the embedded fixtures serve unchanged, so the app is always demo-safe. A guarded
`POST /api/admin/refresh` (header `X-Refresh-Token` matching `REFRESH_TOKEN`) triggers a cycle on demand.

## Provenance model

Every value the UI renders reaches a badge. There is no unlabeled number anywhere.

| Badge | Meaning |
| --- | --- |
| `LIVE` (per card) | Real Renaiss Index valuation, with confidence and freshness |
| `OFFICIAL` | Real Renaiss Index data (oracle lookup, vault, market indices) |
| `PULLEV MODEL` | Pool membership and draw odds (a labeled construction; Renaiss has no odds API) |
| `ASSUMED` (per card) | A rare unresolved card price (the pools are otherwise 100% real) |
| `BUNDLED SNAPSHOT` | The engine was unreachable; committed offline fallback data |
| `EXAMPLE` | A demonstration Merkle proof, never a real Renaiss draw |

Implemented in [`../web/components/ProvenanceBadge.tsx`](../web/components/ProvenanceBadge.tsx). The engine
enforces the same discipline by wrapping every response in `Sourced[T]`.

## Engine API surface

All responses are typed JSON; data-bearing endpoints return `Sourced[T]` with provenance attached.

| Method + path | Returns |
| --- | --- |
| `GET /api/health` | Liveness + active adapter |
| `GET /api/packs` | The 15 real packs, with the shelf's live refresh provenance |
| `GET /api/packs/{id}/pool` | A pack's pool (cards + per-card FMV + draw weight) |
| `GET /api/packs/{id}/ev` | The EV verdict (expected value, edge, distribution, chance of profit, inputsHash, caveats) |
| `GET /api/packs/{id}/example-proof?variant=valid\|tampered` | A labeled EXAMPLE Merkle proof for the verifier |
| `GET /api/cards` | The full ~148-card priced library (Vault Index) |
| `GET /api/indices` | Real Renaiss market indices (per game) |
| `GET /api/value/cert/{cert}` | A real Renaiss Index valuation for a PSA/CGC/BGS cert |
| `POST /api/admin/refresh` | Token-gated manual re-price + rotation trigger |

The web app's one server route, `POST /api/advisor` ([`../web/app/api/advisor/route.ts`](../web/app/api/advisor/route.ts)),
builds a context from the EV result and pool, calls DeepSeek with a strictly-grounded system prompt, and returns a
cited answer. The AI key is server-only and never reaches the browser.

## Data flow: one EV verdict

1. The web app requests `GET /api/packs/{id}/pool` and `GET /api/packs/{id}/ev` from the engine.
2. The engine's adapter returns the pool: real Renaiss Index prices per card, plus the modeled draw weights.
3. `ComputeEV` runs as a pure function over that pool and the pack cost, producing the verdict + `inputsHash`.
4. The response is wrapped as `Sourced[EVResult]` with provenance and served as JSON.
5. The web app renders the verdict, the distribution histogram, the "what is loaded" bands, and the "Under the
   hood" glass-box computation, every number badged.
6. If the engine is unreachable at step 1, the web app computes the same result from the committed snapshot and
   labels the whole surface `BUNDLED SNAPSHOT`.

## Tech stack

- **Web:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind. Fairness verifier via Web Crypto.
  Advisor via a Node-runtime server route to DeepSeek.
- **Engine:** Go 1.25, standard-library `net/http` router, `go:embed` fixtures for offline safety.
- **Data:** Renaiss Index API (beta) for valuations, indices, and price history; BNB Chain public RPC for the
  on-chain root; a file-backed cache plus a committed seed for demo safety.
- **Deploy:** engine on Railway (multi-stage Docker, static binary with fixtures embedded), web on Vercel.
