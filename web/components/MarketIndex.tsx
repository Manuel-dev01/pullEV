import type { IndexTile } from "@shared/types";

// Renders Renaiss's REAL market indices (per game) — the ecosystem's own price index, the
// same data the FMV oracle is built on. Value, real 7d/30d/1y deltas, and a mini sparkline.
// This is genuine grounded market context, not a PullEV construction. Responsive: the tiles
// sit in an auto-fit grid (two-up on wide, stacked on narrow) and never overlap.

function Spark({ points, up }: { points: number[]; up: boolean }) {
  if (!points || points.length < 2) return null;
  const w = 110;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flex: "none" }} aria-hidden>
      <path d={d} fill="none" stroke={up ? "#3ff0cf" : "#ff5fb4"} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Delta({ label, pct }: { label: string; pct: number }) {
  const up = pct >= 0;
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a83a0", whiteSpace: "nowrap" }}>
      {label}{" "}
      <span style={{ color: up ? "#3ff0cf" : "#ff8fa0" }}>
        {up ? "▲" : "▼"}
        {Math.abs(pct).toFixed(1)}%
      </span>
    </span>
  );
}

export function MarketIndex({ tiles }: { tiles: IndexTile[] }) {
  if (!tiles || tiles.length === 0) return null;
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", borderBottom: "1px solid rgba(255,255,255,.08)", background: "#0b0810", padding: "14px clamp(18px,5vw,24px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* header: label (attributes the source; the real Renaiss index) */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#8a83a0", whiteSpace: "nowrap" }}>
            Renaiss market index <span style={{ color: "#3ff0cf" }}>· live</span>
          </span>
        </div>

        {/* tiles: auto-fit grid — two-up on wide, stacked on narrow */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {tiles.map((t) => {
            const up = t.deltaD30 >= 0;
            return (
              <div
                key={t.game}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "10px 14px", background: "rgba(255,255,255,.02)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a83a0", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>{t.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1, color: "#f6f2fb" }}>
                      {t.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                    <span title={`${t.constituents} cards · rebalanced ${t.rebalance?.toLowerCase()}`} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
