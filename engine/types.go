package main

// PullEV canonical type contract (Go side).
// Mirror of shared/types.ts — keep the two in lockstep. JSON tags are the wire
// contract; both languages serialize to exactly these keys.

// SourceKind identifies which adapter produced a value.
type SourceKind string

const (
	SourceMock  SourceKind = "Mock"
	SourceIndex SourceKind = "Index" // real Renaiss Index API (beta) — official valuations
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
	Game            string  `json:"game,omitempty"` // "pokemon" | "one-piece" (identification/filtering)
	FMVUsd          float64 `json:"fmvUsd"`
	FMVIsAssumption bool    `json:"fmvIsAssumption"`
	ImageURL        string  `json:"imageUrl,omitempty"`

	// Per-FMV provenance — a card's price may be MOCK (assumed) or Index (real, cached).
	FMVSource     SourceKind `json:"fmvSource"`               // Mock | Index
	FMVAsOf       string     `json:"fmvAsOf,omitempty"`       // RFC3339 freshness of a real valuation
	FMVConfidence string     `json:"fmvConfidence,omitempty"` // high | medium | low (Index only)
	FMVDeltaPct   float64    `json:"fmvDeltaPct,omitempty"`   // trend % (Index only)
}

// Pack is a purchasable Renaiss gacha pack.
type Pack struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	PriceUsd          float64 `json:"priceUsd"`
	PriceIsAssumption bool    `json:"priceIsAssumption"`
	Tagline           string  `json:"tagline"`
	// Kind is "infinite" (perpetual Infinite Gacha) or "limited" (a limited release).
	Kind string `json:"kind,omitempty"`
	// SoldOut marks a limited pack that can no longer be ripped (shown for reference).
	SoldOut bool `json:"soldOut,omitempty"`
	// TopPrizeUsd is the pack's advertised top prize (real Renaiss figure).
	TopPrizeUsd float64 `json:"topPrizeUsd,omitempty"`
	// OnChain carries Renaiss's REAL on-chain pool commitment for a sealed pack (the
	// merkle root published on BNB Chain). Present only for packs Renaiss has committed.
	OnChain *OnChainCommit `json:"onChain,omitempty"`
}

// OnChainCommit is Renaiss's real, verifiable on-chain commitment to a sealed pack's card
// pool: the merkle root published by the Renaiss gacha contract on BNB Chain, readable by
// anyone via getMerkleRoot(packId). This is the genuine artifact PullEV's verifier targets;
// every field is real and independently checkable on BscScan (no PullEV trust required).
type OnChainCommit struct {
	Chain       string `json:"chain"`       // e.g. "BNB Chain"
	Contract    string `json:"contract"`    // Renaiss gacha contract address (0x...)
	PackID      string `json:"packId"`      // bytes32 pack id passed to getMerkleRoot
	MerkleRoot  string `json:"merkleRoot"`  // the committed root read from chain (0x...)
	ExplorerURL string `json:"explorerUrl"` // BscScan readContract link to reproduce it
	ReadAt      string `json:"readAt"`      // RFC3339 when PullEV last read it from chain
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
// The client recomputes leaf = H(leafPreimage), folds proofPath, and compares to
// publishedRoot — trusting its own math, not our claim.
type MerkleProof struct {
	// LeafPreimage is the exact bytes hashed to form the leaf, so the browser can
	// recompute the leaf itself rather than trust a supplied leaf hash.
	LeafPreimage  string      `json:"leafPreimage"`
	Leaf          string      `json:"leaf"` // hex SHA-256 of the (domain-separated) preimage
	ProofPath     []ProofStep `json:"proofPath"`
	PublishedRoot string      `json:"publishedRoot"`
	SchemeNote    string      `json:"schemeNote"`
	// RootNote labels what publishedRoot actually is — honesty about provenance.
	RootNote string `json:"rootNote"`
}

// Draw is a recorded draw with the proof needed to verify it.
type Draw struct {
	ID     string      `json:"id"`
	PackID string      `json:"packId"`
	CardID string      `json:"cardId"`
	Proof  MerkleProof `json:"proof"`
	// IsExample marks demonstration data (not a real Renaiss draw). Label carries
	// the human-readable badge text, e.g. "EXAMPLE · not a real Renaiss draw".
	IsExample bool   `json:"isExample"`
	Label     string `json:"label"`
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
	// Caveats are honest, human-readable limitations inherited from the inputs
	// (e.g. assumed FMVs, unconfirmed price). The UI surfaces these on the verdict.
	Caveats    []string `json:"caveats"`
	ComputedAt string   `json:"computedAt"`
}

// Valuation is a normalized real card valuation from the Renaiss Index API (beta).
type Valuation struct {
	Cert          string    `json:"cert"`
	Found         bool      `json:"found"`
	Name          string    `json:"name"`
	SetName       string    `json:"setName"`
	GradeLabel    string    `json:"gradeLabel"`
	Game          string    `json:"game"`
	PriceUsd      float64   `json:"priceUsd"`   // priceUsdCents / 100
	Confidence    string    `json:"confidence"` // high | medium | low
	DeltaPct      float64   `json:"deltaPct"`   // trend %
	Spark         []float64 `json:"spark"`      // sparkline points (USD)
	LastSaleAt    string    `json:"lastSaleAt"`
	ImageURL      string    `json:"imageUrl,omitempty"`
	RateRemaining int       `json:"rateRemaining"` // X-RateLimit-Remaining, -1 if unknown
}

// Sourced is the standard envelope: a payload plus the provenance governing it.
type Sourced[T any] struct {
	Data       T          `json:"data"`
	Provenance Provenance `json:"provenance"`
}
