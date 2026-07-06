import Link from "next/link";
import { getPacks, getPool, getExampleProof } from "@/lib/api";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { ProofVault } from "@/components/ProofVault";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ pack?: string }>;
}) {
  const { pack: packParam } = await searchParams;
  const packs = await getPacks();
  const activeId = packs.data.find((p) => p.id === packParam)?.id ?? packs.data[0]?.id;
  const activePack = packs.data.find((p) => p.id === activeId);

  const [valid, tampered, pool] = activeId
    ? await Promise.all([
        getExampleProof(activeId, "valid"),
        getExampleProof(activeId, "tampered"),
        getPool(activeId),
      ])
    : [null, null, null];

  const drawnCard =
    valid && pool ? pool.data.cards.find((e) => e.card.id === valid.data.cardId)?.card ?? null : null;

  return (
    <main style={{ background: "#08070c", flex: 1 }} className="w-full">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div
              style={{ fontFamily: "var(--font-mono)", color: "#8a83a0" }}
              className="mb-2 text-xs uppercase tracking-[0.3em]"
            >
              Proof Vault · verify it yourself
            </div>
            <h1 style={{ fontFamily: "var(--font-display)" }} className="text-4xl leading-none sm:text-5xl">
              WAS MY PULL FAIR?
            </h1>
            <p style={{ color: "#c3bad8" }} className="mt-3 max-w-xl text-sm leading-relaxed">
              Recompute a draw&apos;s Merkle inclusion proof in your own browser. If the root you compute
              matches the published root, the card and its odds were committed — provably, without trusting
              PullEV or Renaiss.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {valid && <ProvenanceBadge provenance={valid.provenance} fallback={valid.fallback} />}
            <Link
              href={activeId ? `/?pack=${activeId}` : "/"}
              style={{ fontFamily: "var(--font-mono)", color: "#8a83a0" }}
              className="text-xs hover:text-neutral-300"
            >
              ← back to EV
            </Link>
          </div>
        </div>

        {/* Pack switcher */}
        <div className="mb-6 flex flex-wrap gap-2">
          {packs.data.map((p) => {
            const active = p.id === activeId;
            return (
              <Link
                key={p.id}
                href={`/verify?pack=${p.id}`}
                style={{
                  fontFamily: "var(--font-mono)",
                  color: active ? "#08070c" : "#c3bad8",
                  background: active
                    ? "linear-gradient(115deg,#ff5fb4,#c95cf5 45%,#3ff0cf)"
                    : "transparent",
                  border: active ? "none" : "1px solid rgba(255,255,255,.12)",
                }}
                className="rounded-full px-4 py-1.5 text-xs"
              >
                {p.name}
              </Link>
            );
          })}
        </div>

        {activePack ? (
          <ProofVault
            valid={valid?.data ?? null}
            tampered={tampered?.data ?? null}
            cardName={drawnCard ? `${drawnCard.name} · ${drawnCard.grade}` : null}
          />
        ) : (
          <p style={{ color: "#9c94b6" }} className="text-sm">
            No pack data available.
          </p>
        )}

        {/* Honesty footer */}
        <p style={{ color: "#6f6885" }} className="mt-8 text-xs leading-relaxed">
          The example proofs are labeled <strong style={{ color: "#9c94b6" }}>EXAMPLE</strong> — they are
          not real Renaiss draws. The published root is computed by PullEV over a labeled pool
          (mock/assumption data), not Renaiss&apos;s on-chain root. Renaiss&apos;s current builder tooling
          exposes card valuations but not draw proofs; when it does, this same verifier checks them
          unmodified. The verification math is genuine and runs entirely client-side.
        </p>
        <p style={{ color: "#4f495e" }} className="mt-3 text-[11px] leading-relaxed">
          Independent, unofficial tooling for Renaiss · not financial advice. Card names shown for
          identification only; Pokémon / One Piece marks © their respective owners.
        </p>
      </div>
    </main>
  );
}
