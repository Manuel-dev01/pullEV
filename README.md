# PullEV

> Know the EV before you rip, then verify any pull's fairness yourself, client-side.

PullEV is a decision tool for [Renaiss](https://www.renaiss.xyz)'s **Infinite Gacha** packs. It answers
the two questions every ripper asks, and it grounds every number in a labeled source:

1. **"Should I rip this pack?"** Live expected value (EV) of a pull versus its cost, computed from the
   pack's pool and real Renaiss Index oracle prices, with the full value distribution and chance of profit.
2. **"Was my pull fair?"** An independent **client-side Merkle-proof verifier** that recomputes a draw's
   inclusion proof in your own browser. You trust the math, not a claim.

A grounded **AI Pull Advisor** explains each verdict in plain language and cites every number back to its
source (EV engine, distribution, pool, or the Renaiss Index oracle). It refuses anything it cannot source.

Built for the **Renaiss Tech Hackathon Season 1** (Tool track, with a grounded AI assist layer).

## Live demo

- App: https://pullev.vercel.app
- Engine health: https://pullev-engine-production.up.railway.app/api/health

A 90 second walkthrough lives in [`docs/demo-script.md`](docs/demo-script.md).

## Who it is for and the job it does

PullEV serves everyone who touches an Infinite Gacha pack, with a concrete job for each:

- **Collectors and rippers.** Before paying, see a sourced answer to "should I rip this pack?" (EV versus cost,
  the value distribution, chance of profit). After a pull, get an independent answer to "was my pull fair?" by
  recomputing the Merkle proof in your own browser. You act on numbers with visible sources, not vibes.
- **Builders and the Renaiss Tool Directory.** A working, reusable pattern: a client-side Merkle verifier and a
  strictly grounded AI layer that cites or refuses. Both are directly applicable to other Renaiss tools.
- **Operators (vaults, card shops, RenaissOS nodes).** An independent transparency layer over the packs they run:
  FMV-grounded EV and provable, client-side fairness that anyone can check, which builds trust in the product.
- **The Renaiss community.** Labeled, independent evidence that the flagship Infinite Gacha is fair and
  EV-transparent, with every number traceable to a source.

## What it does

- **EV verdict (`/app`, `/`).** Pick from Renaiss's real pack lineup, see EV vs cost, the edge, chance of
  profit, a value histogram, and a "what is loaded" breakdown of PullEV's three draw bands, computed from
  prices re-priced live off the Renaiss Index. Every card shows whether its price is a live Renaiss Index
  valuation (LIVE) or a labeled assumption (ASSUMED), and the pool badge shows its real last-refresh time.
- **Vault Index (`/vault`).** The full real graded-card library the packs draw from, each a real Renaiss
  Index valuation, sorted by value, so every EV number traces back to a card you can see.
- **Fairness verifier (`/verify`, and Station 04 in `/app`).** Paste your own `{leafPreimage, proofPath,
  publishedRoot}`, or load a labeled EXAMPLE, and watch the Merkle root recompute in your browser via Web
  Crypto. Green VERIFIED on a match, red MISMATCH on a tampered proof. PullEV's server is not involved.
  For each sealed pack (12 of them), the page also shows Renaiss's **real on-chain Merkle root**, read from
  the Renaiss gacha contract on BNB Chain via `getMerkleRoot(packId)`, with a BscScan link so anyone can
  reproduce the lookup and trust the chain, not us.
- **Oracle lookup (`/value`).** Enter a PSA/CGC/BGS cert number to pull its real Renaiss Index valuation
  (price, grade, confidence, trend, freshness), with the rate limit surfaced.
- **AI Pull Advisor (floating orb in `/app`).** Ask about a pack. The advisor answers only from that
  pack's computed context and cites every figure. Out-of-context questions are refused.

## Value inside the Renaiss ecosystem

PullEV targets the heart of Renaiss, not the edges. Infinite Gacha is Renaiss's core, perpetual pack mechanic,
so making it transparent makes the flagship product itself transparent rather than building something adjacent.
It plugs directly into Renaiss primitives:

- **The FMV / CMV Index oracle** is PullEV's price source. Card values come from the real Renaiss Index API (beta),
  the same oracle that aligns on-chain price to real market value, and are re-priced live on a schedule.
- **The Merkle-proof and zero-knowledge fairness structure** is exactly what the verifier checks. Renaiss seals
  each draw with blockchain-level fairness; PullEV recomputes that inclusion proof independently, client-side.
- **Vault-backed pools** are what the EV is computed against: real graded cards held in custody, mirrored on-chain,
  on BNB Chain.
- **Reads only, never transacts.** No wallet, no writes. PullEV complements the on-chain layer (SBT identity,
  RenaissOS verification nodes) instead of duplicating it, and it is safe to run against the live ecosystem.

The result: a tool that audits Renaiss's own flagship for fairness and expected value, live, in a way anyone can
independently verify. That is the case for listing it in the Renaiss Tool Directory.

## Architecture

```
/web        Next.js (App Router) + TypeScript + Tailwind. UI, client-side Merkle verifier, AI route.
/engine     Go service. Data adapter layer, EV engine, Renaiss Index client, typed JSON API.
/shared     Type definitions shared by Go and TypeScript, kept in lockstep.
/docs       Data-source labels and the demo script.
```

The web app calls the Go engine over HTTP (`ENGINE_URL`). If the engine is unreachable, the web app
serves a bundled offline snapshot, clearly badged BUNDLED SNAPSHOT, so a demo never shows a blank screen.

### The data adapter layer

Renaiss ships a real Index API for card valuations, and commits each pack's card pool as an on-chain Merkle
root on BNB Chain (auditable via BscScan with the pack ID), but exposes no REST API for pool contents, odds,
or the individual draw proofs. So pool membership and draw weights are a **PullEV model** (labeled
assumptions), while card prices are **real** Renaiss Index valuations wherever a card resolves. Everything routes through one `PackDataAdapter`
interface, and every number reaches a provenance badge in the UI. See
[`docs/data-sources.md`](docs/data-sources.md) for the per-datapoint breakdown.

The pools cover Renaiss's real 15-pack lineup: three live Infinite packs (Eden $150, OMEGA $48, RenaCrypt
$88), the limited Champion Pack ($100, sold out), and 11 real previous packs ($100, limited, sold out,
shown as a retired showcase). All prices are verified from the live site. Every pool is built from a
library of ~148 distinct real graded cards (One Piece and Pokémon) priced off the Renaiss Index.

