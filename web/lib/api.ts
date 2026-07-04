import type { Pack, Pool, Provenance, Sourced } from "@shared/types";
import snapshot from "./snapshot.json";

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
      "BUNDLED SNAPSHOT — live engine unreachable, serving offline fallback data. " +
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
