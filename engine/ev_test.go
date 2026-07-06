package main

import (
	"math"
	"strings"
	"testing"
	"time"
)

var fixedNow = time.Date(2026, 7, 4, 0, 0, 0, 0, time.UTC)

// card is a tiny helper to build pool entries in tests.
func entry(id string, fmv, weight float64, assumed bool) PoolEntry {
	return PoolEntry{
		Card:   Card{ID: id, FMVUsd: fmv, FMVIsAssumption: assumed},
		Weight: weight,
	}
}

func approx(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func TestComputeEV_KnownPools(t *testing.T) {
	tests := []struct {
		name       string
		in         EVInput
		wantEV     float64
		wantRatio  float64
		wantProfit float64
		wantP10    float64
		wantMedian float64
		wantP90    float64
	}{
		{
			name: "two-card 25/75 split",
			in: EVInput{
				PackID: "t1", Cost: 50,
				Cards: []PoolEntry{entry("a", 10, 1, false), entry("b", 100, 3, false)},
			},
			// p_a=.25 p_b=.75 ; EV=.25*10+.75*100=77.5 ; ratio=1.55 ; profit=P(fmv>=50)=.75
			wantEV: 77.5, wantRatio: 1.55, wantProfit: 0.75,
			wantP10: 10, wantMedian: 100, wantP90: 100,
		},
		{
			name: "three-card equal weights",
			in: EVInput{
				PackID: "t2", Cost: 40,
				Cards: []PoolEntry{entry("a", 10, 1, false), entry("b", 50, 1, false), entry("c", 90, 1, false)},
			},
			// each p=1/3 ; EV=50 ; ratio=1.25 ; profit=P(fmv>=40)=2/3
			wantEV: 50, wantRatio: 1.25, wantProfit: 2.0 / 3.0,
			wantP10: 10, wantMedian: 50, wantP90: 90,
		},
		{
			name: "negative EV pack (house edge)",
			in: EVInput{
				PackID: "t3", Cost: 100,
				Cards: []PoolEntry{entry("common", 5, 8, false), entry("chase", 400, 2, false)},
			},
			// p_common=.8 p_chase=.2 ; EV=.8*5+.2*400=4+80=84 ; ratio=.84 ; profit=P(fmv>=100)=.2
			// CDF: 5→.8, 400→1.0 ; p10/median land on 5, p90 (cdf≥.9) lands on 400.
			wantEV: 84, wantRatio: 0.84, wantProfit: 0.2,
			wantP10: 5, wantMedian: 5, wantP90: 400,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := ComputeEV(tt.in, nil, fixedNow)
			if !approx(r.ExpectedValue, tt.wantEV) {
				t.Errorf("EV = %v, want %v", r.ExpectedValue, tt.wantEV)
			}
			if !approx(r.EVToCostRatio, tt.wantRatio) {
				t.Errorf("ratio = %v, want %v", r.EVToCostRatio, tt.wantRatio)
			}
			if !approx(r.ChanceOfProfit, tt.wantProfit) {
				t.Errorf("chanceOfProfit = %v, want %v", r.ChanceOfProfit, tt.wantProfit)
			}
			if !approx(r.Distribution.P10, tt.wantP10) ||
				!approx(r.Distribution.Median, tt.wantMedian) ||
				!approx(r.Distribution.P90, tt.wantP90) {
				t.Errorf("dist = %+v, want p10=%v median=%v p90=%v",
					r.Distribution, tt.wantP10, tt.wantMedian, tt.wantP90)
			}
			if r.ComputedAt != "2026-07-04T00:00:00Z" {
				t.Errorf("ComputedAt = %q", r.ComputedAt)
			}
		})
	}
}

func TestComputeEV_InputsHashDeterministicAndOrderIndependent(t *testing.T) {
	base := EVInput{
		PackID: "p", Cost: 48,
		Cards: []PoolEntry{entry("a", 10, 2, false), entry("b", 100, 1, false), entry("c", 55, 3, false)},
	}
	// Same inputs, computed at DIFFERENT times → identical hash (hash excludes clock).
	h1 := ComputeEV(base, nil, fixedNow).InputsHash
	h2 := ComputeEV(base, nil, fixedNow.Add(48*time.Hour)).InputsHash
	if h1 != h2 {
		t.Fatalf("hash changed with time: %s vs %s", h1, h2)
	}

	// Reordered pool → same hash.
	reordered := EVInput{
		PackID: "p", Cost: 48,
		Cards: []PoolEntry{entry("c", 55, 3, false), entry("b", 100, 1, false), entry("a", 10, 2, false)},
	}
	if h3 := ComputeEV(reordered, nil, fixedNow).InputsHash; h3 != h1 {
		t.Fatalf("hash not order-independent: %s vs %s", h3, h1)
	}

	// Changed FMV → different hash.
	changed := base
	changed.Cards = []PoolEntry{entry("a", 11, 2, false), entry("b", 100, 1, false), entry("c", 55, 3, false)}
	if h4 := ComputeEV(changed, nil, fixedNow).InputsHash; h4 == h1 {
		t.Fatalf("hash unchanged after FMV change")
	}
}

