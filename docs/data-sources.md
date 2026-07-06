# Data sources and provenance

PullEV's core safety promise: every number on screen reaches a provenance badge, and nothing labeled as a
model or example is ever presented as a verified fact. This document lists what is real, what is a PullEV
model, and what is a labeled example.

## Provenance labels you will see

| Badge | Meaning | Where it comes from |
| --- | --- | --- |
| `OFFICIAL · Renaiss Index (beta)` | Real card valuation from the Renaiss Index API | live API, cache, or committed seed |
| `LIVE` (per card) | That card's FMV is a real Renaiss Index valuation | Renaiss Index API |
| `ASSUMED` (per card) | That card's FMV is a labeled PullEV assumption | commons tier, or unresolved cards |
| `PULLEV MODEL` | Pool membership and draw weights are a PullEV construction | PullEV (no Renaiss odds API) |
| `BUNDLED SNAPSHOT` | The live engine was unreachable; offline fallback data | `web/lib/snapshot.json` |
| `EXAMPLE` | A demo Merkle proof, not a real Renaiss draw | PullEV, over the labeled pool |

## Per-datapoint breakdown

| Datapoint | Source | Real or assumption |
| --- | --- | --- |
| Card price (FMV) | Renaiss Index API (`/v1/graded/{cert}`, `/v1/cards/{game}/{set}/{card}`) | Real, beta, cached |
| Card grade, confidence, trend, freshness | Renaiss Index API | Real, beta |
| Pack price: Omega $48, Renacrypt $88 | Renaiss public listings | Verified |
| Pack price: Eden $150 | Project notes | Assumption, pending re-confirmation |
| Pool membership (which cards are in a pack) | PullEV curation | Assumption (no Renaiss pool API) |
| Draw weights and odds | PullEV model | Assumption (no Renaiss odds API) |
| Commons tier (low-value cards) | PullEV, real card names at labeled assumed FMVs | Assumption |
| Merkle example proofs | PullEV, computed over the labeled pool | Example, not a real draw |
| EV, distribution, chance of profit | PullEV EV engine, computed from the above | Derived, deterministic |

## Why some data is a model, not a feed

Renaiss shipped a real Index API for card **valuations**, but not for packs, pools, odds, or draw proofs.
So PullEV grounds prices in real data and treats the rest as a clearly labeled model:

- **Pools skew to chase cards** because the Renaiss index only surfaces top cards. PullEV adds a labeled
  commons tier (real card names, lower grade, assumed FMVs) so the EV and distribution read like real
  gacha instead of "every pull profits."
- **Draw weights are a PullEV assumption.** They are our rarity model, not Renaiss's published odds.
- **Example proofs are labeled EXAMPLE.** The verification math is genuine and runs client-side; only the
  input draw is a demonstration. When Renaiss exposes real proofs, the same verifier checks them unchanged.

## The refresh workflow

Real prices are refreshed with the engine's data tooling:

```bash
cd engine
go run . curate    # rebuild pools from real cards harvested off the Renaiss index
go run . commons   # add the labeled commons tier and rebalance weights
go run . refresh   # re-price the existing map into the committed seed
```

After curating, rebuild the binary (fixtures are embedded via go:embed) and regenerate
`web/lib/snapshot.json` from the running engine so the offline fallback matches.
