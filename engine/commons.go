package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"
)

// This file makes the curated pools read like real gacha. The Renaiss index only
// surfaces top/chase cards, so a pool built purely from it skews premium — every
// pull beats the pack cost and EV is unrealistically positive. Real packs are
// dominated by low-value "commons"; the chase cards carry a thin upside tail.
//
// `engine commons` (offline, no API) rebalances each pool:
//   - REAL chase cards (fmvSource:Index) keep their real prices, re-weighted into a
//     rarity ladder (cheaper chase slightly more common, the top chase rarest).
//   - A representative COMMONS tier is prepended: real card names at lower grade,
//     with clearly-ASSUMED FMVs (fmvIsAssumption:true, fmvSource:Mock), weighted so
//     most pulls land below cost.
//
// SAFETY: commons FMVs and ALL pool weights are labeled assumptions — Renaiss exposes
// no odds/pool API. Chase FMVs remain real Renaiss Index valuations. The UI badges
// each card's source (LIVE vs ASSUMPTION) and the EV caveats note the mix.
//
// The command is idempotent: it strips any prior commons tier before re-applying, so
// it can be re-run to re-tune. Run it AFTER `engine curate`, then rebuild the binary
// (go:embed) and regenerate the web snapshot.

// commonCard is one representative bulk card (real name, lower grade, assumed value).
type commonCard struct {
	name   string
	grade  string
	set    string
	fmv    float64
	weight float64
}

// packCommons defines, per pack, the commons tier and the rarity ladder applied to
// the real chase cards (sorted cheap→expensive). Tuned so the verdicts form a
// believable mix: Omega a thin RIP, Renacrypt and Eden a house-edge SKIP.
type packCommons struct {
	prefix      string
	commons     []commonCard
	chaseLadder []float64 // weight per chase card, cheapest→priciest
}

var commonsConfig = map[string]packCommons{
	// Omega ($48, Pokémon): light commons + a fatter top-chase tail → thin positive EV.
	"omega": {
		prefix: "omega",
		commons: []commonCard{
			{"Psyduck", "PSA 9", "Pokemon Japanese M2a-Mega Dream Ex", 7, 120},
			{"Haunter", "PSA 9", "Pokemon Japanese Mbg Mega Starter Set", 12, 90},
			{"Meowth Ex", "PSA 9", "Nullifying Zero", 19, 60},
			{"Eevee Ex", "PSA 9", "Pokemon Japanese Sv8a-Terastal Fest Ex", 30, 40},
		},
		chaseLadder: []float64{50, 34, 24, 16, 12, 12, 8, 5},
	},
	// Renacrypt ($88, One Piece): commons dominate → house-edge SKIP with upside.
	"renacrypt": {
		prefix: "rena",
		commons: []commonCard{
			{"Nami", "PSA 9", "Romance Dawn", 9, 180},
			{"Perona", "PSA 9", "Prize Cards Alternate Art", 16, 120},
			{"Sabo", "PSA 9", "Winner Prize For Sealed Battle 2023 Vol 1", 27, 70},
			{"Gear Two", "PSA 9", "A Fist Of Divine Speed", 44, 40},
		},
		chaseLadder: []float64{60, 36, 20, 12, 7, 5, 3, 2},
	},
	// Eden ($150, premium mixed): higher-value commons, deep chase tail → SKIP.
	"eden": {
		prefix: "eden",
		commons: []commonCard{
			{"Uta", "PSA 9", "One Piece Japanese OP05 Awakening Of The New Era", 22, 340},
			{"Shanks", "PSA 9", "Romance Dawn", 48, 200},
			{"Leafeon Ex", "PSA 9", "Pokemon Japanese Sv8a-Terastal Fest Ex", 66, 110},
			{"Jolteon Ex", "PSA 9", "Pokemon Japanese Sv8a-Terastal Fest Ex", 88, 55},
		},
		chaseLadder: []float64{40, 24, 14, 8, 5, 3},
	},
}

func runCommons() {
	packs := loadPacksForCommons()

	for _, id := range []string{"omega", "renacrypt", "eden"} {
		cfg, ok := commonsConfig[id]
		if !ok {
			continue
		}
		path := fmt.Sprintf("fixtures/pools/%s.json", id)
		b, err := os.ReadFile(path)
		must(err)
		var pool Pool
		must(json.Unmarshal(b, &pool))

		// Keep only real chase cards; drop any previously-added commons (idempotent).
		chase := make([]PoolEntry, 0, len(pool.Cards))
		for _, e := range pool.Cards {
			if e.Card.FMVIsAssumption || e.Card.FMVSource != SourceIndex {
				continue
			}
			chase = append(chase, e)
		}
		sort.Slice(chase, func(i, j int) bool { return chase[i].Card.FMVUsd < chase[j].Card.FMVUsd })

		// Re-weight chase into the rarity ladder (extra cards past the ladder stay weight 1).
		for i := range chase {
			if i < len(cfg.chaseLadder) {
				chase[i].Weight = cfg.chaseLadder[i]
			} else {
				chase[i].Weight = 1
			}
		}

		// Build the labeled commons tier, cheapest first.
		commons := make([]PoolEntry, 0, len(cfg.commons))
		seen := map[string]bool{}
		for _, c := range cfg.commons {
			cid := cfg.prefix + "-common-" + slugName(c.name)
			for seen[cid] {
				cid += "-x"
			}
			seen[cid] = true
			commons = append(commons, PoolEntry{
				Weight: c.weight,
				Card: Card{
					ID: cid, Name: c.name, Grade: c.grade, Set: c.set,
					FMVUsd: c.fmv, FMVIsAssumption: true, FMVSource: SourceMock,
					FMVConfidence: "assumed",
				},
			})
		}

		pool.Cards = append(commons, chase...)
		must(writeJSONFile(path, pool))

		printPoolVerdict(id, pool, packs[id])
	}
	fmt.Println("\nCommons applied. Rebuild the binary (go:embed) + regenerate web/lib/snapshot.json next.")
}

// slugName lowercases a card name into an id fragment (mirrors cardID's cleanup).
func slugName(name string) string {
	repl := map[rune]rune{' ': '-', '.': -1, '\'': -1, '/': '-'}
	out := make([]rune, 0, len(name))
	for _, r := range name {
		if r >= 'A' && r <= 'Z' {
			r += 32
		}
		if m, ok := repl[r]; ok {
			if m == -1 {
				continue
			}
			r = m
		}
		out = append(out, r)
	}
	return string(out)
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
	fmt.Printf("%-10s cost $%-6.0f EV $%-8.2f ratio %.2f (%+.0f%%)  P(profit) %4.1f%%  median $%-8.2f p90 $%-8.2f  %d cards  → %s\n",
		id, pack.PriceUsd, ev.ExpectedValue, ev.EVToCostRatio, (ev.EVToCostRatio-1)*100,
		ev.ChanceOfProfit*100, ev.Distribution.Median, ev.Distribution.P90, len(pool.Cards), verdict)
}
