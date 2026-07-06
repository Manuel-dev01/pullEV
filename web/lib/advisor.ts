import type { EVResult, Pack, Pool } from "@shared/types";

// DeepSeek (OpenAI-compatible). Model kept in one swappable const.
// NOTE: CLAUDE.md specifies Anthropic for the advisor; the user explicitly chose
// DeepSeek and supplied DEEPSEEK_API_KEY — documented deviation.
export const DEEPSEEK_MODEL = "deepseek-chat";
export const DEEPSEEK_BASE = "https://api.deepseek.com";

// The grounding contract. The advisor may ONLY use numbers from the provided
// context and must cite each with a [n] source tag; it refuses anything else.
export function systemPrompt(): string {
  return [
    "You are PullEV's Pull Advisor. You help a user decide whether ripping a graded-card gacha pack is +EV.",
    "STRICT RULES:",
    "1. Use ONLY numbers present in the CONTEXT block. Never invent, estimate, or recall figures from elsewhere.",
    "2. Every sentence that states a number MUST cite its source with a bracket tag: [1] EV engine, [2] distribution, [3] pool, [4] Renaiss Index oracle.",
    "3. If the question cannot be answered from the CONTEXT, say so plainly and stop — do not speculate.",
    "4. Never present any figure as a guaranteed or verified outcome. Card values are beta oracle estimates; draw odds are a labeled model assumption.",
    "5. Be concise (2–4 sentences). End with: 'Not financial advice.'",
    "You are grounded, not a hype machine. Restraint is the point.",
  ].join("\n");
}

// buildContext serializes exactly the numbers the model is allowed to cite.
export function buildContext(pack: Pack, ev: EVResult, pool: Pool): string {
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
    `PACK: ${pack.name} — cost $${pack.priceUsd}${pack.priceIsAssumption ? " (cost is an unconfirmed assumption)" : ""}`,
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
    `CAVEATS: ${(ev.caveats ?? []).join(" ")}`,
  ].join("\n");
}

const CITATION_LABELS: Record<string, string> = {
  "[1]": "[1] EV engine",
  "[2]": "[2] distribution",
  "[3]": "[3] pool",
  "[4]": "[4] Renaiss Index",
};

export function extractCitations(answer: string): string[] {
  const found = new Set(answer.match(/\[\d\]/g) ?? []);
  return [...found].map((t) => CITATION_LABELS[t] ?? t);
}
