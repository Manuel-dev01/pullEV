import type { Card, Draw, EVResult, Pack, Pool, Provenance, Sourced, Valuation } from "@shared/types";
import snapshot from "./snapshot.json";
import valuationsSeed from "./valuations.seed.json";
import { computeEVFallback } from "./ev";
import { buildCommitment, corruptHexChar } from "./merkle";

// Engine base URL. Local dev default; set ENGINE_URL to the Railway URL in prod.
const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8080";

/** A payload + its provenance + whether we fell back to the bundled snapshot. */
export type Fetched<T> = {
  data: T;
  provenance: Provenance;
  /** True when the live engine was unreachable and we served bundled data. */
  fallback: boolean;
};

/** Provenance stamped on bundled-snapshot responses (engine unreachable). */
function snapshotProvenance(): Provenance {
  return {
    source: "Mock",
    fetchedAt: snapshot.generatedAt,
    isOfficial: false,
    notes:
      "BUNDLED SNAPSHOT, live engine unreachable, serving offline fallback data. " +
      "Same deterministic fixtures; card FMVs and Eden price are ASSUMPTIONs.",
  };
}

async function getSourced<T>(path: string): Promise<Sourced<T> | null> {
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Sourced<T>;
  } catch {
    return null; // network error / engine down -> caller falls back to snapshot
  }
}

export async function getPacks(): Promise<Fetched<Pack[]>> {
  const r = await getSourced<Pack[]>("/api/packs");
  if (r) return { data: r.data, provenance: r.provenance, fallback: false };
  return { data: snapshot.packs as Pack[], provenance: snapshotProvenance(), fallback: true };
}

export async function getPool(packId: string): Promise<Fetched<Pool> | null> {
  const r = await getSourced<Pool>(`/api/packs/${packId}/pool`);
  if (r) return { data: r.data, provenance: r.provenance, fallback: false };
  const snap = (snapshot.pools as Record<string, Pool>)[packId];
  if (!snap) return null; // unknown pack, even in snapshot
  return { data: snap, provenance: snapshotProvenance(), fallback: true };
}

/**
 * Fetch a labeled EXAMPLE Merkle proof (valid or tampered) for a pack. Tries the
 * engine; if it's down, builds the same proof client-side from the bundled snapshot
 * so the verifier demo works fully offline. The proof is always verified in-browser
 * by the /verify page — this fetch only supplies the (labeled) data to check.
 */
export async function getExampleProof(
  packId: string,
  variant: "valid" | "tampered",
): Promise<Fetched<Draw> | null> {
  const r = await getSourced<Draw>(`/api/packs/${packId}/example-proof?variant=${variant}`);
  if (r) return { data: r.data, provenance: r.provenance, fallback: false };

  // Fallback: build the commitment + proof from the snapshot pool, in-process.
  const pool = (snapshot.pools as Record<string, Pool>)[packId];
  if (!pool || pool.cards.length === 0) return null;
  const { proofFor } = await buildCommitment(pool.cards);
  let chase = pool.cards[0];
  for (const e of pool.cards) if (e.card.fmvUsd > chase.card.fmvUsd) chase = e;
  const proof = proofFor(chase.card.id);
  if (!proof) return null;

  let label = "EXAMPLE · not a real Renaiss draw";
  if (variant === "tampered") {
    if (proof.proofPath.length > 0) {
      proof.proofPath[0].hash = corruptHexChar(proof.proofPath[0].hash);
    } else {
      proof.publishedRoot = corruptHexChar(proof.publishedRoot);
    }
    label = "EXAMPLE (tampered) · should FAIL verification";
  }

  const draw: Draw = {
    id: `example-${packId}-${variant}`,
    packId,
    cardId: chase.card.id,
    proof,
    isExample: true,
    label,
  };
  return { data: draw, provenance: snapshotProvenance(), fallback: true };
}

/**
 * Look up a real Renaiss Index valuation by cert. Tries the engine (which itself
 * does live → cache → seed); if the engine is unreachable, falls back to a small
 * bundled seed so the demo's example cert still shows real (cached) data.
 */
export async function lookupCert(cert: string): Promise<Fetched<Valuation> | null> {
  const clean = cert.trim();
  if (!clean) return null;
  const r = await getSourced<Valuation>(`/api/value/cert/${encodeURIComponent(clean)}`);
  if (r) return { data: r.data, provenance: r.provenance, fallback: false };

  const seed = (valuationsSeed as Record<string, Valuation>)[clean];
  if (seed) {
    return {
      data: seed,
      provenance: {
        source: "Index",
        fetchedAt: seed.lastSaleAt,
        isOfficial: true,
        notes: `Renaiss Index API (beta), bundled seed (engine unreachable). Confidence: ${seed.confidence}.`,
      },
      fallback: true,
    };
  }
  return {
    data: { cert: clean, found: false } as Valuation,
    provenance: {
      source: "Index",
      fetchedAt: new Date().toISOString(),
      isOfficial: false,
      notes: "Renaiss Index API (beta): engine unreachable and no cached value.",
    },
    fallback: true,
  };
}

/**
 * Fetch the full real graded-card library ("Vault Index") the packs draw from, each a
 * real Renaiss Index (beta) valuation, sorted by value. Engine down -> derive the same
 * list from the bundled valuation seed so the gallery still renders labeled real data.
 */
export async function getCards(): Promise<Fetched<Card[]>> {
  const r = await getSourced<Card[]>("/api/cards");
  if (r) return { data: r.data, provenance: r.provenance, fallback: false };

  const seed = valuationsSeed as Record<string, Valuation>;
  const cards: Card[] = Object.entries(seed)
    .filter(([, v]) => v.found && v.priceUsd > 0)
    .map(([key, v]) => ({
      id: key,
      name: v.name,
      grade: v.gradeLabel,
      set: v.setName,
      game: v.game,
      fmvUsd: v.priceUsd,
      fmvIsAssumption: false,
      imageUrl: v.imageUrl,
      fmvSource: "Index" as const,
      fmvAsOf: v.lastSaleAt,
      fmvConfidence: v.confidence,
      fmvDeltaPct: v.deltaPct,
    }))
    .sort((a, b) => b.fmvUsd - a.fmvUsd);
  return {
    data: cards,
    provenance: {
      source: "Index",
      fetchedAt: snapshot.generatedAt,
      isOfficial: true,
      notes:
        "Real graded-card library priced by the Renaiss Index API (beta), bundled seed " +
        "(engine unreachable). The packs draw from these cards.",
    },
    fallback: true,
  };
}

export async function getEV(packId: string): Promise<Fetched<EVResult> | null> {
  const r = await getSourced<EVResult>(`/api/packs/${packId}/ev`);
  if (r) return { data: r.data, provenance: r.provenance, fallback: false };
  // Engine down: recompute EV client-side from the bundled snapshot (labeled offline).
  const pool = (snapshot.pools as Record<string, Pool>)[packId];
  const pack = (snapshot.packs as Pack[]).find((p) => p.id === packId);
  if (!pool || !pack) return null;
  const provenance = snapshotProvenance();
  const data = computeEVFallback(packId, pack.priceUsd, pool.cards, pack.priceIsAssumption, provenance);
  return { data, provenance, fallback: true };
}
