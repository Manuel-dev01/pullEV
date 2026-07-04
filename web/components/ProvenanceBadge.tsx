import type { Provenance } from "@shared/types";

// The structural guarantee for the Safety rubric: every number on screen routes
// through a ProvenanceBadge so its source, freshness, and official/unofficial status
// are always one glance (or hover) away. Never render a value without one.

function label(p: Provenance, fallback: boolean): string {
  if (p.isOfficial) return "OFFICIAL";
  if (fallback) return "BUNDLED SNAPSHOT";
  if (p.source === "Mock") return "MOCK DATA";
  if (p.source === "Public") return "UNOFFICIAL · SCRAPED";
  return "SDK";
}

function tone(p: Provenance, fallback: boolean): string {
  if (p.isOfficial) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (fallback) return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-sky-500/40 bg-sky-500/10 text-sky-300";
}

function fmtTime(iso: string): string {
  // Keep it stable across server/client render — show the raw date portion.
  return iso.replace("T", " ").replace("Z", " UTC");
}

export function ProvenanceBadge({
  provenance,
  fallback = false,
}: {
  provenance: Provenance;
  fallback?: boolean;
}) {
  return (
    <span
      className={`group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone(
        provenance,
        fallback,
      )}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label(provenance, fallback)}
      <span className="text-current/60">· {fmtTime(provenance.fetchedAt)}</span>
      {/* Hover surfaces the full provenance note — the "reachable provenance" rule. */}
      <span className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-72 rounded-md border border-white/10 bg-neutral-900 p-2 text-xs font-normal leading-snug text-neutral-300 shadow-xl group-hover:block">
        <strong className="text-neutral-100">{provenance.source} source.</strong>{" "}
        {provenance.notes}
      </span>
    </span>
  );
}

/** Small inline marker for a single assumed value (e.g. an FMV that isn't oracle-backed). */
export function AssumptionTag({ note = "Assumption" }: { note?: string }) {
  return (
    <span
      title={note}
      className="ml-1 rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
    >
      assumed
    </span>
  );
}
