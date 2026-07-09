package main

import (
	"context"
	"log"
	"sort"
	"sync"
	"time"
)

// LivePoolManager makes the pools autonomous: on a schedule it re-prices the whole
// real-card library off the Renaiss Index (beta) and ROTATES pack membership from that
// library, so fresh cards surface over time and every price/timestamp is real.
//
// Honesty is preserved by construction:
//   - Pool STRUCTURE (which cards, weights) stays a labeled PullEV model — Renaiss
//     exposes no pool/odds API, so this is necessarily our construction.
//   - Per-card PRICES are live Renaiss Index valuations (badged LIVE + freshness).
//   - An EV sanity guard rejects any rotated pool whose verdict is implausible, so the
//     demo never shows a crazy edge; the prior pool (or the embedded fixture) stands.
//   - If the manager never runs (no keys / offline), GetPool serves the embedded
//     fixtures exactly as before — the manager is a pure, additive upgrade.
type LivePoolManager struct {
	mu          sync.RWMutex
	pools       map[string]Pool
	lastRefresh time.Time
	cycle       int

	client *IndexClient
	cache  *ValuationCache
	packs  map[string]Pack
}

// packOrder / prefixes / premiumPacks mirror the offline curate build so runtime pools
// match what `engine curate` produces (distinct allocation per game, premium split).
var (
	livePackOrder = []string{"omega", "renacrypt", "eden", "voyaga", "frozen", "legacy-8"}
	livePrefixes  = map[string]string{
		"renacrypt": "rena", "voyaga": "voyaga", "omega": "omega",
		"frozen": "frozen", "eden": "eden", "legacy-8": "legacy",
	}
	premiumPacks = map[string]bool{"eden": true, "legacy-8": true}
)

func NewLivePoolManager(client *IndexClient, cache *ValuationCache) *LivePoolManager {
	packs := map[string]Pack{}
	var list []Pack
	if err := readFixture("fixtures/packs.json", &list); err == nil {
		for _, p := range list {
			packs[p.ID] = p
		}
	}
	return &LivePoolManager{
		pools:  map[string]Pool{},
		client: client,
		cache:  cache,
		packs:  packs,
	}
}

// Get returns the current live pool for a pack and the time it was last rebuilt.
func (lp *LivePoolManager) Get(packID string) (Pool, time.Time, bool) {
	lp.mu.RLock()
	defer lp.mu.RUnlock()
	p, ok := lp.pools[packID]
	return p, lp.lastRefresh, ok
}

// LastRefresh reports when the manager last rebuilt pools live (false until it has run),
// so the pack-list provenance can show the real freshness instead of the authored date.
func (lp *LivePoolManager) LastRefresh() (time.Time, bool) {
	lp.mu.RLock()
	defer lp.mu.RUnlock()
	if lp.lastRefresh.IsZero() || len(lp.pools) == 0 {
		return time.Time{}, false
	}
	return lp.lastRefresh, true
}

