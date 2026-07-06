package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// This file builds REAL, live-priced pools from cards harvested off the Renaiss
// index site (index.renaissos.com/indices/*), priced via the structured card
// endpoint. Run once with `engine curate` to rebuild the pool fixtures + seed;
// run `engine refresh` to re-price the existing map and rewrite the seed.
//
// Card identities, grades, and prices are REAL (Renaiss Index, beta). Pool
// membership and draw WEIGHTS are our own construction (labeled assumptions) —
// Renaiss exposes no pool/odds API.

// weightLadder is a realistic gacha weighting (commons dominate), cheapest→priciest.
var weightLadder = []float64{80, 22, 9, 4, 2, 1, 1, 1, 1, 1}

type curatedCard struct {
	slug string
	val  Valuation
}

func priceSlugs(ctx context.Context, client *IndexClient, slugs []string, limit int) []curatedCard {
	out := []curatedCard{}
	for i, s := range slugs {
		if limit > 0 && i >= limit {
			break
		}
		key := strings.TrimPrefix(strings.Trim(s, "/"), "card/")
		// Retry with backoff — the API soft-throttles bursts (timeouts, not 429s).
		var v Valuation
		var err error
		for attempt := 0; attempt < 3; attempt++ {
			v, err = client.LookupKey(ctx, key)
			if err == nil {
				break
			}
			time.Sleep(time.Duration(400*(attempt+1)) * time.Millisecond)
		}
		if err != nil || !v.Found || v.PriceUsd <= 5 || v.PriceUsd > 6000 {
			fmt.Printf("  skip %-70s (%v)\n", key, chooseReason(err, v))
			continue
		}
		out = append(out, curatedCard{slug: key, val: v})
		fmt.Printf("  ok   %-40s %-16s $%.2f\n", v.Name, v.GradeLabel, v.PriceUsd)
		time.Sleep(250 * time.Millisecond) // stay under the burst throttle
	}
	return out
}

func chooseReason(err error, v Valuation) string {
	if err != nil {
		return "err"
	}
	if !v.Found {
		return "not found"
	}
	return fmt.Sprintf("price $%.2f out of band", v.PriceUsd)
}

// dedupeByName keeps one card per distinct name (the first seen) for visual variety,
// since real index pages are dominated by a few chase characters (e.g. Luffy).
func dedupeByName(cards []curatedCard) []curatedCard {
	seen := map[string]bool{}
	out := []curatedCard{}
	for _, c := range cards {
		key := strings.ToLower(strings.TrimSpace(c.val.Name))
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, c)
	}
	return out
}

// splitAlt splits a slice into two disjoint halves by alternating index, so two packs
// drawing on the same card list end up with distinct (non-overlapping) cards.
func splitAlt(cards []curatedCard) ([]curatedCard, []curatedCard) {
	var a, b []curatedCard
	for i, c := range cards {
		if i%2 == 0 {
			a = append(a, c)
		} else {
			b = append(b, c)
		}
	}
	return a, b
}

// pickSpread returns n cards spanning cheap→expensive from a price-sorted slice.
func pickSpread(cards []curatedCard, n int) []curatedCard {
	if len(cards) <= n {
		return cards
	}
	out := make([]curatedCard, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, cards[i*(len(cards)-1)/(n-1)])
	}
	return out
}

func cardID(prefix string, v Valuation) string {
	name := strings.ToLower(v.Name)
	repl := strings.NewReplacer(" ", "-", ".", "", "'", "", "’", "", "/", "-", "(", "", ")", "")
	name = repl.Replace(name)
	for strings.Contains(name, "--") {
		name = strings.ReplaceAll(name, "--", "-")
	}
	return prefix + "-" + strings.Trim(name, "-")
}

func buildPool(packID, prefix string, cards []curatedCard, vmap map[string]string, seed map[string]Valuation) Pool {
	sort.Slice(cards, func(i, j int) bool { return cards[i].val.PriceUsd < cards[j].val.PriceUsd })
	pool := Pool{PackID: packID}
	seenID := map[string]bool{}
	for i, c := range cards {
		id := cardID(prefix, c.val)
		for seenID[id] {
			id += "-x"
		}
		seenID[id] = true
		w := 1.0
		if i < len(weightLadder) {
			w = weightLadder[i]
		}
		pool.Cards = append(pool.Cards, PoolEntry{
			Weight: w,
			Card: Card{
				ID: id, Name: c.val.Name, Grade: c.val.GradeLabel, Set: c.val.SetName,
				FMVUsd: c.val.PriceUsd, FMVIsAssumption: false, FMVSource: SourceIndex,
				FMVAsOf: c.val.LastSaleAt, FMVConfidence: c.val.Confidence, FMVDeltaPct: c.val.DeltaPct,
				ImageURL: c.val.ImageURL,
			},
		})
		vmap[id] = c.slug
		seed[c.slug] = c.val
	}
	return pool
}

