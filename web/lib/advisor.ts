import type { EVResult, Pack, Pool } from "@shared/types";

// DeepSeek (OpenAI-compatible). Model kept in one swappable const.
// NOTE: CLAUDE.md specifies Anthropic for the advisor; the user explicitly chose
// DeepSeek and supplied DEEPSEEK_API_KEY — documented deviation.
export const DEEPSEEK_MODEL = "deepseek-chat";
export const DEEPSEEK_BASE = "https://api.deepseek.com";

// The grounding contract. The advisor may explain PRODUCT CONCEPTS qualitatively, but
// every NUMBER it states must come from the CONTEXT block with a [n] source tag. It never
// invents figures. This keeps it genuinely helpful without presenting anything as fact.
export function systemPrompt(): string {
  return [
    "You are PullEV's Pull Advisor. You help a user understand a Renaiss Infinite Gacha pack and decide whether to rip it.",
    "",
    "PRODUCT KNOWLEDGE you may explain in plain words (concepts only, never invented numbers):",
    "- Renaiss is real-world-asset infrastructure for graded collectible cards (Pokemon, One Piece) on BNB Chain. Each card is a real graded card held in a vault and mirrored on-chain.",
    "- An Infinite Gacha pack is a sealed pool of these cards. To 'rip' a pack means to pay its cost and draw one card at random from that pool.",
    "- PullEV helps two ways: it computes whether a pack is worth ripping (expected value versus cost) and it lets you verify a draw was fair by recomputing its Merkle proof in your own browser.",
    "- 'What should I rip' comes down to edge: a positive edge means expected value beats cost; most packs carry a house edge (negative). Use the all-packs overview to compare.",
    "",
    "STRICT RULES ON NUMBERS:",
    "1. Every figure you state (a price, EV, edge, odds, chance of profit, card value) MUST come from the CONTEXT block, and you MUST attach its source tag inline immediately after the number: [1] EV engine, [2] distribution, [3] pool, [4] Renaiss Index oracle, [5] all-packs overview. A number without a tag is a mistake.",
    "   Example of correct tagging: 'This pack costs $100 [1] and its edge is -52% [1], with an 8% chance of profit [2].'",
    "2. Never invent, estimate, or recall a number. If a specific figure is not in CONTEXT, say you do not have that number, then answer what you can from the concepts above.",
    "3. Never present a figure as a guaranteed or verified outcome. Card values are beta oracle estimates; draw odds are a labeled model assumption.",
    "",
    "VOICE:",
    "- Answer the question directly. Do NOT narrate your sources in prose (no 'based on the context', no 'according to the overview'); just give the answer and tag each number.",
    "- Be genuinely helpful and concise (2 to 4 sentences). End with: 'Not financial advice.'",
    "- Do not use em dashes. Use commas, colons, or periods instead.",
    "You are grounded, not a hype machine, but you are here to help.",
  ].join("\n");
}

// A compact edge overview of every pack, so the advisor can answer "what should I rip".
export type PackEdge = { name: string; edge: number; verdict: string };

// buildContext serializes exactly the numbers the model is allowed to cite.
export function buildContext(pack: Pack, ev: EVResult, pool: Pool, allPacks: PackEdge[] = []): string {
  const edge = ((ev.evToCostRatio - 1) * 100).toFixed(1);
  const totalW = pool.cards.reduce((s, e) => s + e.weight, 0) || 1;
  const cardLines = pool.cards
    .slice()
    .sort((a, b) => b.card.fmvUsd - a.card.fmvUsd)
    .map((e) => {
      const odds = ((e.weight / totalW) * 100).toFixed(1);
      const src = e.card.fmvSource === "Index" ? "Renaiss Index (beta, real)" : "assumption";
      const trend = typeof e.card.fmvDeltaPct === "number" ? `, trend ${e.card.fmvDeltaPct >= 0 ? "+" : ""}${e.card.fmvDeltaPct.toFixed(1)}%` : "";
      return `  - ${e.card.name} (${e.card.grade}): FMV $${e.card.fmvUsd} [source: ${src}${e.card.fmvConfidence ? `, confidence ${e.card.fmvConfidence}` : ""}${trend}], draw odds ${odds}%`;
    })
    .join("\n");

  return [
    `PACK: ${pack.name}, cost $${pack.priceUsd}${pack.priceIsAssumption ? " (cost is an unconfirmed assumption)" : ""}`,
    "",
    "[1] EV ENGINE (computed by PullEV's tested Go engine):",
    `  expected value $${ev.expectedValue.toFixed(2)}; EV-to-cost ratio ${ev.evToCostRatio.toFixed(2)}; edge ${edge}%`,
    `  computed at ${ev.computedAt}; inputs hash ${ev.inputsHash.slice(0, 12)}…`,
    "",
    "[2] DISTRIBUTION (single-pull value):",
    `  chance of profit ${(ev.chanceOfProfit * 100).toFixed(0)}%; p10 $${ev.distribution.p10}; median $${ev.distribution.median}; p90 $${ev.distribution.p90}`,
    "",
    "[3] POOL (one card drawn per pack; odds are a labeled model assumption):",
    cardLines,
    "",
    "[4] RENAISS INDEX ORACLE: card values marked 'Renaiss Index (beta, real)' are live cached valuations; others are labeled assumptions.",
    "",
    "[5] ALL PACKS TODAY (edge overview, to compare what to rip):",
    allPacks.length
      ? allPacks.map((p) => `  - ${p.name}: edge ${p.edge >= 0 ? "+" : ""}${p.edge.toFixed(1)}% (${p.verdict})`).join("\n")
      : "  (not provided)",
    "",
    `CAVEATS: ${(ev.caveats ?? []).join(" ")}`,
  ].join("\n");
}

const CITATION_LABELS: Record<string, string> = {
  "[1]": "[1] EV engine",
  "[2]": "[2] distribution",
  "[3]": "[3] pool",
  "[4]": "[4] Renaiss Index",
  "[5]": "[5] all packs",
};

export function extractCitations(answer: string): string[] {
  const found = new Set(answer.match(/\[\d\]/g) ?? []);
  return [...found].map((t) => CITATION_LABELS[t] ?? t);
}
