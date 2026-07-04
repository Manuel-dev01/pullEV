import Link from "next/link";
import { getPacks, getPool } from "@/lib/api";
import { ProvenanceBadge, AssumptionTag } from "@/components/ProvenanceBadge";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ pack?: string }>;
}) {
  const { pack: packParam } = await searchParams;
  const packs = await getPacks();
  const activeId = packs.data.find((p) => p.id === packParam)?.id ?? packs.data[0]?.id;
  const pool = activeId ? await getPool(activeId) : null;
  const activePack = packs.data.find((p) => p.id === activeId);

  const totalWeight = pool ? pool.data.cards.reduce((s, e) => s + e.weight, 0) : 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            Pull<span className="text-sky-400">EV</span>
          </h1>
          <ProvenanceBadge provenance={packs.provenance} fallback={packs.fallback} />
        </div>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Provably-fair gacha decision tool for Renaiss Infinite Gacha. Pick a pack to see its
          vault-backed pool. Every value below carries its source — hover the badge.
        </p>
      </header>

      {/* Pack selector */}
      <section aria-label="Packs" className="mb-8 grid gap-3 sm:grid-cols-3">
        {packs.data.map((p) => {
          const selected = p.id === activeId;
          return (
            <Link
              key={p.id}
              href={`/?pack=${p.id}`}
              className={`rounded-xl border p-4 transition ${
                selected
                  ? "border-sky-500/60 bg-sky-500/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{p.name}</span>
                <span className="text-sm text-neutral-300">
                  {money(p.priceUsd)}
                  {p.priceIsAssumption && <AssumptionTag note="Price unconfirmed — verify live" />}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{p.tagline}</p>
            </Link>
          );
        })}
      </section>

      {/* Pool */}
      {pool && activePack ? (
        <section aria-label="Pool" className="rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <div>
              <h2 className="font-semibold">{activePack.name} — current pool</h2>
              <p className="text-xs text-neutral-500">
                {pool.data.cards.length} cards · cost {money(activePack.priceUsd)}
              </p>
            </div>
            <ProvenanceBadge provenance={pool.provenance} fallback={pool.fallback} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr className="border-b border-white/5">
                  <th className="px-5 py-2 font-medium">Card</th>
                  <th className="px-5 py-2 font-medium">Grade</th>
                  <th className="px-5 py-2 text-right font-medium">FMV</th>
                  <th className="px-5 py-2 text-right font-medium">Draw odds</th>
                </tr>
              </thead>
              <tbody>
                {pool.data.cards
                  .slice()
                  .sort((a, b) => b.card.fmvUsd - a.card.fmvUsd)
                  .map((e) => {
                    const odds = totalWeight ? (e.weight / totalWeight) * 100 : 0;
                    return (
                      <tr key={e.card.id} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-neutral-100">{e.card.name}</div>
                          <div className="text-xs text-neutral-500">{e.card.set}</div>
                        </td>
                        <td className="px-5 py-2.5 text-neutral-300">{e.card.grade}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-neutral-100">
                          {money(e.card.fmvUsd)}
                          {e.card.fmvIsAssumption && (
                            <AssumptionTag note="FMV is an assumption, not a live oracle read" />
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-neutral-400">
                          {odds.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* EV verdict placeholder — Slice 1 fills this with the sourced EV engine output. */}
          <div className="border-t border-white/10 px-5 py-3 text-xs text-neutral-500">
            EV verdict (expected value vs. cost, distribution, chance-of-profit) arrives in Slice 1.
            Draw odds shown are derived from pool weights for transparency, not financial advice.
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-8 text-center text-sm text-neutral-500">
          No pool data available for this pack.
        </p>
      )}
    </main>
  );
}
