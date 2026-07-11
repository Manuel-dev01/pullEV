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

// poolSize is the total number of real cards in each pack's pool (14 cheap commons + 2 chase,
// selected by pickLowPlusChase). Sized to the real cheap-card depth of the thinnest game
// (Pokemon has ~15 cards under OMEGA's price cap), so every card stays a real Index valuation
// and the pool never has to reach for cards above the cap. `applyTiers` then bins these into
// the three bands (roughly 2 Chase / 4 Mid / 10 Common), so the 70%-Common bulk reads as a
// real sample rather than a token few. Curate and the live rotation manager (livepool.go) use
// the same value so the offline build and runtime rotation agree.
const poolSize = 16

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

// dedupeByIdentity keeps one card per distinct real listing (name + set + grade), so a
// character's different sets/arts survive as the genuinely distinct graded cards they are
// (unlike dedupeByName, which collapses every Luffy to one). This grows the real library
// depth without inventing anything; each kept card still has a unique name+set to display.
func dedupeByIdentity(cards []curatedCard) []curatedCard {
	seen := map[string]bool{}
	out := []curatedCard{}
	for _, c := range cards {
		key := strings.ToLower(strings.TrimSpace(c.val.Name)) + "|" +
			strings.ToLower(strings.TrimSpace(c.val.SetName)) + "|" +
			strings.ToLower(strings.TrimSpace(c.val.GradeLabel))
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, c)
	}
	return out
}

// pickSpreadRotated is pickSpread with a per-cycle offset, so a pack's membership
// rotates over time (fresh cards surface) while keeping a cheap→pricey spread. The
// live pool manager calls this each refresh cycle; offset 0 ≡ pickSpread.
func pickSpreadRotated(cards []curatedCard, n, offset int) []curatedCard {
	if len(cards) <= n {
		return cards
	}
	used := make(map[int]bool, n)
	out := make([]curatedCard, 0, n)
	for i := 0; i < n; i++ {
		idx := (i*(len(cards)-1)/(n-1) + offset) % len(cards)
		for used[idx] {
			idx = (idx + 1) % len(cards)
		}
		used[idx] = true
		out = append(out, cards[idx])
	}
	return out
}

// pickLowPlusChase selects a realistic gacha pool from real cards: mostly cheap commons
// (which fill the high-probability Common + Mid bands) plus a few rare, valuable chase cards.
// This concentrates draw probability on cheap cards like real gacha, so the EV reads as an
// honest house edge computed from 100% real prices (an even price spread would put mid-priced
// cards in the common bands and make every pack look absurdly +EV). Rotates for variety.
func pickLowPlusChase(cards []curatedCard, nLow, nChase, offset int, cheapCap float64) []curatedCard {
	if len(cards) <= nLow+nChase {
		return cards
	}
	sorted := sortAsc(cards)
	n := len(sorted)

	// Chase band: the most valuable cards. Rather than always taking the single global top
	// nChase (which makes every pack drawing from the same library surface the IDENTICAL chase),
	// pick nChase from a small window of the top-value cards with a per-pack rotation, so packs
	// get DISTINCT, still-genuinely-expensive chases. The library has real depth here (many
	// cards well above the commons), so the window stays high-value.
	window := nChase * 8
	if window > n-nLow {
		window = n - nLow
	}
	if window < nChase {
		window = nChase
	}
	chase := pickSpreadRotated(sorted[n-window:], nChase, offset)
	chosen := make(map[string]bool, nChase)
	for _, c := range chase {
		chosen[c.slug] = true
	}

	// Draw the commons from real cards under a price cap RELATIVE to the pack price, so the
	// high-probability Common/Mid bands stay cheaper than the ticket (an even spread, or a
	// flat cap above the ticket, would make the pack look absurdly +EV). Exclude any card
	// already chosen as chase; fall back to the cheapest cards if too few qualify.
	cheap := make([]curatedCard, 0, n)
	for _, c := range sorted {
		if chosen[c.slug] || c.val.PriceUsd > cheapCap {
			continue
		}
		cheap = append(cheap, c)
	}
	if len(cheap) < nLow {
		cheap = cheap[:0]
		for _, c := range sorted {
			if chosen[c.slug] {
				continue
			}
			cheap = append(cheap, c)
			if len(cheap) >= nLow {
				break
			}
		}
	}
	low := pickSpreadRotated(cheap, nLow, offset)
	return append(low, chase...)
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

// poolEntriesFrom builds weighted chase PoolEntries from real priced cards
// (cheap→pricey, rarity weight ladder). Pure: no file/vmap/seed side effects, so both
// `engine curate` (offline) and the live pool manager (runtime) share one builder.
// Returns the entries plus the price-sorted cards aligned by index (for id→slug mapping).
func poolEntriesFrom(prefix string, cards []curatedCard) ([]PoolEntry, []curatedCard) {
	sorted := append([]curatedCard{}, cards...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].val.PriceUsd < sorted[j].val.PriceUsd })
	entries := make([]PoolEntry, 0, len(sorted))
	seenID := map[string]bool{}
	for i, c := range sorted {
		id := cardID(prefix, c.val)
		for seenID[id] {
			id += "-x"
		}
		seenID[id] = true
		w := 1.0
		if i < len(weightLadder) {
			w = weightLadder[i]
		}
		entries = append(entries, PoolEntry{
			Weight: w,
			Card: Card{
				ID: id, Name: c.val.Name, Grade: c.val.GradeLabel, Set: c.val.SetName,
				FMVUsd: c.val.PriceUsd, FMVIsAssumption: false, FMVSource: SourceIndex,
				FMVAsOf: c.val.LastSaleAt, FMVConfidence: c.val.Confidence, FMVDeltaPct: c.val.DeltaPct,
				ImageURL: c.val.ImageURL,
			},
		})
	}
	return entries, sorted
}

func buildPool(packID, prefix string, cards []curatedCard, vmap map[string]string, seed map[string]Valuation) Pool {
	entries, sorted := poolEntriesFrom(prefix, cards)
	for i, e := range entries {
		vmap[e.Card.ID] = sorted[i].slug
		seed[sorted[i].slug] = sorted[i].val
	}
	return Pool{PackID: packID, Cards: entries}
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

// previousPackIDs are the 11 sold-out limited packs (all $100). Each draws the premium
// band with a per-pack rotation offset so they are not identical.
var previousPackIDs = []string{
	"world-cup", "aura", "ribbon", "plasma", "magma",
	"legacy-7", "legacy-8", "legacy-9", "costume", "bowtie", "starry",
}

// allocatePacks assigns real cards to each of the 15 real packs. Shared by `engine curate`
// (offline build) and the live pool manager (runtime) so the two never drift. Each pack draws
// a FULL price-range spread of real cards from its game(s): OMEGA = all Pokemon, RenaCrypt =
// all One Piece, Eden + Champion + the previous packs = the full mixed library. The
// per-pack subset (mostly cheap commons + a rare chase) is then chosen by pickLowPlusChase so
// the three bands all fill with REAL cards. All lists are price-ascending. No fabricated filler.
func allocatePacks(op, pkm []curatedCard) map[string][]curatedCard {
	combined := dedupeByIdentity(append(append([]curatedCard{}, pkm...), op...))
	out := map[string][]curatedCard{
		"omega":     sortAsc(pkm),
		"renacrypt": sortAsc(op),
		"eden":      sortAsc(combined),
		"champion":  sortAsc(combined),
	}
	for _, id := range previousPackIDs {
		out[id] = sortAsc(combined)
	}
	return out
}

// cheapCapFor returns the price ceiling for a pack's common cards: a fraction of the ticket
// price, so the high-probability bands are cheaper than the ticket and the pack reads as a
// believable house edge. Falls back to a flat cap when the price is unknown.
func cheapCapFor(price float64) float64 {
	if price <= 0 {
		return 60
	}
	return price * 0.55
}

// curateOffset gives each pack a stable spread offset so the committed (offline) fixtures are
// not identical even when they draw from the same combined library. The live manager rotates
// separately per cycle; this only differentiates the cold-start/offline baseline.
func curateOffset(id string) int {
	order := append([]string{"omega", "renacrypt", "eden", "champion"}, previousPackIDs...)
	for i, p := range order {
		if p == id {
			// Step 7 is coprime to the chase window (nChase*8 = 16), so the 15 packs get 15
			// distinct rotations and their chases (and thus their cover art) don't collide.
			return i * 7
		}
	}
	return 0
}

func sortAsc(cards []curatedCard) []curatedCard {
	out := append([]curatedCard{}, cards...)
	sort.Slice(out, func(i, j int) bool { return out[i].val.PriceUsd < out[j].val.PriceUsd })
	return out
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
	opCards := priceSlugs(ctx, client, op, len(op))
	fmt.Println("[pokemon]")
	pkmCards := priceSlugs(ctx, client, pkm, len(pkm))

	// Keep distinct real variants (name+set), not one-per-name, so the library is deep
	// enough for wide packs. Renaiss's browseable set pages are bot-walled, so variants of
	// the harvested chase characters are the honest way to grow depth.
	opCards = dedupeByIdentity(opCards)
	pkmCards = dedupeByIdentity(pkmCards)
	sort.Slice(opCards, func(i, j int) bool { return opCards[i].val.PriceUsd < opCards[j].val.PriceUsd })
	sort.Slice(pkmCards, func(i, j int) bool { return pkmCards[i].val.PriceUsd < pkmCards[j].val.PriceUsd })
	fmt.Printf("distinct priced cards: %d one-piece, %d pokemon\n", len(opCards), len(pkmCards))

	// Allocate real cards to the 15 real packs (shared with the live rotation manager so
	// curate and runtime never drift).
	alloc := allocatePacks(opCards, pkmCards)

	vmap := map[string]string{
		"_note": "cardId -> Renaiss structured card path (game/set/slug). Real live valuations; " +
			"pool membership + tier weights are labeled assumptions. Rebuild with `engine curate`, refresh with `engine refresh`.",
	}
	seed := map[string]Valuation{}
	// Seed the WHOLE priced library (not just selected cards) so offline rebuilds have depth.
	for _, c := range append(append([]curatedCard{}, opCards...), pkmCards...) {
		seed[c.slug] = c.val
	}

	packs := loadPacksForCommons()
	built := map[string]Pool{}
	for id, cards := range alloc {
		cap := cheapCapFor(packs[id].PriceUsd)
		built[id] = buildPool(id, idPrefix(id), pickLowPlusChase(cards, poolSize-2, 2, curateOffset(id), cap), vmap, seed)
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