// candidates builds each pack's disjoint candidate card list from the (freshly-priced)
// library, mirroring curate's split: one-piece → renacrypt/voyaga, pokemon → omega/
// frozen, premium (priciest combined) → eden/legacy. Lists are price-sorted ascending.
func (lp *LivePoolManager) candidates() map[string][]curatedCard {
	lib := lp.cache.SeedSnapshot()
	var op, pkm []curatedCard
	// Deterministic order: collect by path, then sort by price so dedupe is stable.
	paths := make([]string, 0, len(lib))
	for path := range lib {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, path := range paths {
		v := lib[path]
		if !v.Found || v.PriceUsd <= 5 {
			continue
		}
		cc := curatedCard{slug: path, val: v}
		switch v.Game {
		case "one-piece":
			op = append(op, cc)
		case "pokemon":
			pkm = append(pkm, cc)
		}
	}
	byPrice := func(cs []curatedCard) { sort.Slice(cs, func(i, j int) bool { return cs[i].val.PriceUsd < cs[j].val.PriceUsd }) }
	byPrice(op)
	byPrice(pkm)
	// Keep distinct real variants (name+set), matching curate — so the runtime rotation
	// has the same deep candidate pool and wide packs stay full (especially One Piece).
	op = dedupeByIdentity(op)
	pkm = dedupeByIdentity(pkm)

	opA, opB := splitAlt(op)
	pkmA, pkmB := splitAlt(pkm)

	combined := dedupeByIdentity(append(append([]curatedCard{}, pkm...), op...))
	sort.Slice(combined, func(i, j int) bool { return combined[i].val.PriceUsd > combined[j].val.PriceUsd })
	premA, premB := splitAlt(combined)
	// Keep premium packs among the priciest cards, but leave room to rotate the chase set.
	premA = topAsc(premA, chasePerPack+8)
	premB = topAsc(premB, chasePerPack+8)

	return map[string][]curatedCard{
		"renacrypt": opA,
		"voyaga":    opB,
		"omega":     pkmA,
		"frozen":    pkmB,
		"eden":      premA,
		"legacy-8":  premB,
	}
}

// topAsc keeps the n highest-priced cards then returns them ascending (for pickSpread).
func topAsc(cards []curatedCard, n int) []curatedCard {
	sort.Slice(cards, func(i, j int) bool { return cards[i].val.PriceUsd > cards[j].val.PriceUsd })
	if len(cards) > n {
		cards = cards[:n]
	}
	sort.Slice(cards, func(i, j int) bool { return cards[i].val.PriceUsd < cards[j].val.PriceUsd })
	return cards
}

// Refresh re-prices the library and rebuilds every pack pool with this cycle's rotation.
// Best-effort and non-fatal: pricing failures fall back to the committed seed price, and
// an implausible rotated pool is rejected in favour of the last good one (or the fixture).
func (lp *LivePoolManager) Refresh(ctx context.Context) {
	lp.rePrice(ctx)

	cands := lp.candidates()
	built := map[string]Pool{}
	for _, id := range livePackOrder {
		cand := cands[id]
		if len(cand) < 4 {
			continue // not enough library depth; fixture/prior pool stands
		}
		picked := pickSpreadRotated(cand, chasePerPack, lp.cycle)
		entries, _ := poolEntriesFrom(livePrefixes[id], picked)
		pool := Pool{PackID: id, Cards: rebalanceWithCommons(id, entries)}

		if !lp.plausible(id, pool) {
			log.Printf("livepool: rotated %s rejected (implausible EV) — keeping prior/fixture", id)
			continue
		}
		built[id] = pool
	}

	lp.mu.Lock()
	for id, p := range built {
		lp.pools[id] = p
	}
	lp.lastRefresh = time.Now().UTC()
	lp.cycle++
	n := len(lp.pools)
	lp.mu.Unlock()
	log.Printf("livepool: refresh cycle done — %d live pools, %d rebuilt this cycle", n, len(built))
}

// plausible keeps a rotated pool only if its verdict lands in a believable band, so
// rotation can never surface an absurd edge during a demo.
func (lp *LivePoolManager) plausible(id string, pool Pool) bool {
	pack, ok := lp.packs[id]
	if !ok || pack.PriceUsd <= 0 {
		return false
	}
	ev := ComputeEV(EVInput{
		PackID: id, Cost: pack.PriceUsd, Cards: pool.Cards, PriceIsAssumption: pack.PriceIsAssumption,
	}, nil, time.Unix(0, 0).UTC())
	return ev.EVToCostRatio >= 0.30 && ev.EVToCostRatio <= 1.45
}

// rePrice fetches fresh valuations for every mapped library card and writes them to the
// session cache (so the pool overlay and /value both go live). Bounded and rate-limit
// aware: on a 429 it stops and keeps what it has; each miss keeps the seed price.
func (lp *LivePoolManager) rePrice(ctx context.Context) {
	lib := lp.cache.SeedSnapshot()
	paths := make([]string, 0, len(lib))
	for p := range lib {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	fresh := map[string]Valuation{}
	for _, path := range paths {
		if ctx.Err() != nil {
			break
		}
		v, err := lp.client.LookupKey(ctx, path)
		if err == ErrRateLimited {
			log.Printf("livepool: rate limited after %d refreshes — using cached/seed for the rest", len(fresh))
			break
		}
		if err == nil && v.Found && v.PriceUsd > 0 {
			fresh[path] = v
		}
		if ctx.Err() != nil {
			break
		}
		time.Sleep(250 * time.Millisecond) // stay under the burst throttle
	}
	if len(fresh) > 0 {
		lp.cache.SetMemBatch(fresh)
	}
	log.Printf("livepool: re-priced %d/%d library cards live", len(fresh), len(paths))
}

// Start runs the autonomous loop: a short warm-up (so cold start serves fixtures first),
// an initial refresh, then a refresh every interval. Cancelled via ctx.
func (lp *LivePoolManager) Start(ctx context.Context, interval time.Duration) {
	select {
	case <-time.After(15 * time.Second):
	case <-ctx.Done():
		return
	}
	lp.Refresh(ctx)

	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			lp.Refresh(ctx)
		}
	}
}
