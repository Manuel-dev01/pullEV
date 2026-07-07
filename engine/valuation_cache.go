package main

import (
	"context"
	"embed"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

//go:embed fixtures/valuations.seed.json fixtures/valuation-map.json
var valuationFS embed.FS

// ValuationCache serves real Renaiss Index valuations with a lookup order of
// session-memory → live API → committed seed. The committed seed guarantees the
// demo shows real (cached) data even offline / when rate-limited.
type ValuationCache struct {
	mu      sync.RWMutex
	mem     map[string]Valuation // live-fetched this session (freshest)
	seed    map[string]Valuation // committed curated real values (offline-safe)
	cardMap map[string]string    // pool cardId -> cert
	client  *IndexClient
	path    string
}

func NewValuationCache(client *IndexClient) *ValuationCache {
	vc := &ValuationCache{
		mem:     map[string]Valuation{},
		seed:    map[string]Valuation{},
		cardMap: map[string]string{},
		client:  client,
		path:    envOr("VALUATION_CACHE", "cache/valuations.json"),
	}
	if b, err := valuationFS.ReadFile("fixtures/valuations.seed.json"); err == nil {
		_ = json.Unmarshal(b, &vc.seed)
	}
	if b, err := valuationFS.ReadFile("fixtures/valuation-map.json"); err == nil {
		raw := map[string]string{}
		if json.Unmarshal(b, &raw) == nil {
			for k, v := range raw {
				if k == "_note" {
					continue
				}
				vc.cardMap[k] = v
			}
		}
	}
	if b, err := os.ReadFile(vc.path); err == nil {
		saved := map[string]Valuation{}
		if json.Unmarshal(b, &saved) == nil {
			for k, v := range saved {
				vc.mem[k] = v
			}
		}
	}
	return vc
}

// CertForCard returns the mapped cert for a pool card, if any.
func (vc *ValuationCache) CertForCard(cardID string) (string, bool) {
	c, ok := vc.cardMap[cardID]
	return c, ok
}

// SeedSnapshot returns the full card library keyed by lookup path/cert: committed seed
// with any live-refreshed values (mem) overlaid. The live pool manager builds its
// candidate library from this so rotation and re-pricing share one source of truth.
func (vc *ValuationCache) SeedSnapshot() map[string]Valuation {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	out := make(map[string]Valuation, len(vc.seed)+len(vc.mem))
	for k, v := range vc.seed {
		out[k] = v
	}
	for k, v := range vc.mem { // fresher live values win
		out[k] = v
	}
	return out
}

// SetMemBatch stores a batch of freshly-fetched valuations into the session cache (one
// persist), so a background refresh updates prices for both the pool overlay and /value.
func (vc *ValuationCache) SetMemBatch(vals map[string]Valuation) {
	if len(vals) == 0 {
		return
	}
	vc.mu.Lock()
	for k, v := range vals {
		vc.mem[k] = v
	}
	vc.persistLocked()
	vc.mu.Unlock()
}

// Seed returns a committed/cached real valuation for a cert WITHOUT any network
// call — used by the pool overlay so GetPool never blocks on the API.
func (vc *ValuationCache) Seed(cert string) (Valuation, bool) {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	if v, ok := vc.mem[cert]; ok {
		return v, true
	}
	v, ok := vc.seed[cert]
	return v, ok
}

// Get is the live-preferred lookup for the /value endpoint: memory → live API →
// committed seed. It caches live results and always returns provenance describing
// origin/freshness. found=false only when nothing (live or seed) is available.
func (vc *ValuationCache) Get(ctx context.Context, cert string) (Valuation, Provenance, bool) {
	vc.mu.RLock()
	if v, ok := vc.mem[cert]; ok {
		vc.mu.RUnlock()
		return v, valProv(v, "cached (session)"), true
	}
	vc.mu.RUnlock()

	v, err := vc.client.LookupKey(ctx, cert)
	if err == nil && v.Found {
		vc.mu.Lock()
		vc.mem[cert] = v
		vc.persistLocked()
		vc.mu.Unlock()
		return v, valProv(v, "live"), true
	}

	vc.mu.RLock()
	s, ok := vc.seed[cert]
	vc.mu.RUnlock()
	if ok {
		note := "committed seed (offline fallback)"
		if err == ErrRateLimited {
			note = "rate limit reached, committed seed fallback"
		}
		return s, valProv(s, note), true
	}

	origin := "not found"
	if err == ErrRateLimited {
		origin = "rate limit reached, no cached value"
	}
	return v, Provenance{
		Source:     SourceIndex,
		FetchedAt:  nowRFC3339(),
		IsOfficial: false,
		Notes:      "Renaiss Index API (beta): " + origin,
	}, false
}

func valProv(v Valuation, origin string) Provenance {
	asOf := v.LastSaleAt
	if asOf == "" {
		asOf = nowRFC3339()
	}
	return Provenance{
		Source:     SourceIndex,
		FetchedAt:  asOf,
		IsOfficial: true,
		Notes: "Renaiss Index API (beta), experimental reference, " + origin +
			". Confidence: " + v.Confidence + ".",
	}
}

func (vc *ValuationCache) persistLocked() {
	b, err := json.MarshalIndent(vc.mem, "", "  ")
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(vc.path), 0o755)
	_ = os.WriteFile(vc.path, b, 0o644)
}

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }
