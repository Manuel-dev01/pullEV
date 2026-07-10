# Data sources and provenance

PullEV's core safety promise: every number on screen reaches a provenance badge, and nothing labeled as a
model or example is ever presented as a verified fact. This document lists what is real, what is a PullEV
model, and what is a labeled example.

## Provenance labels you will see

| Badge | Meaning | Where it comes from |
| --- | --- | --- |
| `OFFICIAL · Renaiss Index (beta)` | Real card valuation from the Renaiss Index API | live API, cache, or committed seed |
| `LIVE` (per card) | That card's FMV is a real Renaiss Index valuation | Renaiss Index API |
| `ASSUMED` (per card) | That card's FMV is a labeled PullEV assumption | filler band, or unresolved cards |
| `PULLEV MODEL` | Pool membership and draw weights are a PullEV construction (rotated each refresh cycle) | PullEV (no Renaiss odds API) |
| `BUNDLED SNAPSHOT` | The live engine was unreachable; offline fallback data | `web/lib/snapshot.json` |
| `EXAMPLE` | A demo Merkle proof, not a real Renaiss draw | PullEV, over the labeled pool |

Each pool and the pack shelf carry a real **last-refresh timestamp** (the badge shows the date and time),
because the engine re-prices and rotates the live packs rather than serving a frozen build-time date.

## The pack lineup (15 real packs, verified from the live Renaiss site)

- **Live (rippable) Infinite packs:** Eden $150 (top prize $4,434), OMEGA $48 ($1,532), RenaCrypt $88 ($2,415).
- **Champion Pack** $100, limited, currently **sold out** ($3,750). Shown for reference (EV informational).
- **11 previous packs**, all $100 limited and **sold out**, shown as a retired showcase: World Cup $3,800,
  Bowtie $2,600, Ribbon $3,000, Plasma $2,900, Starry $2,126, Magma $2,900, Costume $2,700, Legacy #9 $2,850,
  Aura $3,888, Legacy #8 $2,850, Legacy #7 $2,900 (top prizes).

All pack prices and top prizes are verified, so `priceIsAssumption` is false for every pack. Only the four
current packs (the 3 Infinite + Champion) re-price and rotate live; the 11 previous packs are static.

## Per-datapoint breakdown

| Datapoint | Source | Real or assumption |
| --- | --- | --- |
| Card price (FMV) | Renaiss Index API (`/v1/graded/{cert}`, `/v1/cards/{game}/{set}/{card}`) | Real, beta, cached |
| Card grade, confidence, trend, freshness | Renaiss Index API | Real, beta |
| Card library (~84 distinct real graded cards) | Renaiss Index, re-priced on a schedule | Real, beta, cached |
| Vault Index (`/vault`, `/api/cards`) | The same priced library, listed in full | Real, beta, cached |
| All 15 pack prices and top prizes | Renaiss public listings (live site) | Verified |
| Pool membership (which cards are in a pack) | PullEV curation, rotated each refresh cycle (current packs) | Assumption (no Renaiss pool API) |
| Draw weights and odds | PullEV three-band model | Assumption (no Renaiss odds API) |
| Cheap filler band (low-value cards) | PullEV, real card names at labeled assumed FMVs | Assumption |
| Merkle example proofs | PullEV, computed over the labeled pool | Example, not a real draw |
| On-chain Merkle root (12 sealed packs) | Renaiss gacha contract on BNB Chain, `getMerkleRoot(packId)`, read via public RPC | Real, on-chain, independently auditable on BscScan |
| EV, distribution, chance of profit | PullEV EV engine, computed from the above | Derived, deterministic |

## The odds model (labeled — not Renaiss's tiers)

Renaiss shipped a real Index API for card **valuations**, and commits each pack's pool as an on-chain Merkle
root on BNB Chain (auditable via BscScan with the pack ID), but exposes no REST API for pool contents, odds,
or the individual draw proofs. So PullEV grounds prices in real data and treats the rest as a clearly labeled
model:

- **Odds use PullEV's own three draw bands** over real card prices: Chase (~1%, rare top band), Mid (~33%),
  Common (~66%). These are **our model**, not a Renaiss scheme. Renaiss publishes a *per-pack* tiered "what is
  loaded" whose names and counts **vary by pack** (e.g. OMEGA uses Tier S/A/B/C, Eden uses Crown/Bloom/Thorn),
  and the exact per-tier chances aren't all public. The one public, verifiable anchor we ground on: Renaiss's
  **rarest tier is `<1%`** (visible on the OMEGA pack), which our ~1% Chase band mirrors.
- **The Common bulk includes labeled filler.** Our real library is chase-heavy, while Renaiss loads many
  cheap cards we don't price, so a small set of clearly-labeled cheap filler cards (real names, assumed FMVs,
  `fmvSource:Mock`) fills the Common band so the EV and distribution read like real gacha (an honest house
  edge) instead of "every pull profits." This filler is the only FMV assumption in a pool.
- **Draw weights are a PullEV assumption.** Each card's weight = its band chance / the number of cards in that
  band, so a band's total draw probability equals its model chance.
- **Example proofs are labeled EXAMPLE.** The verification math is genuine and runs client-side; only the
  input draw is a demonstration over the labeled pool. Separately, for sealed packs we display Renaiss's
  **real on-chain Merkle root**, read live from their gacha contract on BNB Chain and auditable on BscScan.
  Matching that exact root by recomputation needs the sealed pool's full contents and leaf scheme (not
  public), so the two sit side by side: the real commitment, and the client-side inclusion math.

## How prices stay fresh

At runtime the engine refreshes itself: a background loop ([`engine/livepool.go`](../engine/livepool.go))
re-prices the whole card library off the Renaiss Index on `REFRESH_INTERVAL` and rotates each **current**
pack's chase cards, accepting a rotated pool only when its EV verdict is believable. A guarded
`POST /api/admin/refresh` (header `X-Refresh-Token`) triggers a cycle on demand. So the deployed app is never
frozen to build-time prices, and every live pool shows its real last-refresh time.

To rebuild the committed baseline (the offline fallback and cold-start fixtures), use the data tooling:

```bash
cd engine
go run . curate     # rebuild pools from real cards (keeps distinct name+set variants)
go run . tiers      # apply the three-band odds model (adds labeled filler, weights each band)
go run . snapshot   # regenerate web/lib/snapshot.json + sync web/lib/valuations.seed.json
```

After curating, rebuild the binary so the fixtures re-embed via go:embed. `go run . refresh` re-prices only
the existing map into the committed seed without changing membership.
