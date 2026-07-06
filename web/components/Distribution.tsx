// Value-distribution histogram for a pack's single-pull outcome — built from the
// pool's discrete (value, probability) outcomes, with a cost marker. Real data.

export function Distribution({
  outcomes,
  cost,
}: {
  outcomes: { value: number; prob: number }[];
  cost: number;
}) {
  const BINS = 20;
  const max = Math.max(cost, ...outcomes.map((o) => o.value)) * 1.05 || 1;
  const bins = new Array(BINS).fill(0) as number[];
  for (const o of outcomes) {
    const i = Math.min(BINS - 1, Math.max(0, Math.floor((o.value / max) * BINS)));
    bins[i] += o.prob;
  }
  const peak = Math.max(...bins) || 1;
  const costX = Math.min(100, (cost / max) * 100);
  const costBin = Math.floor((cost / max) * BINS);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 130 }}>
        {bins.map((b, i) => {
          const h = Math.max(b > 0 ? 6 : 0, Math.round((b / peak) * 100));
          const profit = i >= costBin;
          return (
            <div
              key={i}
              title={`$${Math.round((i / BINS) * max)}-$${Math.round(((i + 1) / BINS) * max)} · ${(b * 100).toFixed(1)}%`}
              style={{
                flex: 1,
                height: `${h}%`,
                minHeight: b > 0 ? 3 : 0,
                borderRadius: "3px 3px 0 0",
                background: profit
                  ? "linear-gradient(180deg,#ff5fb4,#c95cf5 55%,#3ff0cf)"
                  : "linear-gradient(180deg,#4a3a52,#2a2338)",
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          position: "relative",
          height: 20,
          marginTop: 6,
          borderTop: "1px dashed rgba(255,255,255,.12)",
        }}
      >
        <div style={{ position: "absolute", left: `${costX}%`, top: 0, height: "100%", borderLeft: "1px dashed #3ff0cf" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "#3ff0cf",
              position: "absolute",
              left: 4,
              top: 4,
              whiteSpace: "nowrap",
            }}
          >
            cost ${Math.round(cost)}
          </span>
        </div>
      </div>
    </div>
  );
}
