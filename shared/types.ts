// PullEV canonical type contract (TypeScript side).
// Mirror of engine/types.go — keep the two in lockstep. JSON field names are the
// wire contract; both languages serialize to exactly these keys.
//
// Rule: every number the UI renders must be reachable to a Provenance. No value is
// ever shown without its source, freshness, and official/unofficial status.

/** Which data source produced a value. Index = real Renaiss Index API (beta). */
export type SourceKind = "Mock" | "Index";

/** Travels with every datapoint so the UI can badge its origin and freshness. */
export interface Provenance {
  /** Mock | Index */
  source: SourceKind;
  /** RFC3339 timestamp of when this data was fetched/produced. */
  fetchedAt: string;
  /** True only for confirmed-official Renaiss data. Mock/scraped => false. */
  isOfficial: boolean;
  /** Human-readable caveats, e.g. "card FMVs are ASSUMPTION, PSA-10 range". */
  notes: string;
}

/** A single graded card in a pack's pool. */
export interface Card {
  id: string;
  /** Display name, for identification only (IP belongs to its owner). */
  name: string;
  /** Grading label, e.g. "PSA 10", "BGS Black Label 10". */
  grade: string;
  /** Set / series, e.g. "Base Set", "Scarlet & Violet 151". */
  set: string;
  /** Fair market value in USD from the FMV/CMV oracle (or assumed — see provenance). */
  fmvUsd: number;
  /** True when fmvUsd is a placeholder assumption, not a sourced oracle value. */
  fmvIsAssumption: boolean;
  /** Optional image URL for identification. */
  imageUrl?: string;

  /** Per-FMV provenance: "Mock" (assumed) or "Index" (real, cached). Absent ⇒ treat as Mock. */
  fmvSource?: SourceKind;
  /** RFC3339 freshness of a real valuation (Index only). */
  fmvAsOf?: string;
  /** Confidence of a real valuation: high | medium | low (Index only). */
  fmvConfidence?: string;
  /** Trend % of a real valuation (Index only). */
  fmvDeltaPct?: number;
}

/** A purchasable Renaiss gacha pack. */
export interface Pack {
  id: string;
  name: string;
  /** Pack cost in USD. */
  priceUsd: number;
  /** True when priceUsd is unconfirmed/assumed. */
  priceIsAssumption: boolean;
  /** One-line description. */
  tagline: string;
  /** "infinite" (perpetual Infinite Gacha) or "limited" (a limited release). */
  kind?: "infinite" | "limited";
  /** True for a limited pack that can no longer be ripped (shown for reference). */
  soldOut?: boolean;
  /** The pack's advertised top prize in USD (real Renaiss figure). */
  topPrizeUsd?: number;
}

/** The set of cards currently in a pack's pool, each with a draw weight. */
export interface Pool {
  packId: string;
  cards: PoolEntry[];
}

/** A card in a pool plus its relative draw probability weight. */
export interface PoolEntry {
  card: Card;
  /** Relative weight; probability = weight / sum(weights). */
  weight: number;
}

/** A recorded draw with the Merkle inclusion proof needed to verify it client-side. */
export interface Draw {
  id: string;
  packId: string;
  /** ID of the card that was drawn. */
  cardId: string;
  proof: MerkleProof;
  /** True for demonstration data (not a real Renaiss draw). */
  isExample: boolean;
  /** Human-readable badge, e.g. "EXAMPLE · not a real Renaiss draw". */
  label: string;
}

/** Inputs for independent, client-side Merkle inclusion recomputation (Slice 2). */
export interface MerkleProof {
  /** Exact bytes hashed to form the leaf, so the browser recomputes the leaf itself. */
  leafPreimage: string;
  /** Hex SHA-256 of the (domain-separated) preimage. */
  leaf: string;
  /** Sibling hashes from leaf to root, in order. */
  proofPath: ProofStep[];
  /** The published root the proof recomputes to. See rootNote for what it represents. */
  publishedRoot: string;
  /** Which hash + leaf-encoding scheme this proof assumes. Labeled until confirmed. */
  schemeNote: string;
  /** Labels what publishedRoot actually is (e.g. PullEV-computed over a MOCK pool). */
  rootNote: string;
}

export interface ProofStep {
  /** Sibling hash (hex). */
  hash: string;
  /** Whether the sibling is on the left ("L") or right ("R") of the current node. */
  position: "L" | "R";
}

/** EV verdict for a pack (Slice 1 fills this; defined now so the contract is stable). */
export interface EVResult {
  packId: string;
  expectedValue: number;
  evToCostRatio: number;
  distribution: { p10: number; median: number; p90: number };
  chanceOfProfit: number;
  /** Hash of all inputs — same inputs must reproduce the same result. */
  inputsHash: string;
  /** Provenance of every input that fed the computation. */
  sources: Provenance[];
  /** Honest limitations inherited from inputs (assumed FMVs, unconfirmed price). */
  caveats: string[];
  computedAt: string;
}

/** A normalized real card valuation from the Renaiss Index API (beta). */
export interface Valuation {
  cert: string;
  found: boolean;
  name: string;
  setName: string;
  gradeLabel: string;
  game: string;
  /** priceUsdCents / 100 */
  priceUsd: number;
  /** high | medium | low */
  confidence: string;
  /** trend % */
  deltaPct: number;
  /** sparkline points (USD); null when the source has no recent-sale series */
  spark: number[] | null;
  lastSaleAt: string;
  imageUrl?: string;
  /** X-RateLimit-Remaining, -1 if unknown */
  rateRemaining: number;
}

/** Standard envelope: a payload plus the provenance that governs it. */
export interface Sourced<T> {
  data: T;
  provenance: Provenance;
}
