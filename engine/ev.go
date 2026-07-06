package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

// EVInput is everything the EV math needs. Kept separate from Pool/Pack so the
// computation is a pure function of its inputs — no adapters, no IO, no clock.
type EVInput struct {
	PackID            string
	Cost              float64
	Cards             []PoolEntry
	PriceIsAssumption bool
}

// ComputeEV is the trust core: a deterministic, side-effect-free EV verdict.
//
// Model (confirmed): one pull = one card drawn from the pool, p_i = weight_i / Σweight.
//
//	expectedValue  = Σ p_i · fmv_i
//	evToCostRatio  = expectedValue / cost
//	distribution   = inverse-CDF percentiles of the single-card outcome distribution
//	chanceOfProfit = Σ p_i where fmv_i ≥ cost
//
// `now` is injected (not read from the clock) so callers control ComputedAt; it is
// deliberately excluded from InputsHash so identical inputs always hash identically.
func ComputeEV(in EVInput, sources []Provenance, now time.Time) EVResult {
	res := EVResult{
		PackID:     in.PackID,
		Sources:    sources,
		InputsHash: computeInputsHash(in),
		Caveats:    deriveCaveats(in),
		ComputedAt: now.UTC().Format(time.RFC3339),
	}

	totalWeight := 0.0
	for _, e := range in.Cards {
		if e.Weight > 0 {
			totalWeight += e.Weight
		}
	}
	if totalWeight <= 0 {
		res.Caveats = append(res.Caveats,
			"Pool has no positively-weighted cards; EV is undefined and shown as 0.")
		return res
	}

	// Per-card outcomes: value = FMV, prob = weight / total.
	type outcome struct{ v, p float64 }
	outcomes := make([]outcome, 0, len(in.Cards))
	ev, profitProb := 0.0, 0.0
	for _, e := range in.Cards {
		if e.Weight <= 0 {
			continue
		}
		p := e.Weight / totalWeight
		ev += p * e.Card.FMVUsd
		if e.Card.FMVUsd >= in.Cost {
			profitProb += p
		}
		outcomes = append(outcomes, outcome{v: e.Card.FMVUsd, p: p})
	}

	res.ExpectedValue = ev
	res.ChanceOfProfit = clamp01(profitProb)
	if in.Cost > 0 {
		res.EVToCostRatio = ev / in.Cost
	}

	// Distribution: sort outcomes by value ascending, cumulate probability, take quantiles.
	sort.Slice(outcomes, func(i, j int) bool { return outcomes[i].v < outcomes[j].v })
	values := make([]float64, len(outcomes))
	cdf := make([]float64, len(outcomes))
	cum := 0.0
	for i, o := range outcomes {
		cum += o.p
		values[i] = o.v
		cdf[i] = cum
	}
	res.Distribution = Distribution{
		P10:    quantile(values, cdf, 0.10),
		Median: quantile(values, cdf, 0.50),
		P90:    quantile(values, cdf, 0.90),
	}
	return res
}

// quantile returns the smallest outcome value whose cumulative probability ≥ q
// (the inverse CDF of a discrete distribution). values/cdf must be sorted ascending.
func quantile(values, cdf []float64, q float64) float64 {
	for i := range values {
		if cdf[i] >= q {
			return values[i]
		}
	}
	if len(values) == 0 {
		return 0
	}
	return values[len(values)-1] // float rounding fallback: return the max value
}

// computeInputsHash hashes the canonical, order-independent inputs. Cards are sorted
// by id so pool ordering never changes the hash. ComputedAt is intentionally excluded.
func computeInputsHash(in EVInput) string {
	type card struct {
		ID     string  `json:"id"`
		FMV    float64 `json:"fmv"`
		Weight float64 `json:"weight"`
	}
	cards := make([]card, 0, len(in.Cards))
	for _, e := range in.Cards {
		cards = append(cards, card{e.Card.ID, e.Card.FMVUsd, e.Weight})
	}
	sort.Slice(cards, func(i, j int) bool { return cards[i].ID < cards[j].ID })

	payload := struct {
		PackID string  `json:"packId"`
		Cost   float64 `json:"cost"`
		Cards  []card  `json:"cards"`
	}{in.PackID, in.Cost, cards}

	b, _ := json.Marshal(payload)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// deriveCaveats surfaces honest limitations inherited from the inputs. The result
// always ends with the model + not-financial-advice note.
func deriveCaveats(in EVInput) []string {
	caveats := []string{}
	assumed, realIndex := 0, 0
	for _, e := range in.Cards {
		if e.Card.FMVIsAssumption {
			assumed++
		}
		if e.Card.FMVSource == SourceIndex {
			realIndex++
		}
	}
	switch {
	case len(in.Cards) > 0 && assumed == len(in.Cards):
		caveats = append(caveats,
			"All card FMVs are assumptions grounded in PSA-10 ranges, not live oracle reads.")
	case assumed > 0:
		caveats = append(caveats,
			fmt.Sprintf("%d of %d card FMVs are assumptions, not live oracle reads.", assumed, len(in.Cards)))
	}
	if realIndex > 0 {
		caveats = append(caveats,
			fmt.Sprintf("%d card FMV(s) are real Renaiss Index valuations (beta, cached).", realIndex))
	}
	if in.PriceIsAssumption {
		caveats = append(caveats, "Pack price is unconfirmed and pending live verification.")
	}
	caveats = append(caveats, "Model assumes one card drawn per pack. Informational only — not financial advice.")
	return caveats
}

func clamp01(x float64) float64 {
	if x < 0 {
		return 0
	}
	if x > 1 {
		return 1
	}
	return x
}
