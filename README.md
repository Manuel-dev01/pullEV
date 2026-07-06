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

- App: `TODO_WEB_URL`
- Engine health: `TODO_ENGINE_URL/api/health`

A 60 to 90 second walkthrough lives in [`docs/demo-script.md`](docs/demo-script.md).

## What it does

- **EV verdict (`/app`, `/`).** Pick a pack, see EV vs cost, the edge, chance of profit, and a value
  histogram. Every card shows whether its price is a live Renaiss Index valuation (LIVE) or a labeled
  assumption (ASSUMED).
- **Fairness verifier (`/verify`, and Station 04 in `/app`).** Paste your own `{leafPreimage, proofPath,
  publishedRoot}`, or load a labeled EXAMPLE, and watch the Merkle root recompute in your browser via Web
  Crypto. Green VERIFIED on a match, red MISMATCH on a tampered proof. PullEV's server is not involved.
- **Oracle lookup (`/value`).** Enter a PSA/CGC/BGS cert number to pull its real Renaiss Index valuation
  (price, grade, confidence, trend, freshness), with the rate limit surfaced.
- **AI Pull Advisor (floating orb in `/app`).** Ask about a pack. The advisor answers only from that
  pack's computed context and cites every figure. Out-of-context questions are refused.

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

Renaiss ships a real Index API for card valuations, but no pack, pool, odds, or draw/proof API. So pool
membership and draw weights are a **PullEV model** (labeled assumptions), while card prices are **real**
Renaiss Index valuations wherever a card resolves. Everything routes through one `PackDataAdapter`
interface, and every number reaches a provenance badge in the UI. See
[`docs/data-sources.md`](docs/data-sources.md) for the per-datapoint breakdown.

### The EV engine (the trust core)

`ComputeEV` in [`engine/ev.go`](engine/ev.go) is a pure, deterministic function: expected value, EV-to-cost
ratio, a p10/median/p90 distribution, chance of profit, an inputs hash, and honest caveats. It exposes
every input that produced the number and is covered by unit, determinism, and fuzz tests.

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

Web (`web/.env`):

| Variable | Purpose | Default |
| --- | --- | --- |
| `ENGINE_URL` | Base URL of the Go engine | `http://localhost:8080` |
| `DEEPSEEK_API_KEY` | Advisor key, server-only | advisor disabled if empty |

Keys are read from the environment only and are never committed. `.env` files are gitignored.

## Data sources, assumptions, and limitations

- **Real (Renaiss Index API, beta):** card valuations (price, grade, confidence, trend, freshness). Badged
  LIVE per card and OFFICIAL on the oracle page. Verified pack prices: Omega $48, Renacrypt $88.
- **PullEV model (labeled assumptions):** pack pool membership, draw weights, and the representative
  commons tier. Renaiss exposes no pool or odds API, so these are our construction, badged PULLEV MODEL and
  ASSUMED. Eden pack price ($150) is from project notes, pending live re-confirmation.
- **EXAMPLE (labeled):** the demo Merkle proofs. Renaiss exposes no draw or proof API, so PullEV generates
  example proofs (one valid, one tampered) over the labeled pool. They are never presented as real Renaiss
  draws, and the published root is labeled "computed by PullEV over the labeled pool, not Renaiss's on-chain
  root." The verification math is genuine; when Renaiss ships real proofs, the same verifier checks them.
- **Limitations:** PullEV reads and verifies. It never transacts. No wallet connection, no auth, no
  on-chain writes. Model and example data are always labeled and never presented as authoritative.

## Deploy

- **Engine to Railway:** the multi-stage [`engine/Dockerfile`](engine/Dockerfile) builds a static binary
  with fixtures embedded. Set `WEB_ORIGIN` to the web URL and the Renaiss keys, then `railway up`.
- **Web to Vercel:** set the project root to `web/`, set `ENGINE_URL` to the engine URL and
  `DEEPSEEK_API_KEY`, then deploy. The `../shared` types resolve from the monorepo clone.

## Safety

No secrets in the repo, no private or user data, no wallet keys. The AI advisor cites every claim and
refuses out-of-context assertions; its output is never presented as verified fact. Card names and images
are shown for identification only. Pokémon, One Piece, and related marks are property of their respective
owners. Not financial advice.
