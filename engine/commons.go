package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
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

// Commons use low-tier minor-character names (PSA 9) so they never collide with the
// real high-value chase cards curated into the pools. FMVs + weights are labeled
// assumptions representing the bulk of a pool; runCommons also dedupes by name as a
// safety net against any residual overlap.
var commonsConfig = map[string]packCommons{
	// Omega ($48, Pokémon): commons-heavy so the cheap pack is only a THIN RIP.
	"omega": {
		prefix: "omega",
		commons: []commonCard{
			{"Rattata", "PSA 9", "Pokemon Base Common", 7, 240},
			{"Pidgey", "PSA 9", "Pokemon Base Common", 12, 180},
			{"Zubat", "PSA 9", "Pokemon Base Common", 19, 120},
			{"Caterpie", "PSA 9", "Pokemon Base Common", 30, 80},
		},
		chaseLadder: []float64{50, 34, 24, 16, 12, 12, 8, 5},
	},
	// Renacrypt ($88, One Piece): commons dominate → house-edge SKIP with upside.
	"renacrypt": {
		prefix: "rena",
		commons: []commonCard{
			{"Coby", "PSA 9", "One Piece Common", 9, 180},
			{"Buggy", "PSA 9", "One Piece Common", 16, 120},
			{"Alvida", "PSA 9", "One Piece Common", 27, 70},
			{"Helmeppo", "PSA 9", "One Piece Common", 44, 40},
		},
		chaseLadder: []float64{60, 36, 20, 12, 7, 5, 3, 2},
	},
	// Eden ($150, premium mixed): higher-value commons, deep chase tail → SKIP.
	"eden": {
		prefix: "eden",
		commons: []commonCard{
			{"Coby", "PSA 9", "One Piece Common", 22, 340},
			{"Buggy", "PSA 9", "One Piece Common", 48, 200},
			{"Alvida", "PSA 9", "One Piece Common", 66, 110},
			{"Helmeppo", "PSA 9", "One Piece Common", 88, 55},
		},
		chaseLadder: []float64{40, 24, 14, 8, 5, 3},
	},
	// Voyaga ($120, One Piece Grand Line): premium One Piece chase → house-edge SKIP.
	"voyaga": {
		prefix: "voyaga",
		commons: []commonCard{
			{"Kaya", "PSA 9", "One Piece Common", 9, 260},
			{"Morgan", "PSA 9", "One Piece Common", 16, 150},
			{"Bepo", "PSA 9", "One Piece Common", 27, 80},
			{"Kuro", "PSA 9", "One Piece Common", 44, 44},
		},
		chaseLadder: []float64{44, 26, 15, 9, 6, 4},
	},
	// Frozen ($60, Pokemon icy lean): light commons + fat tail → thin RIP.
	"frozen": {
		prefix: "frozen",
		commons: []commonCard{
			{"Weedle", "PSA 9", "Pokemon Base Common", 7, 52},
			{"Spearow", "PSA 9", "Pokemon Base Common", 12, 38},
			{"Ekans", "PSA 9", "Pokemon Base Common", 19, 24},
			{"Sandshrew", "PSA 9", "Pokemon Base Common", 30, 16},
		},
		chaseLadder: []float64{46, 30, 20, 14, 12, 12},
	},
	// Legacy Pack #8 ($200, vintage premium mixed): deep chase → SKIP with big tail.
	"legacy-8": {
		prefix: "legacy",
		commons: []commonCard{
			{"Rattata", "PSA 9", "Pokemon Base Common", 22, 360},
			{"Pidgey", "PSA 9", "Pokemon Base Common", 48, 210},
			{"Zubat", "PSA 9", "Pokemon Base Common", 66, 120},
			{"Caterpie", "PSA 9", "Pokemon Base Common", 88, 60},
		},
		chaseLadder: []float64{40, 24, 14, 8, 5, 3},
	},
}

// rebalanceWithCommons takes a pack's real chase cards (Index-priced), re-weights them
// into the pack's rarity ladder, and prepends the labeled commons tier so the mix reads
// like a real pool (commons dominate, chase is a thin upside tail). Pure — no file IO —
// so `engine commons` (offline) and the live pool manager (runtime) share one path.
// Commons whose name collides with a real chase card are skipped (dedupe safety net).
func rebalanceWithCommons(id string, chase []PoolEntry) []PoolEntry {
	cfg, ok := commonsConfig[id]
	if !ok {
		return chase
	}
	out := append([]PoolEntry{}, chase...)
	sort.Slice(out, func(i, j int) bool { return out[i].Card.FMVUsd < out[j].Card.FMVUsd })
	for i := range out {
		if i < len(cfg.chaseLadder) {
			out[i].Weight = cfg.chaseLadder[i]
		} else {
			out[i].Weight = 1
		}
	}

	chaseNames := map[string]bool{}
	for _, e := range out {
		chaseNames[strings.ToLower(e.Card.Name)] = true
	}

	commons := make([]PoolEntry, 0, len(cfg.commons))
	seen := map[string]bool{}
	for _, c := range cfg.commons {
		if chaseNames[strings.ToLower(c.name)] {
			continue
		}
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
	return append(commons, out...)
}

func runCommons() {
	packs := loadPacksForCommons()

	for _, id := range []string{"omega", "renacrypt", "eden", "voyaga", "frozen", "legacy-8"} {
		if _, ok := commonsConfig[id]; !ok {
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

		pool.Cards = rebalanceWithCommons(id, chase)
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
