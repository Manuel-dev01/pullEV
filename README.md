# PullEV

> Make Renaiss's Infinite Gacha provably fair and EV-transparent — verify any pull yourself, client-side.

PullEV is a provably-fair gacha decision tool for [Renaiss](https://www.renaiss.xyz)'s Infinite Gacha
packs. It answers two questions Renaiss users ask every day:

1. **"Should I rip this pack?"** — live expected value (EV) of a pull vs. its cost, computed from the
   pack's vault-backed pool and Renaiss's FMV/CMV oracle prices, with the full value distribution.
2. **"Was my pull fair?"** — an independent **client-side Merkle-proof verifier** that recomputes a
   draw's inclusion proof in your own browser, so you trust math, not a claim.

A grounded **AI Pull Advisor** explains verdicts in plain language, citing every number to its source.

Built for the **Renaiss Tech Hackathon Season 1** (Tool track, with grounded AI assist).

---

## Status: Slice 0 — scaffold + adapter contract + MockAdapter

Pack pools render from deterministic mock data through a swappable data adapter, with every value
carrying a visible provenance badge (`MOCK` / `UNOFFICIAL` / `OFFICIAL`) and a timestamp.

## Architecture

```
/web        Next.js (App Router) + TS + Tailwind — UI, client-side fairness verifier, AI route
/engine     Go service — data adapter layer, EV engine, typed JSON API
/shared     Shared type definitions (Go + TS, kept in lockstep)
/fixtures   Deterministic mock data for all packs
/docs       Data-source labels, demo script
```

### The adapter layer
No official Renaiss API/SDK exists yet (it is roadmap-stage). All pack data sits behind one
`PackDataAdapter` interface with three implementations: **MockAdapter** (deterministic, offline-safe),
**PublicAdapter** (best-effort scrape of renaiss.xyz, labeled UNOFFICIAL), **SdkAdapter** (stub until
Renaiss ships an SDK). The active adapter and per-datapoint freshness are always visible in the UI.

## Run locally (Slice 0)

```bash
# 1. engine (Go API)  — http://localhost:8080
cd engine
go run .

# 2. web (Next.js)    — http://localhost:3000
cd web
npm install
npm run dev
```

## Data sources, assumptions & limitations

- **Verified (renaiss.xyz / press, June 2026):** Omega pack $48, Renacrypt pack $88 (Renaiss ×
  Collector Crypt); perpetual refreshed pool; draws anchored by Merkle proofs + ZK validation; FMV/CMV
  oracle; BNB Chain; PSA-graded Pokémon cards.
- **Assumptions (labeled in code & UI):** per-card pool contents and per-card FMV values are *not*
  machine-readable from renaiss.xyz (the pack pages are client-rendered), so mock card values are
  realistic placeholders grounded in PSA-10 market ranges, tagged `ASSUMPTION`. Eden pack price ($150)
  is from project notes and pending live re-confirmation.
- **Limitations:** PullEV reads and verifies; it never transacts. No wallet connection, no auth, no
  on-chain writes. Mock and scraped data are never presented as authoritative.

## Safety

No secrets in the repo, no private/user data, no wallet keys. Card names/images are shown for
identification only — Pokémon and related marks are property of their respective owners; see Renaiss's
trademark disclaimer.
