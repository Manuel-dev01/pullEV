import { getPacks, getPool, getEV } from "@/lib/api";
import { Filmstrip, type PackData } from "@/components/Filmstrip";

// The Pipeline filmstrip app. Server-fetches every pack's pool + EV (real Renaiss
// Index data where available) and hands it to the client filmstrip.
export default async function AppPage() {
  const packs = await getPacks();
  const data: PackData[] = [];
  for (const p of packs.data) {
    const [pool, ev] = await Promise.all([getPool(p.id), getEV(p.id)]);
    if (!pool || !ev) continue;
    data.push({
      pack: p,
      pool: pool.data,
      ev: ev.data,
      poolProvenance: pool.provenance,
      poolFallback: pool.fallback,
      evFallback: ev.fallback,
    });
  }
  return <Filmstrip packs={data} packsProvenance={packs.provenance} />;
}
