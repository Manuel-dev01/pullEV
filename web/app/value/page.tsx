import Link from "next/link";
import { lookupCert } from "@/lib/api";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import type { Valuation } from "@shared/types";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// Curated REAL cert examples (validated against the live Renaiss Index API).
const EXAMPLES = [{ cert: "PSA149595098", label: "Roronoa Zoro · PSA 10" }];

function Sparkline({ points }: { points: number[] }) {
  if (!points || points.length < 2) return null;
  const w = 220;
  const h = 44;
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
  const up = points[points.length - 1] >= points[0];
  const stroke = up ? "#3ff0cf" : "#ff5fb4";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default async function ValuePage({
  searchParams,
}: {
  searchParams: Promise<{ cert?: string }>;
}) {
  const { cert } = await searchParams;
  const result = cert ? await lookupCert(cert) : null;
  const v: Valuation | null = result?.data ?? null;
  const found = v?.found === true;

  return (
    <main style={{ background: "#08070c", flex: 1 }} className="w-full">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div
              style={{ fontFamily: "var(--font-mono)", color: "#8a83a0" }}
              className="mb-2 text-xs uppercase tracking-[0.3em]"
            >
              Oracle · real Renaiss Index valuations
            </div>
            <h1 style={{ fontFamily: "var(--font-display)" }} className="text-4xl leading-none sm:text-5xl">
              PRICE ANY SLAB.
            </h1>
            <p style={{ color: "#c3bad8" }} className="mt-3 max-w-xl text-sm leading-relaxed">
              Enter a PSA/CGC/BGS cert number to pull its <strong>real</strong> valuation from the Renaiss
              Index API — the same oracle that grounds our EV. Data is beta/experimental, cached, and
              labeled.
            </p>
          </div>
          <Link
            href="/"
            style={{ fontFamily: "var(--font-mono)", color: "#8a83a0" }}
            className="text-xs hover:text-neutral-300"
          >
            ← back to EV
          </Link>
        </div>

        {/* Lookup form (SSR via ?cert=) */}
        <form action="/value" method="get" className="mb-4 flex flex-wrap gap-2">
          <input
            name="cert"
            defaultValue={cert ?? ""}
            placeholder="e.g. PSA149595098"
            spellCheck={false}
            style={{ fontFamily: "var(--font-mono)", background: "#0f0b16", border: "1px solid rgba(255,255,255,.12)" }}
            className="min-w-[220px] flex-1 rounded-lg px-4 py-2.5 text-sm text-neutral-100 outline-none focus:border-white/30"
          />
          <button
            type="submit"
            style={{ fontFamily: "var(--font-display)", background: "linear-gradient(115deg,#ff5fb4,#c95cf5 45%,#3ff0cf)", color: "#08070c" }}
            className="rounded-lg px-6 py-2.5 text-sm"
          >
            LOOK UP
          </button>
        </form>
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span style={{ fontFamily: "var(--font-mono)", color: "#6f6885" }} className="text-xs">
            try:
          </span>
          {EXAMPLES.map((ex) => (
            <Link
              key={ex.cert}
              href={`/value?cert=${ex.cert}`}
              style={{ fontFamily: "var(--font-mono)", color: "#c3bad8", border: "1px solid rgba(255,255,255,.12)" }}
              className="rounded-full px-3 py-1 text-xs hover:border-white/30"
            >
              {ex.label}
            </Link>
          ))}
        </div>

        {/* Result */}
        {result && v ? (
          found ? (
            <div
              style={{ background: "#0f0b16", border: "1px solid rgba(63,240,207,.25)" }}
              className="rounded-2xl p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  {v.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.imageUrl}
                      alt={v.name}
                      width={70}
                      style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,.1)" }}
                    />
                  )}
                  <div>
                    <div style={{ fontFamily: "var(--font-display)" }} className="text-2xl leading-tight">
                      {v.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", color: "#9c94b6" }} className="mt-1 text-xs">
                      {v.setName}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", color: "#9c94b6" }} className="mt-0.5 text-xs">
                      {v.gradeLabel} · cert {v.cert} · {v.game}
                    </div>
                  </div>
                </div>
                <ProvenanceBadge provenance={result.provenance} fallback={result.fallback} />
              </div>

              <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", color: "#8a83a0" }} className="text-[11px] uppercase tracking-wide">
                    Estimated value
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", color: "#3ff0cf" }} className="text-4xl leading-none">
                    {money(v.priceUsd)}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", color: "#9c94b6" }} className="mt-1 text-xs">
                    confidence <span className="text-neutral-200">{v.confidence || "—"}</span>
                    {typeof v.deltaPct === "number" && (
                      <>
                        {" · trend "}
                        <span style={{ color: v.deltaPct >= 0 ? "#3ff0cf" : "#ff5fb4" }}>
                          {v.deltaPct >= 0 ? "▲" : "▼"}
                          {Math.abs(v.deltaPct).toFixed(1)}%
                        </span>
                      </>
                    )}
                    {v.lastSaleAt && ` · last sale ${v.lastSaleAt.slice(0, 10)}`}
                  </div>
                </div>
                <Sparkline points={v.spark} />
              </div>

              <p style={{ color: "#6f6885" }} className="mt-5 text-[11px] leading-relaxed">
                Source: Renaiss Index API (beta) — experimental reference, not a final verified market fact.
                {v.rateRemaining >= 0 && ` API calls remaining today: ${v.rateRemaining}.`}
              </p>
            </div>
          ) : (
            <div
              style={{ background: "#0f0b16", border: "1px solid rgba(255,255,255,.1)" }}
              className="rounded-2xl p-6"
            >
              <div style={{ fontFamily: "var(--font-mono)", color: "#ff8fa0" }} className="text-sm">
                No valuation for cert “{cert}”.
              </div>
              <p style={{ color: "#9c94b6" }} className="mt-2 text-xs">
                {result.provenance.notes} The card may not be ingested yet, the company may be unsupported,
                or the daily rate limit is reached. Try an example above.
              </p>
            </div>
          )
        ) : (
          <p style={{ color: "#6f6885" }} className="text-sm">
            Enter a cert number or pick an example to see a real valuation.
          </p>
        )}
      </div>
    </main>
  );
}
