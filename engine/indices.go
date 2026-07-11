package main

import (
	"context"
	"embed"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

//go:embed fixtures/indices.seed.json
var indicesFS embed.FS

// IndexService serves the real Renaiss market indices (per game) with a short in-memory TTL
// cache and a committed-seed fallback, so the strip always renders real data (even offline).
type IndexService struct {
	mu       sync.RWMutex
	cached   []IndexTile
	cachedAt time.Time
	fromLive bool
	client   *IndexClient
	seed     []IndexTile
	ttl      time.Duration
}

func NewIndexService(client *IndexClient) *IndexService {
	s := &IndexService{client: client, ttl: time.Hour}
	if b, err := indicesFS.ReadFile("fixtures/indices.seed.json"); err == nil {
		_ = json.Unmarshal(b, &s.seed)
	}
	return s
}

// Get returns the market indices with provenance. Order: fresh cache -> live (cached) -> seed.
func (s *IndexService) Get(ctx context.Context) ([]IndexTile, Provenance, bool) {
	s.mu.RLock()
	if len(s.cached) > 0 && time.Since(s.cachedAt) < s.ttl {
		tiles, at, live := s.cached, s.cachedAt, s.fromLive
		s.mu.RUnlock()
		return tiles, indexProv(at, live), true
	}
	s.mu.RUnlock()

	tiles, err := s.client.LookupIndices(ctx)
	if err == nil && len(tiles) > 0 {
		s.mu.Lock()
		s.cached, s.cachedAt, s.fromLive = tiles, time.Now().UTC(), true
		s.mu.Unlock()
		return tiles, indexProv(time.Now().UTC(), true), true
	}
	if len(s.seed) > 0 {
		return s.seed, indexProv(time.Time{}, false), true
	}
	return nil, indexProv(time.Time{}, false), false
}

func indexProv(at time.Time, live bool) Provenance {
	fetchedAt := nowRFC3339()
	note := "Real Renaiss market indices (beta), committed seed (offline fallback)."
	if live {
		fetchedAt = at.Format(time.RFC3339)
		note = "Real Renaiss market indices (beta), live from the Index API. The ecosystem's own price index."
	}
	return Provenance{Source: SourceIndex, FetchedAt: fetchedAt, IsOfficial: true, Notes: note}
}

func handleIndices(w http.ResponseWriter, r *http.Request) {
	tiles, prov, _ := indexService.Get(r.Context())
	writeJSON(w, http.StatusOK, Sourced[[]IndexTile]{Data: tiles, Provenance: prov})
}
