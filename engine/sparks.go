package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"
)

// `engine sparks` populates real price-history sparklines on the committed valuation seed by
// fetching each card's fmv-series from the Renaiss Index. The seed keys ARE the card paths, so
// we look up each directly. Best-effort + rate-limit aware: a miss just leaves that card's
// spark empty. Run AFTER `engine curate`, then `engine snapshot`, then rebuild the binary.
func runSparks() {
	loadDotEnv(".env")
	client := NewIndexClient()
	if !client.authed() {
		fmt.Println("WARNING: no partner keys — public tier (10/day) will rate-limit fast.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()

	b, err := os.ReadFile("fixtures/valuations.seed.json")
	must(err)
	seed := map[string]Valuation{}
	must(json.Unmarshal(b, &seed))

	paths := make([]string, 0, len(seed))
	for k := range seed {
		paths = append(paths, k)
	}
	sort.Strings(paths)

	got := 0
	for i, path := range paths {
		if ctx.Err() != nil {
			break
		}
		spark, err := client.LookupSeries(ctx, path)
		if err == ErrRateLimited {
			fmt.Printf("rate limited after %d cards — keeping what we have\n", got)
			break
		}
		if err == nil && len(spark) >= 2 {
			v := seed[path]
			v.Spark = spark
			seed[path] = v
			got++
		}
		if i%20 == 0 {
			fmt.Printf("  %d/%d cards…\n", i, len(paths))
		}
		time.Sleep(200 * time.Millisecond)
	}

	must(writeJSONFile("fixtures/valuations.seed.json", seed))
	fmt.Printf("Sparks populated: %d/%d cards now have real price history. Run `engine snapshot`, then rebuild.\n", got, len(paths))
}
