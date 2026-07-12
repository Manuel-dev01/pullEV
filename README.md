# PullEV

> Know the EV before you rip, then verify any pull's fairness yourself, client-side.

PullEV is a decision tool for [Renaiss](https://www.renaiss.xyz)'s **Infinite Gacha** packs. It answers the two
questions every ripper asks, and it grounds every number in a labeled source:

1. **"Should I rip this pack?"** Live expected value (EV) of a pull versus its cost, computed from the pack's pool
   and real Renaiss Index oracle prices, with the full value distribution and chance of profit.
2. **"Was my pull fair?"** An independent, **client-side Merkle-proof verifier** that recomputes a draw's inclusion
   proof in your own browser, checked against Renaiss's real on-chain root. You trust the math, not a claim.

A grounded **AI Pull Advisor** explains each verdict in plain language and cites every number back to its source.
It refuses anything it cannot source.

**Live demo:** [pullev.vercel.app](https://pullev.vercel.app) &middot;
**Video (90s):** [YouTube](https://www.youtube.com/watch?v=2mFQuAnavfQ) &middot;
**Engine health:** [`/api/health`](https://pullev-engine-production.up.railway.app/api/health)

> **New here? start with the [guided walkthrough](docs/demo-script.md)** (drive it yourself in ~2 minutes),
> then skim [Quickstart](#quickstart) and [Safety](#safety-and-responsible-handling).

## Contents

- [Quickstart](#quickstart)
- [Guided walkthrough](#guided-walkthrough)
- [Who it is for](#who-it-is-for)
- [What it does](#what-it-does)
- [Value inside the Renaiss ecosystem](#value-inside-the-renaiss-ecosystem)
- [Architecture](#architecture)
- [Data sources, assumptions, and limitations](#data-sources-assumptions-and-limitations)
- [Safety and responsible handling](#safety-and-responsible-handling)
- [Deploy](#deploy)
- [Project layout](#project-layout)
- [Documentation](#documentation)

## Quickstart

**Just want to see it?** Open [pullev.vercel.app](https://pullev.vercel.app). Nothing to install, no wallet, no
account. Then follow the [guided walkthrough](docs/demo-script.md).

**Run it locally** (two terminals):

```bash
# 1. engine (Go API) -> http://localhost:8080
cd engine
cp .env.example .env      # optional: add Renaiss Index keys for the partner tier
go run .

# 2. web (Next.js) -> http://localhost:3000
cd web
cp .env.example .env      # set ENGINE_URL, and DEEPSEEK_API_KEY to enable the advisor
npm install
npm run dev
```

Open `http://localhost:3000`. **With no keys at all it still runs:** the engine serves its committed real-price
seed and the public Index tier, and the advisor shows a labeled "not configured" message until `DEEPSEEK_API_KEY`
is set. Kill the engine and the web app keeps working from a bundled snapshot (badged `BUNDLED SNAPSHOT`), so the
demo never blanks.

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

## Guided walkthrough

The full click-through (what to click, what you will see, why it matters) lives in
[`docs/demo-script.md`](docs/demo-script.md). The short version, leading with the differentiator:

1. **Verify a pull (`/verify`).** See Renaiss's real on-chain Merkle root for a sealed pack (with a BscScan link),
   then recompute an example proof in your own browser: green VERIFIED, tamper a byte for red MISMATCH.
2. **Should you rip? (`/app`).** Real packs with live edges, EV vs cost, a distribution, and the "under the hood"
   glass-box computation behind the number.
3. **Ask the advisor.** It cites every figure or refuses, and ends with "Not financial advice."

## Who it is for

PullEV serves everyone who touches an Infinite Gacha pack, with a concrete job for each:

- **Collectors and rippers.** Before paying, a sourced answer to "should I rip this pack?" (EV vs cost,
  distribution, chance of profit). After a pull, an independent answer to "was my pull fair?" by recomputing the
  Merkle proof in your own browser. You act on numbers with visible sources, not vibes.
- **Builders and the Renaiss Tool Directory.** A reusable pattern: a client-side Merkle verifier and a strictly
  grounded AI layer that cites or refuses. Both apply directly to other Renaiss tools.
- **Operators (vaults, card shops, RenaissOS nodes).** An independent transparency layer over the packs they run:
  FMV-grounded EV and provable, client-side fairness that anyone can check.
- **The Renaiss community.** Labeled, independent evidence that the flagship Infinite Gacha is fair and
  EV-transparent, with every number traceable to a source.

## What it does

- **EV verdict (`/app`, `/`).** Pick from Renaiss's real pack lineup, see EV vs cost, the edge, chance of profit,
  a value histogram, and a "what is loaded" breakdown of PullEV's three draw bands, computed from prices re-priced
  live off the Renaiss Index. Each card shows whether its price is a live Index valuation (LIVE) or a labeled
  assumption (ASSUMED), and the pool badge shows its real last-refresh time. A collapsible "Under the hood" panel
  shows the exact glass-box math behind the verdict.
- **Fairness verifier (`/verify`, and Station 04 in `/app`).** Paste your own `{leafPreimage, proofPath,
  publishedRoot}`, or load a labeled EXAMPLE, and watch the Merkle root recompute in your browser via Web Crypto.
  Green VERIFIED on a match, red MISMATCH on a tampered proof. For each of the 12 sealed packs, the page also shows
  Renaiss's **real on-chain Merkle root**, read from the gacha contract on BNB Chain via `getMerkleRoot(packId)`,
  with a BscScan link so anyone can reproduce it.
- **Vault Index (`/vault`).** The full ~148-card real graded-card library the pools price from, sorted by value,
  with real price-history sparklines, so every EV number traces back to a card you can see.
- **Oracle lookup (`/value`).** Enter a PSA/CGC/BGS cert number for its real Renaiss Index valuation (price, grade,
  confidence, trend, freshness), with the rate limit surfaced.
- **AI Pull Advisor (floating orb in `/app`).** Ask about a pack. It answers only from that pack's computed context
  and cites every figure. Out-of-context questions are refused.

## Value inside the Renaiss ecosystem

PullEV targets the heart of Renaiss, not the edges. Infinite Gacha is Renaiss's core, perpetual pack mechanic, so
making it transparent makes the flagship product itself transparent rather than building something adjacent. It
plugs directly into Renaiss primitives:

- **The FMV / CMV Index oracle** is PullEV's price source. Card values come from the real Renaiss Index API (beta),
  the same oracle that aligns on-chain price to real market value, re-priced live on a schedule.
- **The Merkle-proof and zero-knowledge fairness structure** is exactly what the verifier checks. Renaiss seals
  each draw with blockchain-level fairness; PullEV recomputes that inclusion proof independently, client-side.
- **Vault-backed pools** are what the EV is computed against: real graded cards held in custody, mirrored on-chain,
  on BNB Chain.
- **Reads only, never transacts.** No wallet, no writes. PullEV complements the on-chain layer (SBT identity,
  RenaissOS verification nodes) instead of duplicating it, and it is safe to run against the live ecosystem.

The result: a tool that audits Renaiss's own flagship for fairness and expected value, live, in a way anyone can
independently verify.

## Architecture

Two independently deployable services plus a shared type contract:

```
/web        Next.js (App Router) + TypeScript + Tailwind. UI, client-side Merkle verifier, AI route.
/engine     Go service. Data adapter, EV engine, Renaiss Index client, autonomous pool loop, JSON API.
/shared     Type definitions shared by Go and TypeScript, kept in lockstep (the wire contract).
```

The web app calls the Go engine over HTTP (`ENGINE_URL`); if the engine is unreachable it serves a bundled
snapshot, clearly badged `BUNDLED SNAPSHOT`, so the app never blanks. The two trust-critical computations are
built to be reproduced independently: the **EV engine** is a pure, deterministic Go function with a SHA-256
`inputsHash` (surfaced in the "Under the hood" panel), and the **Merkle verifier** runs entirely in the browser
via Web Crypto, byte-identical to the engine's scheme.

**Full detail, with the system diagram, data flow, provenance model, and API surface, is in
[`docs/architecture.md`](docs/architecture.md).**

## Data sources, assumptions, and limitations

- **Real (Renaiss Index API, beta):** card valuations (price, grade, confidence, trend, freshness) for a library
  of ~148 distinct graded cards, re-priced autonomously on a schedule. Badged LIVE per card and OFFICIAL on the
  oracle and vault pages. All 15 pack prices and top prizes are verified from the live Renaiss site (3 live
  Infinite + Champion + 11 previous, all sold-out $100 limiteds).
- **PullEV model (labeled assumptions):** pack pool membership and draw odds. **Every card price is real** (live
  Renaiss Index), from the cheap commons to the rare chase; there is no fabricated filler. What is modeled is only
  (a) which real cards make up each pack and (b) the band draw chances, because Renaiss exposes no pool or odds API.
  Odds use PullEV's own three-band model (Chase <1% / Mid ~29% / Common ~70%), weighted heavily to cheap commons
  like real gacha, so the EV reads as an honest house edge computed from real prices. The EV is therefore **real
  prices under a modeled pool, not a measurement of Renaiss's own pack** (whose true contents and odds are not
  public).
- **EXAMPLE (labeled):** the demo Merkle proofs. Renaiss commits each pack's pool as an on-chain Merkle root
  (auditable on BscScan with the pack ID) but does not expose the pool's full contents, so PullEV cannot yet
  rebuild that exact tree. It demonstrates the same verification math with example proofs (one valid, one tampered)
  over the labeled pool, never presented as real Renaiss draws. Once the pool contents and leaf scheme are
  available, the same verifier checks the real root.
- **Limitations:** PullEV reads and verifies. It never transacts. No wallet connection, no auth, no on-chain
  writes. Model and example data are always labeled and never presented as authoritative.

The per-datapoint breakdown is in [`docs/data-sources.md`](docs/data-sources.md).

## Safety and responsible handling

PullEV is built so its safety claims are verifiable, not just asserted. One line each, with the full,
file-referenced detail in [`docs/safety.md`](docs/safety.md):

- **User data:** none collected. No accounts, auth, sessions, cookies, or analytics. The only input is a public
  grading cert number on `/value`.
- **Wallet data:** never touched. No wallet connection, keys, signing, or transactions. There are no web3 libraries
  in the project. PullEV reads and verifies only.
- **API access and secrets:** env-only, never committed. `.env` is gitignored everywhere; the DeepSeek key is
  server-only and never reaches the browser; the admin refresh endpoint is token-gated and off by default.
- **AI outputs:** the advisor cites every number or refuses, never presents an estimate as verified fact, and is
  always labeled as an AI assist. It is never blended into the app's factual displays.
- **Provenance:** every number on screen reaches a badge (LIVE / ASSUMED / PULLEV MODEL / BUNDLED SNAPSHOT /
  OFFICIAL); model and example data are never shown as authoritative.

## Deploy

- **Engine to Railway:** the multi-stage [`engine/Dockerfile`](engine/Dockerfile) builds a static binary with
  fixtures embedded. Set `WEB_ORIGIN` to the web URL, the Renaiss keys, and (optionally) `REFRESH_INTERVAL` and
  `REFRESH_TOKEN`, then `railway up`.
- **Web to Vercel:** set the project root to `web/`, set `ENGINE_URL` to the engine URL and `DEEPSEEK_API_KEY`,
  then deploy. The `../shared` types resolve from the monorepo clone.

## Project layout

```
/web        Next.js app: landing, /app filmstrip, /verify, /vault, /value, advisor route.
/engine     Go engine: adapter, EV engine (ev.go), Merkle (merkle.go), live pools (livepool.go), API (main.go).
/shared     Shared TypeScript/Go type contract.
/docs       Architecture, data sources, safety, and the guided walkthrough.
```

## Documentation

- [Guided walkthrough](docs/demo-script.md): drive the app yourself in ~2 minutes.
- [Architecture](docs/architecture.md): system diagram, trust cores, provenance model, API surface.
- [Data sources](docs/data-sources.md): per-datapoint provenance, what is real vs. modeled vs. example.
- [Safety](docs/safety.md): verifiable, file-referenced handling of user data, wallets, secrets, and AI outputs.

---

Card names and images are shown for identification only. Pokémon, One Piece, and related marks are property of
their respective owners. Not financial advice.
