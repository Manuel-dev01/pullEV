import type { Card, Pool } from "@shared/types";

// Renaiss publishes a per-pack "What is loaded" tiered structure, but the tier NAMES and
// counts vary by pack (e.g. OMEGA uses Tier S/A/B/C, Eden uses Crown/Bloom/Thorn), and the
// exact per-tier chances aren't all public. So PullEV does NOT claim a single Renaiss tier
// scheme. Instead we model three honest draw bands over the real card prices — a rare Chase
// band (~1%), a Mid band (~33%), and a Common band (~66%) — and label them as OUR model.
// The one grounding that IS real and public: Renaiss's rarest tier is <1% (e.g. OMEGA Tier
// S), which our ~1% Chase band mirrors.
//
// Each card's draw weight encodes its band (every card in a band shares a weight, and a
// band's weights sum to its chance), so we recover the bands straight from the pool the UI
// already has, no extra API field.

export type TierRow = {
  name: "Chase" | "Mid" | "Common";
  chance: number; // computed draw probability for the whole band (0..1)
  count: number;
  min: number;
  max: number;
  examples: Card[]; // top cards by value, for display
  hue: string;
  blurb: string;
};

const META: Record<TierRow["name"], { target: number; hue: string; blurb: string }> = {
  Chase: { target: 0.01, hue: "#ff5fb4", blurb: "Rare top band, the chase cards" },
  Mid: { target: 0.33, hue: "#c95cf5", blurb: "Mid band" },
  Common: { target: 0.66, hue: "#3ff0cf", blurb: "Common bulk" },
};

/**
 * Derive PullEV's three draw bands from a pool's weights.
 * Returns bands ordered rarest-first (Chase, Mid, Common). Empty if the pool has no
 * usable weights (e.g. a pool that was never run through the odds model).
 */
export function tierBreakdown(pool: Pool): TierRow[] {
  const total = pool.cards.reduce((s, e) => s + e.weight, 0);
  if (total <= 0 || pool.cards.length === 0) return [];

  // Group entries by (rounded) weight — one group per band by construction.
  const groups = new Map<string, { prob: number; cards: Card[] }>();
  for (const e of pool.cards) {
    const key = e.weight.toFixed(8);
    const g = groups.get(key) ?? { prob: 0, cards: [] };
    g.prob += e.weight / total;
    g.cards.push(e.card);
    groups.set(key, g);
  }

  const names: TierRow["name"][] = ["Chase", "Mid", "Common"];
  const used = new Set<TierRow["name"]>();
  const rows: TierRow[] = [];

  for (const g of groups.values()) {
    // Name the group by the model chance its probability is closest to (each name used
    // once). By construction the three probabilities match the three targets.
    let best: TierRow["name"] = "Common";
    let bestDist = Infinity;
    for (const n of names) {
      if (used.has(n)) continue;
      const d = Math.abs(g.prob - META[n].target);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    used.add(best);
    const fmvs = g.cards.map((c) => c.fmvUsd);
    const examples = [...g.cards].sort((a, b) => b.fmvUsd - a.fmvUsd);
    rows.push({
      name: best,
      chance: g.prob,
      count: g.cards.length,
      min: Math.min(...fmvs),
      max: Math.max(...fmvs),
      examples,
      hue: META[best].hue,
      blurb: META[best].blurb,
    });
  }

  const order: Record<TierRow["name"], number> = { Chase: 0, Mid: 1, Common: 2 };
  rows.sort((a, b) => order[a.name] - order[b.name]);
  return rows;
}
