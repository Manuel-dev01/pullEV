package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// `engine snapshot` regenerates the web offline-fallback artifacts from the current
// on-disk fixtures, so they never drift by hand again:
//   - web/lib/snapshot.json      = { generatedAt, packs, pools } (the bundled fallback
//                                    used across web/lib/api.ts when the engine is down)
//   - web/lib/valuations.seed.json = a byte copy of the committed valuation seed (the
//                                    /value cert-lookup offline fallback)
//
// Reads from DISK (not the embedded FS) so it reflects the latest `curate`/`commons`
// output without needing a binary rebuild first. Run it LAST in the data workflow:
//   engine curate  ->  engine commons  ->  engine snapshot  ->  rebuild binary
//
// Paths are relative to the engine/ working directory (where the tooling runs).

type webSnapshot struct {
	GeneratedAt string          `json:"generatedAt"`
	Packs       []Pack          `json:"packs"`
	Pools       map[string]Pool `json:"pools"`
}

func runSnapshot() {
	var packs []Pack
	b, err := os.ReadFile("fixtures/packs.json")
	must(err)
	must(json.Unmarshal(b, &packs))

	pools := map[string]Pool{}
	for _, p := range packs {
		pb, err := os.ReadFile(fmt.Sprintf("fixtures/pools/%s.json", p.ID))
		if err != nil {
			fmt.Printf("  skip %s (no pool fixture: %v)\n", p.ID, err)
			continue
		}
		var pool Pool
		must(json.Unmarshal(pb, &pool))
		pools[p.ID] = pool
	}

	snap := webSnapshot{
		GeneratedAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		Packs:       packs,
		Pools:       pools,
	}
	must(writeJSONFile("../web/lib/snapshot.json", snap))

	// Sync the /value offline seed by byte-copying the committed valuation seed, so the
	// web copy can never fall behind the engine's (the drift this command exists to kill).
	seed, err := os.ReadFile("fixtures/valuations.seed.json")
	must(err)
	must(os.WriteFile("../web/lib/valuations.seed.json", seed, 0o644))

	// Sync the market-indices seed too (offline fallback for the market strip).
	if idx, err := os.ReadFile("fixtures/indices.seed.json"); err == nil {
		must(os.WriteFile("../web/lib/indices.seed.json", idx, 0o644))
	}

	fmt.Printf("Snapshot written: %d packs, %d pools -> web/lib/snapshot.json; seed synced -> web/lib/valuations.seed.json\n",
		len(packs), len(pools))
}
