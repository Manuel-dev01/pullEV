package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

// Odds model — PullEV's three labeled draw bands over the pack's real cards: Chase (~0.8%,
// rare), Mid (~29%), Common (~70%, the cheapest cards). EVERY card is a real Renaiss Index
// valuation; there is no fabricated filler. What is labeled-as-model is only (a) the band
// draw chances (Renaiss publishes no odds API; its per-pack tiers vary and aren't public)
// and (b) which real cards sit in each pack (Renaiss publishes no pool API). Prices: 100% real.
//
// IMPORTANT (honesty): because real graded cards have a high floor, a pool of only real cards
// is worth more than a cheap pack's ticket, so the computed EV can read positive. That is a
// MODEL estimate for a pool of these real cards under our odds, NOT a claim about Renaiss's
// real pack (whose true cheap contents and odds are not public). The UI/docs say so plainly.
//
// `engine tiers` (offline, no API) reads each pool's real cards, ranks them by price, bins
// them into the three bands, and weights each band so its total draw probability equals its
// model chance. Idempotent. Run it AFTER `engine curate`, then `engine snapshot`, then rebuild.

// Band draw chances (PullEV's model). The rare Chase band is <1% (a labeled assumption
// consistent with Renaiss surfacing a sub-1% top tier); the mid/common split is our model,
// weighted heavily to Common like real gacha.
const (
	chaseChance  = 0.008
	midChance    = 0.292
	commonChance = 0.70
)

func idPrefix(id string) string {
	return strings.ReplaceAll(id, "-", "")
}

// applyTiers organizes a pack's real, Index-priced cards into three labeled draw bands by
// price RANK — Common (the cheapest cards), Mid (the middle third), Chase (the top card or
// two) — and weights each band so its total draw probability equals its model chance
// (Chase ~0.8%, Mid ~29%, Common ~70%). Every card is a real valuation: no fabricated filler.
// The band split and the chances are PullEV's labeled model; the prices are all real. Pure
// (no IO), so `engine tiers` and the live pool manager share one path.
func applyTiers(id string, cards []PoolEntry) []PoolEntry {
	if len(cards) == 0 {
		return cards
	}
	sorted := append([]PoolEntry{}, cards...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Card.FMVUsd < sorted[j].Card.FMVUsd })
	n := len(sorted)

	// Rank split: the top card(s) are the rare Chase; the next third is Mid; the cheapest
	// remainder is Common. Chances are fixed by the model; the card counts shape the bands.
	nChase := 1
	if n >= 12 {
		nChase = 2
	}
	if nChase >= n {
		nChase = 1
	}
	rest := n - nChase
	nMid := rest / 3
	if nMid == 0 && rest > 0 {
		nMid = 1
	}
	nCommon := rest - nMid

	commonBand := sorted[:nCommon]
	midBand := sorted[nCommon : nCommon+nMid]
	chaseBand := sorted[nCommon+nMid:]

	// Weight each band so its total draw probability equals its model chance (equal within a
	// band). ComputeEV normalizes by the weight sum, so the proportions hold.
	assign := func(entries []PoolEntry, chance float64) {
		if len(entries) == 0 {
			return
		}
		w := chance / float64(len(entries))
		for i := range entries {
			entries[i].Weight = w
		}
	}
	assign(chaseBand, chaseChance)
	assign(midBand, midChance)
	assign(commonBand, commonChance)

	out := make([]PoolEntry, 0, n)
	out = append(out, chaseBand...)
	out = append(out, midBand...)
	out = append(out, commonBand...)
	return out
}

func runTiers() {
	packs := loadPacksForCommons()
	for _, p := range orderedPackIDs(packs) {
		path := fmt.Sprintf("fixtures/pools/%s.json", p)
		b, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var pool Pool
		must(json.Unmarshal(b, &pool))

		// Keep only real Index-priced cards (drop any legacy filler, so this is idempotent
		// and the pool is guaranteed 100% real before we re-band it).
		real := make([]PoolEntry, 0, len(pool.Cards))
		for _, e := range pool.Cards {
			if e.Card.FMVIsAssumption || e.Card.FMVSource != SourceIndex {
				continue
			}
			real = append(real, e)
		}

		pool.Cards = applyTiers(p, real)
		must(writeJSONFile(path, pool))
		printPoolVerdict(p, pool, packs[p])
	}
	fmt.Println("\nTiers applied (100% real cards). Run `engine snapshot`, then rebuild the binary (go:embed).")
}

// orderedPackIDs returns pack ids in packs.json order for a stable verdict print.
func orderedPackIDs(packs map[string]Pack) []string {
	ids := make([]string, 0, len(packs))
	for id := range packs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func loadPacksForCommons() map[string]Pack {
	b, err := os.ReadFile("fixtures/packs.json")
	must(err)
	var list []Pack
	must(json.Unmarshal(b, &list))
	m := map[string]Pack{}
	for _, p := range list {
		m[p.ID] = p
	}
	return m
}

func printPoolVerdict(id string, pool Pool, pack Pack) {
	ev := ComputeEV(EVInput{
		PackID: id, Cost: pack.PriceUsd, Cards: pool.Cards,
		PriceIsAssumption: pack.PriceIsAssumption,
	}, nil, time.Unix(0, 0).UTC())
	verdict := "SKIP (house edge)"
	if ev.EVToCostRatio >= 1.05 {
		verdict = "RIP (+EV)"
	} else if ev.EVToCostRatio >= 0.97 {
		verdict = "MARGINAL"
	}
	fmt.Printf("%-11s cost $%-6.0f EV $%-8.2f ratio %.2f (%+.0f%%)  P(profit) %4.1f%%  %d cards  → %s\n",
		id, pack.PriceUsd, ev.ExpectedValue, ev.EVToCostRatio, (ev.EVToCostRatio-1)*100,
		ev.ChanceOfProfit*100, len(pool.Cards), verdict)
}
