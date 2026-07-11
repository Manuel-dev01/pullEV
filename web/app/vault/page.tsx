import Link from "next/link";
import { getCards } from "@/lib/api";
import { CardArt } from "@/components/CardArt";
import { ProvenanceBadge, LiveTag } from "@/components/ProvenanceBadge";
import type { Card } from "@shared/types";

// The Vault Index: the full real graded-card library PullEV prices. Every card here is
// a real Renaiss Index (beta) valuation, and the packs draw from exactly these cards, so
// a judge can see the ground truth behind every EV number. Server-rendered.

export const dynamic = "force-dynamic";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const GRAD = "linear-gradient(115deg,#ff5fb4,#c95cf5 45%,#3ff0cf)";

function gameLabel(g?: string): string {
  if (g === "one-piece") return "One Piece";
  if (g === "pokemon") return "Pokemon";
  return "Card";
}

// A tiny real price-history sparkline (90-day FMV series from the Renaiss Index).
function Spark({ points }: { points: number[] }) {
  if (!points || points.length < 2) return null;
  const w = 200;
  const h = 26;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  const up = points[points.length - 1] >= points[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-1 h-6 w-full" aria-hidden>
      <path d={d} fill="none" stroke={up ? "#3ff0cf" : "#ff5fb4"} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default async function VaultPage() {
  const { data: cards, provenance, fallback } = await getCards();

  const total = cards.reduce((s, c) => s + c.fmvUsd, 0);
  const top = cards[0]?.fmvUsd ?? 0;
  const onePiece = cards.filter((c) => c.game === "one-piece").length;
  const pokemon = cards.filter((c) => c.game === "pokemon").length;

  return (
    <main style={{ background: "#08070c", color: "#f6f2fb", flex: 1 }} className="w-full">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              style={{ fontFamily: "var(--font-mono)", color: "#8a83a0" }}
              className="mb-4 inline-block text-xs hover:text-neutral-300"
            >
              ← back to home
            </Link>
            <div
              style={{ fontFamily: "var(--font-mono)", color: "#8a83a0" }}
              className="mb-2 text-xs uppercase tracking-[0.3em]"
            >
              Vault Index · real Renaiss Index prices
            </div>
            <h1 style={{ fontFamily: "var(--font-display)" }} className="text-4xl leading-none sm:text-5xl">
              THE CARD LIBRARY.
            </h1>
            <p style={{ color: "#c3bad8" }} className="mt-3 max-w-2xl text-sm leading-relaxed">
              The {cards.length} real graded cards PullEV prices from the Renaiss Index API (beta). The pools
              PullEV models draw from exactly these, so every EV number traces back to a card you can see
              here. Prices are real, cached, and labeled beta/experimental; the pool membership is a labeled
              PullEV model, not Renaiss&apos;s own pack contents.
            </p>
          </div>
          <ProvenanceBadge provenance={provenance} fallback={fallback} align="right" />
        </div>

        {/* Stat strip */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Cards priced", v: String(cards.length) },
            { k: "Top valuation", v: money(top) },
            { k: "Library value", v: money(total) },
            { k: "Games", v: `${onePiece} OP · ${pokemon} PKM` },
          ].map((s) => (
            <div
              key={s.k}
              style={{ border: "1px solid rgba(255,255,255,.08)", background: "rgba(18,14,26,.5)" }}
              className="rounded-xl px-4 py-3"
            >
              <div style={{ fontFamily: "var(--font-mono)", color: "#8a83a0" }} className="text-[11px] uppercase tracking-wider">
                {s.k}
              </div>
              <div style={{ fontFamily: "var(--font-display)" }} className="mt-1 text-xl">
                {s.v}
              </div>
            </div>
          ))}
        </div>

        {/* Gallery */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((c: Card) => (
            <div
              key={c.id}
              style={{ border: "1px solid rgba(255,255,255,.08)", background: "rgba(18,14,26,.5)" }}
              className="flex flex-col overflow-hidden rounded-2xl"
            >
              <div style={{ aspectRatio: "3 / 4" }} className="relative w-full p-2">
                <CardArt src={c.imageUrl} name={c.name} sizes="(max-width:640px) 45vw, 240px" />
              </div>
              <div className="flex flex-1 flex-col gap-1 px-3 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontFamily: "var(--font-display)" }} className="truncate text-base" title={c.name}>
                    {c.name}
                  </span>
                  <span
                    style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontFamily: "var(--font-display)" }}
                    className="shrink-0 text-base"
                  >
                    {money(c.fmvUsd)}
                  </span>
                </div>
                <div style={{ color: "#8a83a0" }} className="truncate text-[11px]" title={c.set}>
                  {c.set}
                </div>
                {c.spark && c.spark.length >= 2 ? <Spark points={c.spark} /> : null}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    style={{ border: "1px solid rgba(255,255,255,.12)", color: "#b6afc8" }}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  >
                    {c.grade}
                  </span>
                  <span
                    style={{ border: "1px solid rgba(255,255,255,.12)", color: "#8a83a0" }}
                    className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                  >
                    {gameLabel(c.game)}
                  </span>
                  <LiveTag confidence={c.fmvConfidence} deltaPct={c.fmvDeltaPct} asOf={c.fmvAsOf} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p style={{ color: "#6f6885" }} className="mt-10 text-xs leading-relaxed">
          Card names and images are shown for identification only; Pokemon and One Piece marks belong to
          their respective owners. Valuations are experimental beta reference data from the Renaiss Index
          API, not financial advice.
        </p>
      </div>
    </main>
  );
}
