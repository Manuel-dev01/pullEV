import type { EVResult, PoolEntry, Provenance } from "@shared/types";

// Client-side mirror of engine/ev.go's ComputeEV, used ONLY as the offline fallback
// when the Go engine is unreachable. Same one-card-per-pull model. It intentionally
// does NOT reproduce the sha256 inputsHash (that reproducibility guarantee lives in the
// tested Go engine) — the fallback marks the result as offline so it's never mistaken
// for the authoritative computation.
export function computeEVFallback(
  packId: string,
  cost: number,
  cards: PoolEntry[],
  priceIsAssumption: boolean,
  provenance: Provenance,
): EVResult {
  const total = cards.reduce((s, e) => (e.weight > 0 ? s + e.weight : s), 0);

  const caveats: string[] = [];
  const assumed = cards.filter((e) => e.card.fmvIsAssumption).length;
  if (cards.length > 0 && assumed === cards.length) {
    caveats.push("All card FMVs are assumptions grounded in PSA-10 ranges, not live oracle reads.");
  } else if (assumed > 0) {
    caveats.push(`${assumed} of ${cards.length} card FMVs are assumptions, not live oracle reads.`);
  }
  if (priceIsAssumption) caveats.push("Pack price is unconfirmed and pending live verification.");
  caveats.push("Card prices are real (Renaiss Index); the pool membership and draw odds are a PullEV model, so this is an EV for a modeled pool, not Renaiss's actual pack. Renaiss exposes no pool/odds API.");
  caveats.push("Model assumes one card drawn per pack. Informational only. Not financial advice.");
  caveats.push("Computed offline from the bundled snapshot (engine unreachable).");

  const base: EVResult = {
    packId,
    expectedValue: 0,
    evToCostRatio: 0,
    distribution: { p10: 0, median: 0, p90: 0 },
    chanceOfProfit: 0,
    inputsHash: "offline-fallback",
    sources: [provenance],
    caveats,
    computedAt: new Date().toISOString(),
  };
  if (total <= 0) return base;

  let ev = 0;
  let profit = 0;
  const outcomes: { v: number; p: number }[] = [];
  for (const e of cards) {
    if (e.weight <= 0) continue;
    const p = e.weight / total;
    ev += p * e.card.fmvUsd;
    if (e.card.fmvUsd >= cost) profit += p;
    outcomes.push({ v: e.card.fmvUsd, p });
  }

  outcomes.sort((a, b) => a.v - b.v);
  const values: number[] = [];
  const cdf: number[] = [];
  let cum = 0;
  for (const o of outcomes) {
    cum += o.p;
    values.push(o.v);
    cdf.push(cum);
  }
  const quantile = (q: number) => {
    for (let i = 0; i < values.length; i++) if (cdf[i] >= q) return values[i];
    return values.length ? values[values.length - 1] : 0;
  };

  return {
    ...base,
    expectedValue: ev,
    evToCostRatio: cost > 0 ? ev / cost : 0,
    chanceOfProfit: Math.min(1, Math.max(0, profit)),
    distribution: { p10: quantile(0.1), median: quantile(0.5), p90: quantile(0.9) },
  };
}
