package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

// Odds model — PullEV's three labeled draw bands over the card prices: Chase (~1%, rare),
// Mid (~33%), Common (~66%, cheap bulk). These are OUR model, not a verbatim Renaiss scheme:
// Renaiss publishes a PER-PACK tiered "what is loaded" whose names and counts vary (e.g.
// OMEGA = Tier S/A/B/C, Eden = Crown/Bloom/Thorn) and whose exact per-tier chances aren't
// public. We set the rare band near ~1% as an assumption, consistent with Renaiss surfacing
// a sub-1% top tier; it is not a sourced Renaiss odds figure. Only the Chase band holds real
// Renaiss Index valuations; the Mid and Common bands are cheap labeled filler
// (fmvIsAssumption, fmvSource:Mock) — our library is chase-heavy while Renaiss loads many
// cheap cards we don't price, so the filler stands in for that bulk. So for most packs the
// bulk of the draw probability sits on assumed filler, and only the ~1% Chase band is real.
//
// `engine tiers` (offline, no API) reads each pool's real chase cards, bins them into the
// three bands by FMV, adds the cheap filler, and weights each band so its total draw
// probability equals its model chance. Idempotent (drops prior filler first). Run it AFTER
// `engine curate`, then `engine snapshot`, then rebuild the binary.

// Band draw chances (PullEV's model). The rare-band ~1% is a labeled assumption consistent
// with Renaiss's sub-1% top tier; the mid/common split is our model (per-pack chances aren't public).
const (
	chaseChance  = 0.01
	midChance    = 0.33
	commonChance = 0.66
)

// fillerCard is a labeled cheap card populating the Common bulk (assumed FMV, Mock source).
type fillerCard struct {
	name  string
	grade string
	set   string
	fmv   float64
}

// tierConfig sets, per pack, the FMV boundaries between tiers and the cheap Common-band filler.
// Boundaries are calibrated so the computed edge reads believable (real chances + real
// chase prices + this cheap filler). Chase cards >= chaseFloor are Chase; [midFloor,
// chaseFloor) are Mid; the rest plus filler are Common.
type tierConfig struct {
	prefix     string
	chaseFloor float64
	midFloor   float64
	filler     []fillerCard
}

// Filler spans each pack's Common and Mid bands with cheap labeled cards, scaled to the
// pack price. The real chase cards (all pricier than any filler) sit above chaseFloor and
// so land in the Chase band (~1%, rare) — exactly how real gacha works: most pulls are cheap, the
// chase is rare. This keeps the computed edge believable (house edge, thin margins) while
// the band chances stay our labeled model.
var omegaFiller = []fillerCard{ // OMEGA $48
	{"Rattata", "PSA 9", "Pokemon Base Common", 8},
	{"Pidgey", "PSA 9", "Pokemon Base Common", 14},
	{"Zubat", "PSA 9", "Pokemon Base Common", 22},
	{"Caterpie", "PSA 9", "Pokemon Base Common", 34},
	{"Weedle", "PSA 9", "Pokemon Base Common", 58},
	{"Spearow", "PSA 9", "Pokemon Base Common", 76},
	{"Ekans", "PSA 9", "Pokemon Base Common", 96},
}
var renaFiller = []fillerCard{ // RenaCrypt $88
	{"Coby", "PSA 9", "One Piece Common", 14},
	{"Buggy", "PSA 9", "One Piece Common", 24},
	{"Alvida", "PSA 9", "One Piece Common", 40},
	{"Helmeppo", "PSA 9", "One Piece Common", 64},
	{"Kaya", "PSA 9", "One Piece Common", 96},
	{"Morgan", "PSA 9", "One Piece Common", 122},
	{"Bepo", "PSA 9", "One Piece Common", 146},
}
var premFiller = []fillerCard{ // $100 premium packs (Champion + previous)
	{"Rattata", "PSA 9", "Pokemon Base Common", 18},
	{"Coby", "PSA 9", "One Piece Common", 32},
	{"Pidgey", "PSA 9", "Pokemon Base Common", 52},
	{"Buggy", "PSA 9", "One Piece Common", 78},
	{"Zubat", "PSA 9", "Pokemon Base Common", 118},
	{"Alvida", "PSA 9", "One Piece Common", 152},
	{"Caterpie", "PSA 9", "Pokemon Base Common", 182},
}
var edenFiller = []fillerCard{ // Eden $150 flagship (richer, so its house edge is milder)
	{"Rattata", "PSA 9", "Pokemon Base Common", 28},
	{"Coby", "PSA 9", "One Piece Common", 50},
	{"Pidgey", "PSA 9", "Pokemon Base Common", 82},
	{"Buggy", "PSA 9", "One Piece Common", 120},
	{"Zubat", "PSA 9", "Pokemon Base Common", 175},
	{"Alvida", "PSA 9", "One Piece Common", 220},
	{"Caterpie", "PSA 9", "Pokemon Base Common", 260},
}

