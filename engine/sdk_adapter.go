package main

import (
	"context"
	"errors"
)

// ErrSdkUnavailable is returned by every SdkAdapter method: Renaiss has not shipped
// a public SDK yet (roadmap-stage). This stub keeps the seam ready for a drop-in.
var ErrSdkUnavailable = errors.New("Renaiss SDK not yet available")

// SdkAdapter is a stub for the future official Renaiss SDK. Wired now so swapping in
// the real SDK later is a one-line change, with zero impact on the rest of the system.
type SdkAdapter struct{}

func NewSdkAdapter() *SdkAdapter { return &SdkAdapter{} }

func (s *SdkAdapter) Source() SourceKind { return SourceSdk }

func (s *SdkAdapter) ListPacks(context.Context) ([]Pack, Provenance, error) {
	return nil, Provenance{}, ErrSdkUnavailable
}

func (s *SdkAdapter) GetPool(context.Context, string) (Pool, Provenance, error) {
	return Pool{}, Provenance{}, ErrSdkUnavailable
}

func (s *SdkAdapter) GetDraw(context.Context, string) (Draw, Provenance, error) {
	return Draw{}, Provenance{}, ErrSdkUnavailable
}