func TestComputeEV_Caveats(t *testing.T) {
	allAssumed := EVInput{
		PackID: "p", Cost: 48, PriceIsAssumption: true,
		Cards: []PoolEntry{entry("a", 10, 1, true), entry("b", 100, 1, true)},
	}
	c := ComputeEV(allAssumed, nil, fixedNow).Caveats
	joined := ""
	for _, s := range c {
		joined += s + "\n"
	}
	for _, want := range []string{"All card FMVs are assumptions", "price is unconfirmed", "financial advice"} {
		if !strings.Contains(joined, want) {
			t.Errorf("caveats missing %q; got:\n%s", want, joined)
		}
	}
}

func TestComputeEV_EmptyAndZeroWeightPools(t *testing.T) {
	empty := ComputeEV(EVInput{PackID: "e", Cost: 10}, nil, fixedNow)
	if empty.ExpectedValue != 0 || empty.EVToCostRatio != 0 || empty.ChanceOfProfit != 0 {
		t.Errorf("empty pool should be all-zero, got %+v", empty)
	}
	zeroW := ComputeEV(EVInput{
		PackID: "z", Cost: 10,
		Cards: []PoolEntry{entry("a", 10, 0, false), entry("b", 20, 0, false)},
	}, nil, fixedNow)
	if zeroW.ExpectedValue != 0 {
		t.Errorf("zero-weight pool should be EV 0, got %v", zeroW.ExpectedValue)
	}
}

// FuzzEV asserts the invariants that must hold for ANY pool, no matter the inputs.
func FuzzEV(f *testing.F) {
	f.Add(10.0, 1.0, 100.0, 3.0, 55.0, 2.0, 48.0)
	f.Add(5.0, 9.0, 400.0, 1.0, 0.0, 0.0, 100.0)
	f.Add(-3.0, -1.0, 1e9, 2.0, 42.0, 0.0, 0.0)

	clean := func(x float64) float64 {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return 0
		}
		return x
	}

	f.Fuzz(func(t *testing.T, fmv1, w1, fmv2, w2, fmv3, w3, cost float64) {
		fmv1, w1, fmv2, w2, fmv3, w3, cost =
			clean(fmv1), clean(w1), clean(fmv2), clean(w2), clean(fmv3), clean(w3), clean(cost)

		in := EVInput{
			PackID: "fuzz", Cost: cost,
			Cards: []PoolEntry{
				entry("a", fmv1, w1, false),
				entry("b", fmv2, w2, false),
				entry("c", fmv3, w3, false),
			},
		}
		r := ComputeEV(in, nil, fixedNow) // must never panic

		// Only cards with positive weight participate — compute expected bounds over those.
		minF, maxF := math.Inf(1), math.Inf(-1)
		any := false
		for _, e := range in.Cards {
			if e.Weight > 0 {
				any = true
				minF = math.Min(minF, e.Card.FMVUsd)
				maxF = math.Max(maxF, e.Card.FMVUsd)
			}
		}

		if r.ChanceOfProfit < 0 || r.ChanceOfProfit > 1 {
			t.Fatalf("chanceOfProfit out of [0,1]: %v", r.ChanceOfProfit)
		}
		if r.Distribution.P10 > r.Distribution.Median || r.Distribution.Median > r.Distribution.P90 {
			t.Fatalf("distribution not monotonic: %+v", r.Distribution)
		}
		if !any {
			return // no positively-weighted cards: EV defined as 0
		}
		const eps = 1e-6
		if r.ExpectedValue < minF-eps || r.ExpectedValue > maxF+eps {
			t.Fatalf("EV %v outside [%v,%v]", r.ExpectedValue, minF, maxF)
		}
		if r.InputsHash == "" {
			t.Fatalf("empty inputs hash")
		}
	})
}
