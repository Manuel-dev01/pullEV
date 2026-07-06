package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

// This file adds MORE real Renaiss packs (Voyaga, Frozen, Legacy Pack #8) beyond the
// original three. All are real packs listed on renaiss.xyz/gacha; their published
// prices are not machine-readable (SPA pages), so packs.json marks those prices as
// assumptions. Each pack's pool is built OFFLINE from the already-fetched real Index
// valuations in fixtures/valuations.seed.json (no live API calls, deterministic).
//
// Card identities, grades, and prices are REAL. Pool membership and draw weights are a
// PullEV model (labeled assumptions) — Renaiss exposes no pool/odds API — so the same
// real card may appear in more than one pack. Run `engine packs` then `engine commons`.

type extraPack struct {
	id     string
	prefix string
	names  []string // chase-card names to pull from the seed (matched exactly)
}

var extraPacks = []extraPack{
	// Voyaga — One Piece, "journey across the Grand Line" (renaiss.xyz/gacha/voyaga-pack).
	{"voyaga", "voyaga", []string{
		"O-Nami", "Boa Hancock", "Zoro-Juurou", "Monkey.D.Luffy L",
		"Monkey.D.Luffy WANTED POSTER SP", "Luffy & Ace",
	}},
	// Frozen — Pokemon, icy/eeveelution lean (renaiss.xyz/gacha/frozen-pack).
	{"frozen", "frozen", []string{
		"Iono's Wattrel", "Mega Lucario Ex", "Glaceon Ex", "Magikarp",
		"Umbreon Ex", "Mew Ex",
	}},
	// Legacy Pack #8 — vintage/premium mixed chase (renaiss.xyz/gacha/legacy-pack-8).
	{"legacy-8", "legacy", []string{
		"Mega Charizard X Ex", "Yamato SR/(Flagship Battle 2024 August Top 8 Prize)",
		"Pikachu Ex", "Birthday Pikachu-Holo", "Charizard-Holo", "Monkey.D.Luffy",
	}},
}

func runPacks() {
	b, err := os.ReadFile("fixtures/valuations.seed.json")
	must(err)
	seed := map[string]Valuation{}
	must(json.Unmarshal(b, &seed))

	// Index seed valuations by card name (first slug wins on duplicates).
	type sv struct {
		slug string
		val  Valuation
	}
	byName := map[string]sv{}
	for slug, v := range seed {
		if _, ok := byName[v.Name]; !ok {
			byName[v.Name] = sv{slug, v}
		}
	}

	mb, err := os.ReadFile("fixtures/valuation-map.json")
	must(err)
	vmap := map[string]string{}
	must(json.Unmarshal(mb, &vmap))

	for _, ep := range extraPacks {
		pool := Pool{PackID: ep.id}
		seen := map[string]bool{}
		for _, nm := range ep.names {
			e, ok := byName[nm]
			if !ok {
				fmt.Printf("  WARN %s: no seed valuation for %q, skipping\n", ep.id, nm)
				continue
			}
			id := cardID(ep.prefix, e.val)
			for seen[id] {
				id += "-x"
			}
			seen[id] = true
			pool.Cards = append(pool.Cards, PoolEntry{
				Weight: 1, // real weights are assigned by `engine commons`
				Card: Card{
					ID: id, Name: e.val.Name, Grade: e.val.GradeLabel, Set: e.val.SetName,
					FMVUsd: e.val.PriceUsd, FMVIsAssumption: false, FMVSource: SourceIndex,
					FMVAsOf: e.val.LastSaleAt, FMVConfidence: e.val.Confidence, FMVDeltaPct: e.val.DeltaPct,
					ImageURL: e.val.ImageURL,
				},
			})
			vmap[id] = e.slug
		}
		if len(pool.Cards) < 4 {
			fmt.Printf("ABORT %s: only %d real cards resolved from the seed\n", ep.id, len(pool.Cards))
			os.Exit(1)
		}
		sort.Slice(pool.Cards, func(i, j int) bool { return pool.Cards[i].Card.FMVUsd < pool.Cards[j].Card.FMVUsd })
		must(writeJSONFile(fmt.Sprintf("fixtures/pools/%s.json", ep.id), pool))
		fmt.Printf("built %-10s %d real chase cards\n", ep.id, len(pool.Cards))
	}
	must(writeJSONFile("fixtures/valuation-map.json", vmap))
	fmt.Println("Run `engine commons` next to add the labeled commons tier + weights.")
}