func writeJSONFile(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

// runCurate rebuilds pools from real cards. Reads harvested slug lists from
// cache/slugs_op.txt and cache/slugs_pkm.txt.
func runCurate() {
	loadDotEnv(".env")
	client := NewIndexClient()
	if !client.authed() {
		fmt.Println("WARNING: no partner keys in env — public tier (10/day) will rate-limit curation fast.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	op := readLinesFile("cache/slugs_op.txt")
	pkm := readLinesFile("cache/slugs_pkm.txt")
	fmt.Printf("Pricing %d one-piece + %d pokemon slugs (live)…\n", len(op), len(pkm))

	fmt.Println("[one-piece]")
	opCards := priceSlugs(ctx, client, op, 50)
	fmt.Println("[pokemon]")
	pkmCards := priceSlugs(ctx, client, pkm, 50)

	opCards = dedupeByName(opCards)
	pkmCards = dedupeByName(pkmCards)
	sort.Slice(opCards, func(i, j int) bool { return opCards[i].val.PriceUsd < opCards[j].val.PriceUsd })
	sort.Slice(pkmCards, func(i, j int) bool { return pkmCards[i].val.PriceUsd < pkmCards[j].val.PriceUsd })
	fmt.Printf("distinct priced cards: %d one-piece, %d pokemon\n", len(opCards), len(pkmCards))

	// Split each game's cards into two DISTINCT halves (alternating by price rank) so the
	// two packs drawing on that game don't share cards. Premium (eden/legacy) is split the
	// same way from the highest-value combined band.
	opA, opB := splitAlt(opCards)   // renacrypt, voyaga
	pkmA, pkmB := splitAlt(pkmCards) // omega, frozen
	combined := dedupeByName(append(append([]curatedCard{}, pkmCards...), opCards...))
	sort.Slice(combined, func(i, j int) bool { return combined[i].val.PriceUsd > combined[j].val.PriceUsd })
	premA, premB := splitAlt(combined) // eden, legacy-8
	if len(premA) > 8 {
		premA = premA[:8]
	}
	if len(premB) > 8 {
		premB = premB[:8]
	}

	vmap := map[string]string{
		"_note": "cardId -> Renaiss structured card path (game/set/slug). Real live valuations; " +
			"pool membership + weights are labeled assumptions. Rebuild with `engine curate`, refresh with `engine refresh`.",
	}
	seed := map[string]Valuation{}
	// Seed the WHOLE priced library (not just selected cards) so offline rebuilds have depth.
	for _, c := range append(append([]curatedCard{}, opCards...), pkmCards...) {
		seed[c.slug] = c.val
	}

	built := map[string]Pool{
		"renacrypt": buildPool("renacrypt", "rena", pickSpread(opA, 8), vmap, seed),   // One Piece x Collector Crypt, $88
		"voyaga":    buildPool("voyaga", "voyaga", pickSpread(opB, 8), vmap, seed),     // One Piece Grand Line, $120
		"omega":     buildPool("omega", "omega", pickSpread(pkmA, 8), vmap, seed),      // Pokemon, $48
		"frozen":    buildPool("frozen", "frozen", pickSpread(pkmB, 8), vmap, seed),    // Pokemon icy, $60
		"eden":      buildPool("eden", "eden", premA, vmap, seed),                       // premium mixed, $150
		"legacy-8":  buildPool("legacy-8", "legacy", premB, vmap, seed),                 // vintage premium, $200
	}

	// Guard: never clobber good fixtures with a throttled/empty run.
	for id, p := range built {
		if len(p.Cards) < 4 {
			fmt.Printf("ABORT: pool %s resolved only %d cards — likely rate-throttled. "+
				"Existing fixtures left untouched; retry later.\n", id, len(p.Cards))
			os.Exit(1)
		}
	}
	for id, p := range built {
		must(writeJSONFile(fmt.Sprintf("fixtures/pools/%s.json", id), p))
	}
	must(writeJSONFile("fixtures/valuation-map.json", vmap))
	must(writeJSONFile("fixtures/valuations.seed.json", seed))

	fmt.Printf("\nCurated %d pools · seed=%d valuations\n", len(built), len(seed))
	fmt.Println("Run `engine commons` next, then rebuild the binary + web snapshot.")
}

// runRefresh re-prices every mapped card and rewrites the committed seed so prices
// stay current, without changing pool membership/weights.
func runRefresh() {
	loadDotEnv(".env")
	client := NewIndexClient()
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	b, err := os.ReadFile("fixtures/valuation-map.json")
	must(err)
	raw := map[string]string{}
	must(json.Unmarshal(b, &raw))

	seed := map[string]Valuation{}
	n := 0
	for id, key := range raw {
		if id == "_note" {
			continue
		}
		v, err := client.LookupKey(ctx, key)
		if err != nil || !v.Found {
			fmt.Printf("  keep-old %s (%v)\n", key, chooseReason(err, v))
			continue
		}
		seed[key] = v
		n++
		fmt.Printf("  refreshed %-40s $%.2f\n", v.Name, v.PriceUsd)
	}
	must(writeJSONFile("fixtures/valuations.seed.json", seed))
	fmt.Printf("Refreshed %d valuations into the seed.\n", n)
}

func readLinesFile(path string) []string {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	lines := []string{}
	for _, l := range strings.Split(string(b), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			lines = append(lines, l)
		}
	}
	return lines
}

func must(err error) {
	if err != nil {
		fmt.Println("FATAL:", err)
		os.Exit(1)
	}
}
