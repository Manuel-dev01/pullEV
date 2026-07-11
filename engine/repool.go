package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

// `engine repool` rebuilds every pack's pool MEMBERSHIP offline, straight from the committed
// valuation seed (fixtures/valuations.seed.json) — no live API calls, no re-pricing. It applies
// the current allocation + selection logic (allocatePacks + pickLowPlusChase), so changes to how
// pools are built (e.g. diversified chase) land in the committed fixtures without a full live
// `engine curate`. It does NOT touch the seed (the full priced library is preserved for the
// Vault Index). Run it in place of `curate` when only the selection logic changed:
//
//	engine repool  ->  engine tiers  ->  engine snapshot  ->  rebuild binary
func runRepool() {
	b, err := os.ReadFile("fixtures/valuations.seed.json")
	must(err)
	seedIn := map[string]Valuation{}
	must(json.Unmarshal(b, &seedIn))

	// Reconstruct the game-split candidate lists from the seed, deterministically (sorted keys).
	keys := make([]string, 0, len(seedIn))
	for k := range seedIn {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var op, pkm []curatedCard
	for _, k := range keys {
		v := seedIn[k]
		if !v.Found || v.PriceUsd <= 5 {
			continue
		}
		cc := curatedCard{slug: k, val: v}
		switch v.Game {
		case "one-piece":
			op = append(op, cc)
		case "pokemon":
			pkm = append(pkm, cc)
		}
	}
	fmt.Printf("repool: %d one-piece, %d pokemon from seed\n", len(op), len(pkm))

	alloc := allocatePacks(op, pkm)
	packs := loadPacksForCommons()

	// Rebuild the cardId -> slug map alongside the pools (throwaway seed map; the committed
	// seed is left untouched so the full library survives).
	vmap := map[string]string{
		"_note": "cardId -> Renaiss structured card path (game/set/slug). Rebuilt offline by " +
			"`engine repool` from the committed seed; prices are the same real Index valuations.",
	}
	throwaway := map[string]Valuation{}
	built := map[string]Pool{}
	for id, cards := range alloc {
		cap := cheapCapFor(packs[id].PriceUsd)
		built[id] = buildPool(id, idPrefix(id), pickLowPlusChase(cards, poolSize-2, 2, curateOffset(id), cap), vmap, throwaway)
	}

	// Guard: never clobber good fixtures with an empty/short pool.
	for id, p := range built {
		if len(p.Cards) < 4 {
			fmt.Printf("ABORT: pool %s resolved only %d cards\n", id, len(p.Cards))
			os.Exit(1)
		}
	}
	for id, p := range built {
		must(writeJSONFile(fmt.Sprintf("fixtures/pools/%s.json", id), p))
	}
	must(writeJSONFile("fixtures/valuation-map.json", vmap))

	fmt.Printf("repool: wrote %d pools (seed untouched). Run `engine tiers`, then `engine snapshot`, then rebuild.\n", len(built))
}