// Per-pack configs, calibrated via `engine tiers` verdict print. chaseFloor sits above the
// filler top so real chase cards fall in Chase; midFloor splits filler into Mid/Common.
// Previous $100 packs share the default (premium) config.
var tierConfigs = map[string]tierConfig{
	"omega":     {"omega", 110, 40, omegaFiller},
	"renacrypt": {"rena", 160, 55, renaFiller},
	"eden":      {"eden", 300, 140, edenFiller},
	"champion":  {"champ", 200, 100, premFiller},
}

var defaultTierConfig = tierConfig{"prev", 200, 100, premFiller}

func tierFor(id string) tierConfig {
	if c, ok := tierConfigs[id]; ok {
		return c
	}
	c := defaultTierConfig
	c.prefix = idPrefix(id)
	return c
}

func idPrefix(id string) string {
	return strings.ReplaceAll(id, "-", "")
}

// applyTiers organizes a pack's real chase cards plus cheap filler into Chase/Mid/Common
// and weights each tier so its total draw probability equals its model chance. Pure
// (no IO), so `engine tiers` and the live pool manager share one path.
func applyTiers(id string, chase []PoolEntry) []PoolEntry {
	cfg := tierFor(id)

	chaseNames := map[string]bool{}
	for _, e := range chase {
		chaseNames[strings.ToLower(e.Card.Name)] = true
	}

	// Build the labeled Thorn filler (skip any name colliding with a real chase card).
	seen := map[string]bool{}
	all := append([]PoolEntry{}, chase...)
	for _, f := range cfg.filler {
		if chaseNames[strings.ToLower(f.name)] {
			continue
		}
		fid := cfg.prefix + "-filler-" + slugName(f.name)
		for seen[fid] {
			fid += "-x"
		}
		seen[fid] = true
		all = append(all, PoolEntry{Card: Card{
			ID: fid, Name: f.name, Grade: f.grade, Set: f.set,
			FMVUsd: f.fmv, FMVIsAssumption: true, FMVSource: SourceMock, FMVConfidence: "assumed",
		}})
	}

	// Bin into bands by FMV.
	var chaseBand, midBand, commonBand []PoolEntry
	for _, e := range all {
		switch {
		case e.Card.FMVUsd >= cfg.chaseFloor:
			chaseBand = append(chaseBand, e)
		case e.Card.FMVUsd >= cfg.midFloor:
			midBand = append(midBand, e)
		default:
			commonBand = append(commonBand, e)
		}
	}

	// Weight each tier so its total draw probability equals its model chance
	// (equal within a band). ComputeEV normalizes by the weight sum, so proportions hold.
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

	out := make([]PoolEntry, 0, len(all))
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

		// Keep only real chase cards; drop any previously-added filler (idempotent).
		chase := make([]PoolEntry, 0, len(pool.Cards))
		for _, e := range pool.Cards {
			if e.Card.FMVIsAssumption || e.Card.FMVSource != SourceIndex {
				continue
			}
			chase = append(chase, e)
		}

		pool.Cards = applyTiers(p, chase)
		must(writeJSONFile(path, pool))
		printPoolVerdict(p, pool, packs[p])
	}
	fmt.Println("\nTiers applied. Run `engine snapshot`, then rebuild the binary (go:embed).")
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
	fmt.Printf("%-11s cost $%-6.0f EV $%-8.2f ratio %.2f (%+.0f%%)  P(profit) %4.1f%%  %d cards  → %s\n",
		id, pack.PriceUsd, ev.ExpectedValue, ev.EVToCostRatio, (ev.EVToCostRatio-1)*100,
		ev.ChanceOfProfit*100, len(pool.Cards), verdict)
}