### Autonomous live pools

The engine runs a background loop ([`engine/livepool.go`](engine/livepool.go)) that re-prices the whole
card library off the Renaiss Index on a schedule and rotates each pack's chase cards from that library, so
prices and pool membership stay fresh instead of frozen at build time. Each pool then carries a real
last-refresh timestamp (the badge shows the date and time). A rotated pool is only accepted if its EV
verdict lands in a believable band, so a demo never shows an absurd edge; otherwise the previous pool (or
the embedded fixture) stands. With no partner keys the loop stays off and the embedded fixtures serve
unchanged, so the app is always demo-safe. A guarded `POST /api/admin/refresh` (header `X-Refresh-Token`
matching `REFRESH_TOKEN`) triggers a cycle on demand.

### The EV engine (the trust core)

The EV verdict is computed by PullEV's own Go engine, not estimated by a model or a language model.
`ComputeEV` in [`engine/ev.go`](engine/ev.go) is a pure, deterministic function of its inputs: no clock, no
network, no hidden state. Given the pool (each card's real FMV and its draw weight) and the pack cost, it
computes:

- `expectedValue = Σ pᵢ · fmvᵢ`, where `pᵢ = weightᵢ / Σ weight` (one card drawn per pull). Equivalently,
  grouped by band, `EV = Σ (band draw chance × band average FMV)`.
- `evToCostRatio = expectedValue / cost` (the edge), `chanceOfProfit = Σ pᵢ where fmvᵢ ≥ cost`.
- a p10 / median / p90 distribution (inverse-CDF percentiles of the discrete outcome distribution).
- `inputsHash`, a SHA-256 fingerprint of the canonical inputs (order-independent, excludes the timestamp),
  so the same pool always reproduces the same verdict and the same hash.
- honest `caveats` derived from the inputs (real vs. assumed prices, unconfirmed pack price, model odds).

It is covered by unit, determinism, and fuzz tests ([`engine/ev_test.go`](engine/ev_test.go)). Because the
verdict is the crux of the "should I rip this?" answer, the app does not hide the math: the **X-Ray Bay's
"Under the hood" panel** ([`web/components/Filmstrip.tsx`](web/components/Filmstrip.tsx)) renders the exact
band-by-band sum that builds the expected value, the edge and profit formulas with their real values, the
`inputsHash`, and a live count of how many prices are real Renaiss Index reads. It is the EV twin of the
client-side Merkle verifier: don't trust the verdict, read the computation that produced it.

### The Merkle scheme

SHA-256, domain-separated: `leaf = SHA256(0x00 || "cardId:fmv:weight")`,
`node = SHA256(0x01 || left || right)`, odd nodes duplicated. [`engine/merkle.go`](engine/merkle.go) and
[`web/lib/merkle.ts`](web/lib/merkle.ts) implement it byte-for-byte identically, so the browser recompute
agrees with the engine. The scheme is a documented assumption, pluggable pending confirmation from Renaiss.

## Run locally

```bash
# 1. engine (Go API), http://localhost:8080
cd engine
cp .env.example .env      # optional: add Renaiss Index keys for the partner tier
go run .

# 2. web (Next.js), http://localhost:3000
cd web
cp .env.example .env      # set ENGINE_URL and DEEPSEEK_API_KEY (optional)
npm install
npm run dev
```

Without any keys the engine still runs (public Index tier and committed seed), and the advisor shows a
labeled "not configured" message until `DEEPSEEK_API_KEY` is set.

### Environment variables

Engine (`engine/.env`):

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `8080` |
| `WEB_ORIGIN` | Comma-separated CORS allowlist | localhost dev origins |
| `RENAISS_INDEX_URL` | Renaiss Index base URL | `https://api.renaissos.com` |
| `RENAISS_API_KEY` | Partner key (`rk_...`), optional | public tier if empty |
| `RENAISS_API_SECRET` | Partner secret (`rsk_...`), optional | public tier if empty |
| `VALUATION_CACHE` | Runtime cache path | `cache/valuations.json` |
| `REFRESH_INTERVAL` | Autonomous re-price + rotation interval (Go duration) | `6h` (Railway runs `1h`) |
| `REFRESH_TOKEN` | Enables the guarded `POST /api/admin/refresh` trigger | unset (endpoint disabled) |

Web (`web/.env`):

| Variable | Purpose | Default |
| --- | --- | --- |
| `ENGINE_URL` | Base URL of the Go engine | `http://localhost:8080` |
| `DEEPSEEK_API_KEY` | Advisor key, server-only | advisor disabled if empty |

Keys are read from the environment only and are never committed. `.env` files are gitignored.

## Data sources, assumptions, and limitations

- **Real (Renaiss Index API, beta):** card valuations (price, grade, confidence, trend, freshness) for a
  library of ~148 distinct graded cards, re-priced autonomously on a schedule. Badged LIVE per card and
  OFFICIAL on the oracle and vault pages. All 15 pack prices and top prizes are verified from the live
  Renaiss site (3 live Infinite + Champion + 11 previous, all sold-out $100 limiteds).
- **PullEV model (labeled assumptions):** pack pool membership and draw odds. **Every card price is real**
  (live Renaiss Index), from the cheap commons to the rare chase; there is no fabricated filler. What is
  modeled is only (a) which real cards make up each pack and (b) the band draw chances, because Renaiss
  exposes no pool or odds API. Odds use PullEV's own three-band model (Chase <1% / Mid ~29% / Common ~70%),
  weighted heavily to cheap commons like real gacha, so the EV reads as an honest house edge computed from
  real prices. Renaiss publishes a *per-pack* tiered "what is loaded" (e.g. Tier S/A/B/C on OMEGA,
  Crown/Bloom/Thorn on Eden) whose exact chances aren't public, so we claim no Renaiss scheme and set the
  rare band <1% as a labeled assumption. The EV is therefore **real prices under a modeled pool, not a
  measurement of Renaiss's own pack** (whose true contents and odds are not public).
- **EXAMPLE (labeled):** the demo Merkle proofs. Renaiss commits each pack's pool as an on-chain Merkle root
  (auditable on BscScan with the pack ID) but does not expose the pool's full contents, so PullEV cannot yet
  rebuild that exact tree. It demonstrates the same verification math with example proofs (one valid, one
  tampered) over the labeled pool. They are never presented as real Renaiss draws, and the example's root is
  labeled "computed by PullEV over the labeled pool, not Renaiss's on-chain root." The recompute is genuine
  and client-side; once the pool contents and leaf scheme are available, the same verifier checks the real root.
- **Limitations:** PullEV reads and verifies. It never transacts. No wallet connection, no auth, no
  on-chain writes. Model and example data are always labeled and never presented as authoritative.

## Deploy

- **Engine to Railway:** the multi-stage [`engine/Dockerfile`](engine/Dockerfile) builds a static binary
  with fixtures embedded. Set `WEB_ORIGIN` to the web URL, the Renaiss keys, and (optionally)
  `REFRESH_INTERVAL` and `REFRESH_TOKEN`, then `railway up`.
- **Web to Vercel:** set the project root to `web/`, set `ENGINE_URL` to the engine URL and
  `DEEPSEEK_API_KEY`, then deploy. The `../shared` types resolve from the monorepo clone.

## Safety and responsible handling

PullEV is built so its safety claims are verifiable, not just asserted. In one line each, with the full,
file-referenced detail in [`docs/safety.md`](docs/safety.md):

- **User data:** none collected. No accounts, auth, sessions, cookies, or analytics. The only input is a public
  grading cert number on `/value`.
- **Wallet data:** never touched. No wallet connection, keys, signing, or transactions. There are no web3
  libraries in the project. PullEV reads and verifies only.
- **API access and secrets:** env-only, never committed. `.env` is gitignored everywhere; the DeepSeek key is
  server-only and never reaches the browser; the admin refresh endpoint is token-gated and off by default.
- **AI outputs:** the advisor cites every number or refuses, never presents an estimate as verified fact, and is
  always labeled as an AI assist. It is never blended into the app's factual displays.
- **Provenance:** every number on screen reaches a badge (LIVE / ASSUMED / PULLEV MODEL / BUNDLED SNAPSHOT /
  OFFICIAL); model and example data are never shown as authoritative.

Card names and images are shown for identification only. Pokémon, One Piece, and related marks are property of
their respective owners. Not financial advice.
