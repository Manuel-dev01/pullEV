package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
)

// dataAsOf is the authored date of the deterministic fixtures. MockAdapter reports
// this as fetchedAt — honest, because mock data was authored then, not "fetched now".
const dataAsOf = "2026-06-25T00:00:00Z"

const mockNotes = "Deterministic offline fixtures. Pack prices verified where noted " +
	"(Omega $48, Renacrypt $88); Eden price is an ASSUMPTION pending live re-confirmation. " +
	"All per-card FMVs are ASSUMPTIONs grounded in PSA-10 market ranges, not live oracle reads."

//go:embed fixtures/packs.json fixtures/pools/*.json fixtures/draws/*.json
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
	return packs, m.provenance(), nil
}

func (m *MockAdapter) GetPool(_ context.Context, packID string) (Pool, Provenance, error) {
	var pool Pool
	path := fmt.Sprintf("fixtures/pools/%s.json", packID)
	if err := readFixture(path, &pool); err != nil {
		return Pool{}, Provenance{}, ErrNotFound
	}
	return pool, m.provenance(), nil
}

func (m *MockAdapter) GetDraw(_ context.Context, drawID string) (Draw, Provenance, error) {
	var draw Draw
	path := fmt.Sprintf("fixtures/draws/%s.json", drawID)
	if err := readFixture(path, &draw); err != nil {
		return Draw{}, Provenance{}, ErrNotFound
	}
	return draw, m.provenance(), nil
}

func readFixture(path string, v any) error {
	b, err := fixtureFS.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
