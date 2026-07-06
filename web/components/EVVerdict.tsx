import type { EVResult, Provenance } from "@shared/types";
import { ProvenanceBadge } from "./ProvenanceBadge";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Ratio-driven verdict. Deliberately hedged language — this is a transparency tool,
// not financial advice, and the caveats always ride along.
function verdict(ratio: number): { label: string; tone: string; blurb: string } {
  if (ratio >= 1.05)
    return {
      label: "Positive EV",
      tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      blurb: "Expected value exceeds the pack cost on these inputs.",
    };
  if (ratio >= 0.95)
    return {
      label: "Roughly break-even",
      tone: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      blurb: "Expected value is close to the pack cost on these inputs.",
    };
  return {
    label: "Negative EV — house edge",
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    blurb: "Expected value is below the pack cost on these inputs.",
  };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-100">{value}</div>
      {hint && <div className="text-[11px] text-neutral-500">{hint}</div>}
    </div>
  );
}

export function EVVerdict({
  ev,
  cost,
  provenance,
  fallback,
}: {
  ev: EVResult;
  cost: number;
  provenance: Provenance;
  fallback: boolean;
}) {
  const v = verdict(ev.evToCostRatio);
  const shortHash = ev.inputsHash.length > 12 ? `${ev.inputsHash.slice(0, 12)}…` : ev.inputsHash;

  return (
    <div className="border-t border-white/10 px-5 py-4">
      {/* Headline */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${v.tone}`}>
            {v.label}
          </span>
          <span className="text-sm text-neutral-400">{v.blurb}</span>
        </div>
        <ProvenanceBadge provenance={provenance} fallback={fallback} />
      </div>

      {/* Core numbers */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-4">
        <Stat label="Expected value" value={money(ev.expectedValue)} hint={`per ${money(cost)} pull`} />
        <Stat label="EV ÷ cost" value={`${ev.evToCostRatio.toFixed(2)}×`} hint="≥ 1.00 favors ripping" />
        <Stat label="Chance of profit" value={pct(ev.chanceOfProfit)} hint="P(card FMV ≥ cost)" />
        <Stat label="Median pull" value={money(ev.distribution.median)} hint="most-likely value" />
      </div>

      {/* Distribution */}
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
        <Stat label="P10 (unlucky)" value={money(ev.distribution.p10)} hint="10th percentile" />
        <Stat label="P50 (median)" value={money(ev.distribution.median)} hint="50th percentile" />
        <Stat label="P90 (lucky)" value={money(ev.distribution.p90)} hint="90th percentile" />
      </div>

      {/* Caveats — the honesty layer */}
      {ev.caveats.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-white/5 pt-3 text-xs text-neutral-500">
          {ev.caveats.map((c, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden className="text-neutral-600">
                •
              </span>
              {c}
            </li>
          ))}
        </ul>
      )}

      {/* Reproducibility footer */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-600">
        <span>
          inputs hash <code className="text-neutral-500">{shortHash}</code>
        </span>
        <span>computed {ev.computedAt.replace("T", " ").replace(/\.\d+Z|Z/, " UTC")}</span>
        <span>{ev.sources.length} input source(s) — hover the badge</span>
      </div>
    </div>
  );
}
