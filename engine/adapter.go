package main

import (
	"context"
	"errors"
)

// ErrNotFound is returned when a requested pack/pool/draw does not exist.
var ErrNotFound = errors.New("not found")

// PackDataAdapter is the single contract behind every Renaiss data source.
// No official Renaiss API/SDK exists yet, so the entire data layer sits behind
// this interface with swappable implementations (Mock | Public | Sdk). Each call
// returns Provenance so the UI can always badge a value's origin and freshness.
type PackDataAdapter interface {
	ListPacks(ctx context.Context) ([]Pack, Provenance, error)
	GetPool(ctx context.Context, packID string) (Pool, Provenance, error)
	GetDraw(ctx context.Context, drawID string) (Draw, Provenance, error)
	Source() SourceKind
}
