package main

import (
	"context"
	"testing"
)

// newTestManager builds a manager over the embedded seed with a cancelled context so
// Refresh skips live pricing (uses committed seed prices) and only exercises the pure
// rotation + rebalance + EV-guard path.
func newTestManager(t *testing.T) *LivePoolManager {
	t.Helper()
	client := NewIndexClient()
	cache := NewValuationCache(client)
	lp := NewLivePoolManager(client, cache)
	if len(lp.packs) == 0 {
		t.Fatal("no packs loaded from embedded fixtures")
	}
	return lp
}

func cancelledCtx() context.Context {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx
}

func TestLivePoolRefreshBuildsPlausiblePools(t *testing.T) {
	lp := newTestManager(t)
	lp.Refresh(cancelledCtx())

	for _, id := range livePackOrder {
		pool, ts, ok := lp.Get(id)
		if !ok {
			t.Logf("pack %s not live this cycle (guard/depth) — fixture serves; ok", id)
			continue
		}
		if ts.IsZero() {
			t.Errorf("%s: live pool has zero timestamp", id)
		}
		if len(pool.Cards) < 5 {
			t.Errorf("%s: rotated pool has too few cards (%d)", id, len(pool.Cards))
		}
		// Every stored pool must pass the plausibility band (guard invariant).
		if !lp.plausible(id, pool) {
			t.Errorf("%s: stored pool is implausible — guard should have rejected it", id)
		}
		// Chase cards must carry real Index prices; commons are labeled assumptions.
		var live, assumed int
		for _, e := range pool.Cards {
			if e.Card.FMVSource == SourceIndex && !e.Card.FMVIsAssumption {
				live++
			}
			if e.Card.FMVIsAssumption {
				assumed++
			}
		}
		if live == 0 {
			t.Errorf("%s: expected some LIVE Index-priced chase cards, got none", id)
		}
	}
}

func TestLivePoolRotates(t *testing.T) {
	lp := newTestManager(t)
	// A pack with real library depth (pokemon → omega) should change membership as the
	// cycle advances; thin one-piece packs may not, which is acceptable.
	names := func() map[string]bool {
		pool, ok := lp.pools["omega"], false
		_, _, ok = lp.Get("omega")
		set := map[string]bool{}
		if ok {
			for _, e := range pool.Cards {
				set[e.Card.Name] = true
			}
		}
		return set
	}

	lp.Refresh(cancelledCtx())
	first := names()
	// Advance several cycles; expect the membership set to differ at least once.
	changed := false
	for i := 0; i < 6; i++ {
		lp.Refresh(cancelledCtx())
		next := names()
		if !sameSet(first, next) {
			changed = true
			break
		}
	}
	if len(first) > 0 && !changed {
		t.Error("omega membership never rotated across cycles")
	}
}

func sameSet(a, b map[string]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if !b[k] {
			return false
		}
	}
	return true
}
