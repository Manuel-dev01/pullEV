package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

// gradedJSON is a trimmed real /v1/graded/{cert} response (prices in cents).
const gradedJSON = `{"cert":"PSA1","company":"PSA","found":true,"gradeLabel":"PSA 10",
  "card":{"game":"one-piece","name":"Zoro","setName":"OP01","priceUsdCents":21589,
  "deltaPct":53.88,"confidence":"low","lastSaleAt":"2026-06-28T00:00:00.000Z",
  "spark":[20000,22000],"imageUrlThumb":"http://img/thumb"}}`

func TestLookupCert_ParsesAndConverts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Api-Key") != "" {
			t.Error("no auth header expected without env keys")
		}
		w.Header().Set("X-RateLimit-Remaining", "7")
		fmt.Fprint(w, gradedJSON)
	}))
	defer srv.Close()

	c := &IndexClient{base: srv.URL, http: srv.Client()}
	v, err := c.LookupCert(context.Background(), "PSA1")
	if err != nil {
		t.Fatal(err)
	}
	if !v.Found {
		t.Fatal("expected found")
	}
	if v.PriceUsd != 215.89 {
		t.Errorf("price = %v, want 215.89 (cents→USD)", v.PriceUsd)
	}
	if len(v.Spark) != 2 || v.Spark[0] != 200 || v.Spark[1] != 220 {
		t.Errorf("spark = %v, want [200 220]", v.Spark)
	}
	if v.GradeLabel != "PSA 10" || v.Confidence != "low" || v.DeltaPct != 53.88 {
		t.Errorf("unexpected: %+v", v)
	}
	if v.RateRemaining != 7 {
		t.Errorf("rateRemaining = %d, want 7", v.RateRemaining)
	}
}

func TestLookupCert_AuthHeaderOnlyWhenKeysSet(t *testing.T) {
	var gotKey, gotSecret string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("X-Api-Key")
		gotSecret = r.Header.Get("X-Api-Secret")
		fmt.Fprint(w, gradedJSON)
	}))
	defer srv.Close()

	c := &IndexClient{base: srv.URL, key: "rk_x", secret: "rsk_y", http: srv.Client()}
	if _, err := c.LookupCert(context.Background(), "PSA1"); err != nil {
		t.Fatal(err)
	}
	if gotKey != "rk_x" || gotSecret != "rsk_y" {
		t.Errorf("auth headers = %q/%q, want rk_x/rsk_y", gotKey, gotSecret)
	}
}

func TestLookupCert_RateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()
	c := &IndexClient{base: srv.URL, http: srv.Client()}
	v, err := c.LookupCert(context.Background(), "x")
	if err != ErrRateLimited {
		t.Errorf("err = %v, want ErrRateLimited", err)
	}
	if v.Found {
		t.Error("should not be found on 429")
	}
}

func TestLookupCert_SoftMissOnServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	c := &IndexClient{base: srv.URL, http: srv.Client()}
	v, err := c.LookupCert(context.Background(), "x")
	if err != nil {
		t.Errorf("soft miss should be nil err, got %v", err)
	}
	if v.Found {
		t.Error("should not be found on 500")
	}
}

func TestValuationCache_CachesLiveResult(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		fmt.Fprint(w, gradedJSON)
	}))
	defer srv.Close()
	vc := NewValuationCache(&IndexClient{base: srv.URL, http: srv.Client()})
	vc.path = filepath.Join(t.TempDir(), "v.json")

	v, prov, ok := vc.Get(context.Background(), "PSA1")
	if !ok || v.PriceUsd != 215.89 || prov.Source != SourceIndex {
		t.Fatalf("live get failed: ok=%v v=%+v", ok, v)
	}
	// second call must be served from session memory (no new network hit).
	if _, _, _ = vc.Get(context.Background(), "PSA1"); calls != 1 {
		t.Errorf("expected 1 network call (cached after), got %d", calls)
	}
}

func TestValuationCache_SeedFallbackOnMiss(t *testing.T) {
	// server always errors → Get must fall back to the committed seed.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	vc := NewValuationCache(&IndexClient{base: srv.URL, http: srv.Client()})
	vc.path = filepath.Join(t.TempDir(), "v.json")

	if len(vc.seed) == 0 {
		t.Fatal("committed seed should not be empty")
	}
	var key string
	for k := range vc.seed {
		key = k
		break
	}
	v, prov, ok := vc.Get(context.Background(), key)
	if !ok {
		t.Fatalf("seed fallback should succeed for %q", key)
	}
	if v.PriceUsd <= 0 || v.Name == "" {
		t.Errorf("seed value wrong: %+v", v)
	}
	if prov.Source != SourceIndex || !prov.IsOfficial {
		t.Errorf("seed provenance wrong: %+v", prov)
	}
}

func TestValuationCache_CardMapLoaded(t *testing.T) {
	vc := NewValuationCache(&IndexClient{base: "http://unused", http: http.DefaultClient})
	if len(vc.cardMap) == 0 {
		t.Error("card map should load at least one entry from valuation-map.json")
	}
	if _, ok := vc.CertForCard("_note"); ok {
		t.Error("_note should be filtered from the card map")
	}
	for id := range vc.cardMap {
		if c, ok := vc.CertForCard(id); !ok || c == "" {
			t.Errorf("card %q maps to empty identifier", id)
		}
	}
}
