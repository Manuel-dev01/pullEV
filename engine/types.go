package main

// PullEV canonical type contract (Go side).
// Mirror of shared/types.ts — keep the two in lockstep. JSON tags are the wire
// contract; both languages serialize to exactly these keys.

// SourceKind identifies which adapter produced a value.
type SourceKind string

const (
	SourceMock   SourceKind = "Mock"
	SourcePublic SourceKind = "Public"
	SourceSdk    SourceKind = "Sdk"
)

// Provenance travels with every datapoint so the UI can badge origin and freshness.
type Provenance struct {
	Source     SourceKind `json:"source"`
	FetchedAt  string     `json:"fetchedAt"`  // RFC3339
	IsOfficial bool       `json:"isOfficial"` // true only for confirmed-official data
	Notes      string     `json:"notes"`
}

// Card is a single graded card in a pack's pool.
type Card struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`  // identification only; IP belongs to owner
	Grade           string  `json:"grade"` // e.g. "PSA 10", "BGS Black Label 10"
	Set             string  `json:"set"`
	FMVUsd          float64 `json:"fmvUsd"`
	FMVIsAssumption bool    `json:"fmvIsAssumption"`
	ImageURL        string  `json:"imageUrl,omitempty"`
}

// Pack is a purchasable Infinite Gacha pack.
type Pack struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	PriceUsd          float64 `json:"priceUsd"`
	PriceIsAssumption bool    `json:"priceIsAssumption"`
	Tagline           string  `json:"tagline"`
}

// PoolEntry is a card in a pool plus its relative draw weight.
type PoolEntry struct {
	Card   Card    `json:"card"`
	Weight float64 `json:"weight"` // probability = weight / sum(weights)
}

// Pool is the set of cards currently in a pack's pool.
type Pool struct {
	PackID string      `json:"packId"`
	Cards  []PoolEntry `json:"cards"`
}

// ProofStep is one sibling hash in a Merkle inclusion path.
type ProofStep struct {
	Hash     string `json:"hash"`
	Position string `json:"position"` // "L" or "R"
}

// MerkleProof carries the inputs for client-side inclusion recomputation (Slice 2).
type MerkleProof struct {
	Leaf          string      `json:"leaf"`
	ProofPath     []ProofStep `json:"proofPath"`
	PublishedRoot string      `json:"publishedRoot"`
	SchemeNote    string      `json:"schemeNote"`
}

// Draw is a recorded draw with the proof needed to verify it.
type Draw struct {
	ID     string      `json:"id"`
	PackID string      `json:"packId"`
	CardID string      `json:"cardId"`
	Proof  MerkleProof `json:"proof"`
}

// Distribution holds percentile outcomes of a pull's value.
type Distribution struct {
	P10    float64 `json:"p10"`
	Median float64 `json:"median"`
	P90    float64 `json:"p90"`
}

// EVResult is the EV verdict for a pack (filled in Slice 1; defined now to stabilize the contract).
type EVResult struct {
	PackID         string       `json:"packId"`
	ExpectedValue  float64      `json:"expectedValue"`
	EVToCostRatio  float64      `json:"evToCostRatio"`
	Distribution   Distribution `json:"distribution"`
	ChanceOfProfit float64      `json:"chanceOfProfit"`
	InputsHash     string       `json:"inputsHash"`
	Sources        []Provenance `json:"sources"`
	ComputedAt     string       `json:"computedAt"`
}

// Sourced is the standard envelope: a payload plus the provenance governing it.
type Sourced[T any] struct {
	Data       T          `json:"data"`
	Provenance Provenance `json:"provenance"`
}
