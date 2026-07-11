package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"time"
)

// dataAsOf is the date the committed fixtures were last built/priced (bump when you re-run
// `engine curate`/`repool`). MockAdapter reports it as fetchedAt for the offline fallback;
// once the live loop runs, GetPool/ListPacks stamp the real refresh time instead.
const dataAsOf = "2026-07-11T00:00:00Z"

const mockNotes = "Committed offline fixtures. Card PRICES are real Renaiss Index (beta) valuations " +
	"from the last refresh, and each card carries its own LIVE freshness tag. What is a labeled " +
	"PullEV model is only the pool MEMBERSHIP and draw odds (Renaiss exposes no pool/odds API). " +
	"Pack prices are verified from the live Renaiss site. See each card's own source."

// Draws are no longer static fixtures — example proofs are generated from the live
// pool commitment (see merkle.go + the /example-proof handler).
//
//go:embed fixtures/packs.json fixtures/pools/*.json
var fixtureFS embed.FS

// MockAdapter serves deterministic fixtures from embedded JSON. Offline-safe and the
// demo fallback — it can never fail to render.
type MockAdapter struct{}

func NewMockAdapter() *MockAdapter { return &MockAdapter{} }

func (m *MockAdapter) Source() SourceKind { return SourceMock }

func (m *MockAdapter) provenance() Provenance {
	return Provenance{
		Source:     SourceMock,
		FetchedAt:  dataAsOf,
		IsOfficial: false,
		Notes:      mockNotes,
	}
}

func (m *MockAdapter) ListPacks(_ context.Context) ([]Pack, Provenance, error) {
	var packs []Pack
	if err := readFixture("fixtures/packs.json", &packs); err != nil {
		return nil, Provenance{}, err
	}
	// Once the live loop has run, stamp the shelf with the real refresh time — its EV
	// edges are computed from live-priced pools, so the authored fixture date is stale.
	if livePools != nil {
		if ts, ok := livePools.LastRefresh(); ok {
			return packs, Provenance{
				Source:     SourceMock,
				FetchedAt:  ts.UTC().Format(time.RFC3339),
				IsOfficial: false,
				Notes: "Pack facts (id, name, price) are authored/verified; the shelf's EV " +
					"edges are computed from pools re-priced live off the Renaiss Index (beta) " +
					"at this time. Pool membership is a labeled PullEV model.",
			}, nil
		}
	}
	return packs, m.provenance(), nil
}

func (m *MockAdapter) GetPool(_ context.Context, packID string) (Pool, Provenance, error) {
	// Prefer the autonomously refreshed + rotated pool (real prices, real timestamp)
	// when the live manager has one; otherwise serve the embedded fixture unchanged.
	if livePools != nil {
		if pool, ts, ok := livePools.Get(packID); ok {
			return pool, livePoolProvenance(ts), nil
		}
	}
	var pool Pool
	path := fmt.Sprintf("fixtures/pools/%s.json", packID)
	if err := readFixture(path, &pool); err != nil {
		return Pool{}, Provenance{}, ErrNotFound
	}
	enrichPoolValuations(&pool)
	return pool, m.provenance(), nil
}

// livePoolProvenance labels an autonomously rebuilt pool. Source stays Mock so the badge
// reads PULLEV MODEL (structure IS a PullEV model — no Renaiss odds API); FetchedAt is
// the real last-refresh time, and per-card LIVE tags carry each price's own freshness.
func livePoolProvenance(ts time.Time) Provenance {
	return Provenance{
		Source:     SourceMock,
		FetchedAt:  ts.UTC().Format(time.RFC3339),
		IsOfficial: false,
		Notes: "Pool STRUCTURE is a PullEV model (Renaiss exposes no odds/pool API), " +
			"rotated autonomously. Card PRICES are live Renaiss Index (beta) valuations, " +
			"re-priced this cycle; each card carries its own LIVE freshness tag.",
	}
}

// enrichPoolValuations overlays real Renaiss Index valuations onto pool cards that
// are mapped to a real cert (via valuation-map.json). Overlaid cards become
// fmvSource=Index with confidence/trend/freshness; every other card is labeled Mock.
// No network call — reads only the committed seed / session cache.
func enrichPoolValuations(pool *Pool) {
	for i := range pool.Cards {
		c := &pool.Cards[i].Card
		if c.FMVSource == "" {
			c.FMVSource = SourceMock
		}
		cert, ok := valuationCache.CertForCard(c.ID)
		if !ok {
			continue
		}
		v, ok := valuationCache.Seed(cert)
		if !ok || !v.Found {
			continue
		}
		c.FMVUsd = v.PriceUsd
		c.FMVIsAssumption = false
		c.FMVSource = SourceIndex
		c.FMVAsOf = v.LastSaleAt
		c.FMVConfidence = v.Confidence
		c.FMVDeltaPct = v.DeltaPct
		if c.ImageURL == "" {
			c.ImageURL = v.ImageURL
		}
	}
}

func readFixture(path string, v any) error {
	b, err := fixtureFS.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
