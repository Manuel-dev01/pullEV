package main

import (
	"context"
	"errors"
)

// ErrNotFound is returned when a requested pack/pool/draw does not exist.
var ErrNotFound = errors.New("not found")

// PackDataAdapter is the single contract behind the Renaiss data source. No official
// Renaiss pack/pool API exists, so the data layer sits behind this interface; today the
// only implementation is MockAdapter (embedded fixtures), with per-card prices overlaid
// live from the real Renaiss Index (beta). Each call returns Provenance so the UI can
// always badge a value's origin and freshness.
type PackDataAdapter interface {
	ListPacks(ctx context.Context) ([]Pack, Provenance, error)
	GetPool(ctx context.Context, packID string) (Pool, Provenance, error)
	Source() SourceKind
}
