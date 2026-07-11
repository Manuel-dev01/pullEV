import type { IndexTile } from "@shared/types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import type { Provenance } from "@shared/types";

// Renders Renaiss's REAL market indices (per game) — the ecosystem's own price index, the
// same data the FMV oracle is built on. Value, real 7d/30d/1y deltas, and a mini sparkline.
// This is genuine grounded market context, not a PullEV construction.

function Spark({ points, up }: { points: number[]; up: boolean }) {
  if (!points || points.length < 2) return null;
  const w = 120;
  const h = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }} aria-hidden>
      <path d={d} fill="none" stroke={up ? "#3ff0cf" : "#ff5fb4"} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Delta({ label, pct }: { label: string; pct: number }) {
  const up = pct >= 0;
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a83a0" }}>
      {label}{" "}
      <span style={{ color: up ? "#3ff0cf" : "#ff8fa0" }}>
        {up ? "▲" : "▼"}
        {Math.abs(pct).toFixed(1)}%
      </span>
    </span>
  );
}

export function MarketIndex({
  tiles,
  provenance,
  fallback,
}: {
  tiles: IndexTile[];
  provenance: Provenance;
  fallback: boolean;
}) {
  if (!tiles || tiles.length === 0) return null;
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", borderBottom: "1px solid rgba(255,255,255,.08)", background: "#0b0810", padding: "16px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#8a83a0" }}>
            Renaiss market index
          </span>
          <ProvenanceBadge provenance={provenance} fallback={fallback} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
          {tiles.map((t) => {
            const up = t.deltaD30 >= 0;
            return (
              <div key={t.game} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a83a0", textTransform: "uppercase", letterSpacing: ".08em" }}>{t.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#f6f2fb" }}>{t.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                    <span title={`${t.constituents} cards · rebalanced ${t.rebalance?.toLowerCase()}`} style={{ display: "flex", gap: 8 }}>
                      <Delta label="7d" pct={t.deltaD7} />
                      <Delta label="30d" pct={t.deltaD30} />
                      <Delta label="1y" pct={t.deltaD365} />
                    </span>
                  </div>
                </div>
                <Spark points={t.spark} up={up} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
