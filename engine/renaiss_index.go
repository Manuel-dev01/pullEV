package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultIndexBase = "https://api.renaissos.com"

// ErrRateLimited signals the public/partner quota is exhausted (HTTP 429).
var ErrRateLimited = errors.New("renaiss index rate limited")

// IndexClient is a thin client for the real Renaiss Index API (beta). Auth is
// OPTIONAL: keys are read from env and only sent if present (public tier otherwise).
// Secrets are never logged.
type IndexClient struct {
	base   string
	key    string
	secret string
	http   *http.Client
}

func NewIndexClient() *IndexClient {
	return &IndexClient{
		base:   envOr("RENAISS_INDEX_URL", defaultIndexBase),
		key:    os.Getenv("RENAISS_API_KEY"),
		secret: os.Getenv("RENAISS_API_SECRET"),
		http:   &http.Client{Timeout: 8 * time.Second},
	}
}

func (c *IndexClient) authed() bool { return c.key != "" && c.secret != "" }

// gradedResponse mirrors the real GET /v1/graded/{cert} JSON (the subset we use).
type gradedResponse struct {
	Cert       string `json:"cert"`
	Company    string `json:"company"`
	Found      bool   `json:"found"`
	GradeLabel string `json:"gradeLabel"`
	Card       struct {
		Game          string    `json:"game"`
		Name          string    `json:"name"`
		SetName       string    `json:"setName"`
		PriceUsdCents int       `json:"priceUsdCents"`
		DeltaPct      float64   `json:"deltaPct"`
		Confidence    string    `json:"confidence"`
		LastSaleAt    string    `json:"lastSaleAt"`
		Spark         []float64 `json:"spark"`
		ImageURLThumb string    `json:"imageUrlThumb"`
	} `json:"card"`
	Reason string `json:"reason"`
}

// LookupCert fetches a real valuation for a certification number. On any miss
// (non-200, decode error) it returns a Valuation with Found=false and a nil error
// so callers fall back to cache/seed/mock. A 429 returns ErrRateLimited.
func (c *IndexClient) LookupCert(ctx context.Context, cert string) (Valuation, error) {
	cert = strings.TrimSpace(cert)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/v1/graded/"+cert, nil)
	if err != nil {
		return Valuation{Cert: cert, RateRemaining: -1}, err
	}
	if c.authed() {
		req.Header.Set("X-Api-Key", c.key)
		req.Header.Set("X-Api-Secret", c.secret)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return Valuation{Cert: cert, RateRemaining: -1}, err
	}
	defer resp.Body.Close()

	rate := parseRate(resp.Header.Get("X-RateLimit-Remaining"))
	switch {
	case resp.StatusCode == http.StatusTooManyRequests:
		return Valuation{Cert: cert, Found: false, RateRemaining: rate}, ErrRateLimited
	case resp.StatusCode != http.StatusOK:
		return Valuation{Cert: cert, Found: false, RateRemaining: rate}, nil // soft miss
	}

	var g gradedResponse
	if err := json.NewDecoder(resp.Body).Decode(&g); err != nil {
		return Valuation{Cert: cert, Found: false, RateRemaining: rate}, err
	}
	return normalizeGraded(g, rate), nil
}

func normalizeGraded(g gradedResponse, rate int) Valuation {
	spark := make([]float64, len(g.Card.Spark))
	for i, v := range g.Card.Spark {
		spark[i] = v / 100 // cents → USD
	}
	return Valuation{
		Cert:          g.Cert,
		Found:         g.Found,
		Name:          g.Card.Name,
		SetName:       g.Card.SetName,
		GradeLabel:    g.GradeLabel,
		Game:          g.Card.Game,
		PriceUsd:      float64(g.Card.PriceUsdCents) / 100,
		Confidence:    g.Card.Confidence,
		DeltaPct:      g.Card.DeltaPct,
		Spark:         spark,
		LastSaleAt:    g.Card.LastSaleAt,
		ImageURL:      g.Card.ImageURLThumb,
		RateRemaining: rate,
	}
}

func parseRate(h string) int {
	if h == "" {
		return -1
	}
	n, err := strconv.Atoi(strings.TrimSpace(h))
	if err != nil {
		return -1
	}
	return n
}
