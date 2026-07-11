"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Draw, EVResult, Pack, Pool, Provenance } from "@shared/types";
import { buildCommitment, corruptHexChar } from "@/lib/merkle";
import { ProvenanceBadge, LiveTag, AssumptionTag } from "./ProvenanceBadge";
import { Distribution } from "./Distribution";
import { ProofVault } from "./ProofVault";
import { Advisor } from "./Advisor";
import { CardArt } from "./CardArt";
import { tierBreakdown } from "@/lib/tiers";

// Honest label for the client-side sample rip: a genuine weighted draw over the live
// pool, but not Renaiss's official on-chain sealed draw. Renaiss commits sealed pools as
// on-chain merkle roots (see OnChainRoot) but exposes no per-draw proof or pool-contents API.
const SAMPLE_LABEL = "SAMPLE PULL · real odds, client-side";
const SAMPLE_TOOLTIP = "A real weighted draw over the live pool. Not Renaiss's official on-chain sealed draw.";

// The highest-FMV card's image, used as a pack's cover art on The Floor.
function coverImage(pool: Pool): string | undefined {
  let top = pool.cards[0];
  for (const e of pool.cards) if (e.card.fmvUsd > (top?.card.fmvUsd ?? 0)) top = e;
  return top?.card.imageUrl;
}

const C = {
  bg: "#08070c",
  panel: "#0f0b16",
  ink: "#f6f2fb",
  muted: "#9c94b6",
  dim: "#6f6885",
  pink: "#ff5fb4",
  teal: "#3ff0cf",
  border: "rgba(255,255,255,.08)",
};

export type PackData = {
  pack: Pack;
  pool: Pool;
  ev: EVResult;
  poolProvenance: Provenance;
  poolFallback: boolean;
  evFallback: boolean;
};

const money = (n: number, d = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d });

const LABELS = ["THE FLOOR", "X-RAY BAY", "RIP CHAMBER", "PROOF VAULT"];
const HUES = [
  "linear-gradient(135deg,#ff5fb4,#7b7bff,#3ff0cf)",
  "linear-gradient(135deg,#4bc6ff,#7b7bff,#c95cf5)",
  "linear-gradient(135deg,#3ff0cf,#4bc6ff,#7b7bff)",
];

function verdictOf(ratio: number) {
  if (ratio >= 1.05) return { text: "RIP IT", color: C.teal, sub: "EV beats cost by a healthy margin" };
  if (ratio >= 0.98) return { text: "MARGINAL", color: "#ffd76a", sub: "EV ≈ cost, coin-flip territory" };
  return { text: "SKIP", color: "#ff8fa0", sub: "house edge, EV below cost" };
}
const edgePct = (ratio: number) => (ratio - 1) * 100;

type Ripped = { draw: Draw; tampered: Draw; cardName: string; set?: string; value: number; image?: string };

export function Filmstrip({
  packs,
  packsProvenance,
}: {
  packs: PackData[];
  packsProvenance: Provenance;
}) {
  const [station, setStation] = useState(0);
  const [activeId, setActiveId] = useState(packs[0]?.pack.id ?? "");
  const [moving, setMoving] = useState(false);
  const [dir, setDir] = useState(1);
  const [ripped, setRipped] = useState<Ripped | null>(null);
  const [ripping, setRipping] = useState(false);
  const [session, setSession] = useState(0); // running P/L across sample rips: Σ(FMV − cost)
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false); // "under the hood" math: opt-in, collapsed by default
  const lockRef = useRef(0);
  const tsRef = useRef<{ x: number; y: number } | null>(null);
  const moveT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = packs.find((p) => p.pack.id === activeId) ?? packs[0];

  const go = useCallback(
    (i: number) => {
      const target = Math.max(0, Math.min(3, i));
      setStation((cur) => {
        if (target === cur) return cur;
        setDir(target > cur ? 1 : -1);
        setMoving(true);
        if (moveT.current) clearTimeout(moveT.current);
        moveT.current = setTimeout(() => setMoving(false), 780);
        return target;
      });
    },
    [],
  );

  // Swipe / scroll-sideways navigation (ported from the Pipeline design).
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (advisorOpen) return;
      const t = e.target as HTMLElement;
      if (t.closest?.("[data-noswipe]")) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 22) {
        e.preventDefault();
        const now = Date.now();
        if (now - lockRef.current < 850) return;
        lockRef.current = now;
        go(station + (e.deltaX > 0 ? 1 : -1));
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      tsRef.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!tsRef.current || advisorOpen) {
        tsRef.current = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - tsRef.current.x;
      const dy = t.clientY - tsRef.current.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 55) go(station + (dx < 0 ? 1 : -1));
      tsRef.current = null;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [station, advisorOpen, go]);

  const rip = useCallback(async () => {
    if (!active) return;
    setRipping(true);
    const total = active.pool.cards.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    let picked = active.pool.cards[0];
    for (const e of active.pool.cards) {
      r -= e.weight;
      if (r <= 0) {
        picked = e;
        break;
      }
    }
    const { proofFor } = await buildCommitment(active.pool.cards);
    const proof = proofFor(picked.card.id);
    if (proof) {
      const draw: Draw = {
        id: `rip-${active.pack.id}-${picked.card.id}`,
        packId: active.pack.id,
        cardId: picked.card.id,
        proof,
        isExample: true,
        label: SAMPLE_LABEL,
      };
      const tamperedProof = { ...proof, proofPath: proof.proofPath.map((s, i) => (i === 0 ? { ...s, hash: corruptHexChar(s.hash) } : s)) };
      const tampered: Draw = { ...draw, proof: tamperedProof, label: "SAMPLE (tampered) · should FAIL" };
      setRipped({ draw, tampered, cardName: `${picked.card.name} · ${picked.card.grade}`, set: picked.card.set, value: picked.card.fmvUsd, image: picked.card.imageUrl });
      setSession((s) => s + picked.card.fmvUsd - active.pack.priceUsd);
    }
    setRipping(false);
  }, [active]);

  function pickAndAdvance() {
    void rip();
    go(2);
  }

  const currentPacks = packs.filter((p) => !p.pack.soldOut);
  const previousPacks = packs.filter((p) => p.pack.soldOut);

  // One Floor tile, shared by the live shelf and the sold-out previous-packs showcase.
  function packTile(pd: PackData, i: number) {
    const e = edgePct(pd.ev.evToCostRatio);
    const pos = e >= 0;
    const kindLabel = pd.pack.soldOut ? "SOLD OUT" : pd.pack.kind === "infinite" ? "∞ INFINITE" : "LIMITED";
    return (
      <div
        key={pd.pack.id}
        className="pv-lift"
        onClick={() => {
          setActiveId(pd.pack.id);
          setRipped(null);
          go(1);
        }}
        style={{ flex: "none", width: 210, cursor: "pointer", borderRadius: 18, padding: 16, background: C.panel, border: `1px solid ${pd.pack.id === activeId ? "rgba(201,92,245,.55)" : C.border}`, opacity: pd.pack.soldOut ? 0.82 : 1 }}
      >
        <div style={{ position: "relative", height: 210, boxShadow: "0 16px 40px rgba(0,0,0,.5)" }}>
          <CardArt src={coverImage(pd.pool)} hue={HUES[i % HUES.length]} radius={12} name={pd.pack.name.split(" ")[0].toUpperCase()} sizes="210px" />
          <div style={{ position: "absolute", top: 8, left: 8, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".08em", color: pd.pack.soldOut ? "#ff8fa0" : "#c3bad8", background: "rgba(8,7,12,.72)", border: `1px solid ${pd.pack.soldOut ? "rgba(255,143,160,.5)" : "rgba(255,255,255,.18)"}`, borderRadius: 6, padding: "3px 7px", backdropFilter: "blur(4px)" }}>{kindLabel}</div>
          {pd.pack.topPrizeUsd ? (
            <div style={{ position: "absolute", bottom: 8, right: 8, fontFamily: "var(--font-mono)", fontSize: 9, color: "#ffd76a", background: "rgba(8,7,12,.72)", border: "1px solid rgba(255,215,106,.4)", borderRadius: 6, padding: "3px 7px", backdropFilter: "blur(4px)" }}>top {money(pd.pack.topPrizeUsd)}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pd.pack.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.muted, marginTop: 3 }}>cost {money(pd.pack.priceUsd)}</div>
          </div>
          <div style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: pos ? C.teal : "#ff8fa0", border: `1px solid ${pos ? "rgba(63,240,207,.35)" : "rgba(255,143,160,.35)"}`, borderRadius: 999, padding: "5px 9px" }}>
            {pos ? "+" : ""}
            {e.toFixed(1)}%
          </div>
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div style={{ background: C.bg, color: C.ink, minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", color: C.muted }}>No packs available.</div>
      </div>
    );
  }

  const ratio = active.ev.evToCostRatio;
  const v = verdictOf(ratio);
  const outcomes = active.pool.cards.map((e) => ({
    value: e.card.fmvUsd,
    prob: e.weight / active.pool.cards.reduce((s, x) => s + x.weight, 0),
  }));
  const totalW = active.pool.cards.reduce((s, e) => s + e.weight, 0);
  const tiers = tierBreakdown(active.pool);

  // Engine spotlight ("under the hood"): the exact glass-box computation the Go engine ran.
  // EV = Σ over bands (band draw chance × band average FMV) — mathematically identical to
  // Σ pᵢ·fmvᵢ, but grouped so a judge can read the sum. Built from data already on the client.
  const liveCount = active.pool.cards.filter((e) => e.card.fmvSource === "Index").length;
  const evBands = tiers.map((t) => {
    const avg = t.examples.length ? t.examples.reduce((s, c) => s + c.fmvUsd, 0) / t.examples.length : 0;
    return { name: t.name, hue: t.hue, chance: t.chance, avg, contribution: t.chance * avg };
  });

  return (
    <div
      style={{
        fontFamily: "var(--font-sans)",
        color: C.ink,
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "radial-gradient(1100px 700px at 50% -10%,#15111c,#0a090d 60%,#08070c 100%)",
      }}
    >
      {/* TOP RAIL */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          padding: "16px clamp(12px,4vw,30px) 10px",
          backdropFilter: "blur(12px)",
          background: "linear-gradient(180deg,rgba(8,7,12,.85),rgba(8,7,12,.25))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "clamp(10px,3vw,20px)", maxWidth: 1180, margin: "0 auto" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, flex: "none", textDecoration: "none", color: C.ink }}>
            <div style={{ width: 24, height: 24, transform: "rotate(45deg)", borderRadius: 6, background: HUES[0], boxShadow: "0 0 14px rgba(201,92,245,.6)" }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
              PULL<span style={{ background: HUES[0], WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>EV</span>
            </span>
          </Link>
          <Link
            href="/vault"
            className="pv-hide-sm"
            style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: C.dim, textDecoration: "none" }}
            title="The full real graded-card library the packs draw from"
          >
            Vault
          </Link>
          <div style={{ flex: 1, position: "relative", height: 44, display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: 8, right: 8, top: "50%", height: 2, background: "rgba(255,255,255,.1)", borderRadius: 2 }} />
            <div style={{ position: "absolute", left: 8, top: "50%", height: 2, borderRadius: 2, background: "linear-gradient(90deg,#ff5fb4,#c95cf5,#3ff0cf)", width: `${(station / 3) * 100}%`, transition: "width .8s cubic-bezier(.72,0,.18,1)", boxShadow: "0 0 12px rgba(201,92,245,.6)" }} />
            {/* gliding pack token — rides ABOVE the rail (never overlaps the station nodes) */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                left: `calc(13px + (100% - 26px) * ${station / 3})`,
                width: 18,
                height: 25,
                borderRadius: 5,
                background: HUES[0],
                padding: 2,
                boxSizing: "border-box",
                boxShadow: "0 8px 22px rgba(201,92,245,.85), 0 0 0 3px rgba(8,7,12,.92)",
                zIndex: 6,
                pointerEvents: "none",
                transform: moving
                  ? `translate(-50%, calc(-50% - 21px)) rotate(${dir * 19}deg) scale(1.1)`
                  : "translate(-50%, calc(-50% - 15px)) rotate(7deg)",
                filter: moving ? "blur(.8px)" : "none",
                transition:
                  "left .78s cubic-bezier(.72,0,.18,1), transform .78s cubic-bezier(.72,0,.18,1), filter .78s ease",
              }}
            >
              <div style={{ width: "100%", height: "100%", borderRadius: 3, background: "#0b0810", backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,.16) 0 2px,transparent 2px 4px)" }} />
              {/* thin connector down to the rail */}
              <div style={{ position: "absolute", left: "50%", top: "100%", width: 1, height: 11, transform: "translateX(-50%)", background: "linear-gradient(rgba(201,92,245,.7),transparent)" }} />
            </div>
            <div style={{ position: "relative", display: "flex", justifyContent: "space-between", width: "100%" }}>
              {LABELS.map((label, i) => {
                const activeNode = i === station;
                const done = i < station;
                return (
                  <div key={label} onClick={() => go(i)} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 9,
                        display: "grid",
                        placeItems: "center",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        transition: "all .3s",
                        ...(activeNode
                          ? { background: HUES[0], color: C.bg, boxShadow: "0 0 16px rgba(201,92,245,.7)", transform: "scale(1.12)" }
                          : done
                            ? { background: "rgba(63,240,207,.15)", color: C.teal, border: "1px solid rgba(63,240,207,.5)" }
                            : { background: "#100d18", color: C.dim, border: "1px solid rgba(255,255,255,.12)" }),
                      }}
                    >
                      {done ? "✓" : String(i + 1).padStart(2, "0")}
                    </div>
                    <span className="pv-hide-xs" style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", color: activeNode ? C.ink : C.dim, whiteSpace: "nowrap" }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ flex: "none", textAlign: "right" }} title="Running profit/loss across your sample rips this session (FMV minus pack cost).">
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C.muted }}>SESSION</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: session >= 0 ? C.teal : "#ff8fa0", lineHeight: 1 }}>
              {session >= 0 ? "+" : "-"}{money(Math.abs(session))}
            </div>
          </div>
        </div>
      </div>

      {/* FILMSTRIP */}
      <div style={{ position: "absolute", inset: 0, display: "flex", width: "400vw", transform: `translateX(-${station * 100}vw)`, transition: "transform .8s cubic-bezier(.72,0,.18,1)" }}>
        {/* STATION 1 — FLOOR */}
        <Station n="01" title="Station 01 · The Floor">
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(44px,6.5vw,92px)", lineHeight: 0.88, margin: "0 0 8px" }}>
            STEP ONTO<br />THE FLOOR.
          </h1>
          <p style={{ fontSize: 16, color: "#c3bad8", maxWidth: 460, lineHeight: 1.55 }}>
            Pick a pack to send it down the line. Live EV on every one, from real Renaiss Index prices.
          </p>
          <div style={{ marginTop: 8 }}>
            <ProvenanceBadge provenance={packsProvenance} fallback={false} />
          </div>
          <div data-noswipe="1" className="pv-shelf" style={{ display: "flex", gap: 20, overflowX: "auto", padding: "30px 4px 24px", marginTop: 8 }}>
            {currentPacks.map((pd, i) => packTile(pd, i))}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.dim }}>↔ drag the shelf · tap a pack to load it into the line · live Infinite Gacha packs</div>
          {previousPacks.length > 0 && (
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", color: "#8a83a0", marginTop: 30 }}>
                Previous packs · sold out ({previousPacks.length})
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.dim, marginTop: 6, maxWidth: 560 }}>
                Real Renaiss limited packs, now retired. EV is informational (you cannot rip a sold-out pack).
              </p>
              <div data-noswipe="1" className="pv-shelf" style={{ display: "flex", gap: 20, overflowX: "auto", padding: "16px 4px 8px" }}>
                {previousPacks.map((pd, i) => packTile(pd, i + 1))}
              </div>
            </>
          )}
        </Station>

        {/* STATION 2 — X-RAY BAY */}
        <Station n="02" title="Station 02 · X-Ray Bay · see through the pack">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" }}>
            <div style={{ flex: "1 1 340px", minWidth: "min(320px, 100%)", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", borderRadius: 16, padding: "20px 22px", background: "linear-gradient(120deg,rgba(63,240,207,.08),rgba(123,123,255,.06))", border: `1px solid ${v.color}44` }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: v.color }}>{v.text}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.muted, maxWidth: 160, lineHeight: 1.4 }}>{v.sub}</div>
                </div>
                <div style={{ display: "flex", gap: 22, marginLeft: "auto", flexWrap: "wrap" }}>
                  <Stat label="EV" value={money(active.ev.expectedValue, 2)} />
                  <Stat label="COST" value={money(active.pack.priceUsd)} color={C.muted} />
                  <Stat label="EDGE" value={`${edgePct(ratio) >= 0 ? "+" : ""}${edgePct(ratio).toFixed(1)}%`} color={v.color} />
                </div>
              </div>
              <div style={{ borderRadius: 16, padding: 20, background: C.panel, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "#8a83a0" }}>Value distribution</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.muted }}>
                    P(profit) {(active.ev.chanceOfProfit * 100).toFixed(0)}%
                  </div>
                </div>
                <Distribution outcomes={outcomes} cost={active.pack.priceUsd} />
                <div style={{ display: "flex", gap: 8, marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: C.muted }}>
                  <span>p10 {money(active.ev.distribution.p10)}</span>·<span>median {money(active.ev.distribution.median)}</span>·<span>p90 {money(active.ev.distribution.p90)}</span>
                </div>
              </div>
              {active.ev.caveats?.length > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.dim, lineHeight: 1.5 }}>
                  {active.ev.caveats.map((c, i) => (
                    <div key={i}>· {c}</div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: "1 1 300px", minWidth: "min(300px, 100%)", borderRadius: 16, padding: 20, background: C.panel, border: `1px solid ${C.border}`, alignSelf: "flex-start" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "#8a83a0", whiteSpace: "nowrap" }}>Pool · oracle-priced</div>
                <ProvenanceBadge provenance={active.poolProvenance} fallback={active.poolFallback} align="right" />
              </div>
              <div style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: 9, color: C.dim, padding: "0 2px 8px" }}>
                <span style={{ flex: 2 }}>CARD</span>
                <span style={{ flex: 1.3, textAlign: "right" }}>FMV</span>
                <span style={{ flex: 1, textAlign: "right" }}>ODDS</span>
              </div>
              {active.pool.cards
                .slice()
                .sort((a, b) => b.card.fmvUsd - a.card.fmvUsd)
                .map((e) => (
                  <div key={e.card.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px", borderTop: "1px solid rgba(255,255,255,.05)", fontSize: 12 }}>
                    <div style={{ flex: "none", width: 22, height: 30 }}>
                      <CardArt src={e.card.imageUrl} hue={HUES[0]} radius={5} pad={1.5} sizes="32px" />
                    </div>
                    <span style={{ flex: 2, minWidth: 0, overflow: "hidden" }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.card.name}</span>
                      {e.card.set && <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.card.set}</span>}
                    </span>
                    <span style={{ flex: 1.3, textAlign: "right", fontFamily: "var(--font-mono)", color: C.ink }}>
                      {money(e.card.fmvUsd)}
                      {e.card.fmvSource === "Index" ? <LiveTag confidence={e.card.fmvConfidence} deltaPct={e.card.fmvDeltaPct} asOf={e.card.fmvAsOf} /> : e.card.fmvIsAssumption ? <AssumptionTag /> : null}
                    </span>
                    <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-mono)", color: C.muted }}>{((e.weight / totalW) * 100).toFixed(1)}%</span>
                  </div>
                ))}
            </div>
          </div>

          {/* REAL ON-CHAIN ROOT — Renaiss's committed merkle root for a sealed pack (BNB Chain) */}
          {active.pack.onChain && (
            <div style={{ marginTop: 24, borderRadius: 16, padding: "16px 18px", background: "linear-gradient(160deg,rgba(63,240,207,.07),rgba(123,123,255,.04))", border: "1px solid rgba(63,240,207,.35)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: C.teal }}>⛓ Real on-chain root · {active.pack.onChain.chain}</span>
                </div>
                <a href={active.pack.onChain.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8a83a0", textDecoration: "underline", textDecorationStyle: "dotted" }}>
                  audit on BscScan →
                </a>
              </div>
              <div title={active.pack.onChain.merkleRoot} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C.teal, marginTop: 8, wordBreak: "break-all" }}>
                {active.pack.onChain.merkleRoot}
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: C.dim, margin: "8px 0 0", lineHeight: 1.5 }}>
                Renaiss&apos;s genuine committed root for this sealed pool, read from chain via
                getMerkleRoot(packId). Reproduce it yourself on BscScan. Full inclusion recompute lives in the{" "}
                <Link href={`/verify?pack=${active.pack.id}`} style={{ color: C.teal }}>Proof Vault</Link>.
              </p>
            </div>
          )}

          {/* WHAT IS LOADED — PullEV's own 3-band odds model (labeled; not Renaiss's exact tiers) */}
          {tiers.length > 0 && (
            <div style={{ marginTop: 24, borderRadius: 16, padding: 20, background: C.panel, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "#8a83a0" }}>What is loaded · PullEV odds model</div>
                {active.pack.topPrizeUsd ? (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.muted }}>top prize {money(active.pack.topPrizeUsd)}</div>
                ) : null}
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.dim, margin: "0 0 16px", maxWidth: 680, lineHeight: 1.5 }}>
                Every card here is a <span style={{ color: C.teal }}>real</span> Renaiss Index valuation, from
                the cheap <span style={{ color: C.teal }}>Common</span> commons to the rare{" "}
                <span style={{ color: "#ff5fb4" }}>Chase</span> jackpot. What is our labeled model is only the
                odds: Renaiss publishes a per-pack tiered &quot;what is loaded&quot; (e.g. Tier S/A/B/C on
                OMEGA, Crown/Bloom/Thorn on Eden) whose exact chances aren&apos;t public, so the band
                probabilities are ours (rare band &lt;1%, consistent with Renaiss&apos;s sub-1% top tier). So
                the EV is real prices under a modeled pool, not a measurement of Renaiss&apos;s own pack.
                Chances shown are this pool&apos;s computed draw probabilities.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
                {tiers.map((t) => (
                  <div key={t.name} style={{ borderRadius: 12, padding: "14px 14px 12px", background: "rgba(255,255,255,.02)", border: `1px solid ${t.hue}44` }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: t.hue }}>{t.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: C.ink }}>{(t.chance * 100).toFixed(t.chance < 0.1 ? 1 : 0)}%</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: C.dim, marginTop: 2 }}>{t.blurb}</div>
                    {/* proportional chance bar */}
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.07)", margin: "10px 0 10px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max(2, t.chance * 100)}%`, background: t.hue, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: C.muted }}>
                      {money(t.min)}–{money(t.max)} · {t.count} card{t.count === 1 ? "" : "s"}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                      {t.examples.slice(0, 3).map((c, i) => (
                        <div key={c.id + i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 9.5, color: "#b6afc8" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <span style={{ flex: "none", display: "inline-flex", alignItems: "center", color: C.dim }}>
                            {money(c.fmvUsd)}
                            {c.fmvSource === "Index" ? <LiveTag confidence={c.fmvConfidence} deltaPct={c.fmvDeltaPct} asOf={c.fmvAsOf} /> : c.fmvIsAssumption ? <AssumptionTag /> : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UNDER THE HOOD — the EV engine, glass-box. Every number here is produced by
              PullEV's pure, deterministic Go engine from the pool above; nothing is a black box.
              This is the EV twin of the client-side Merkle verifier: don't trust the verdict, read
              the computation that made it. */}
          <div style={{ marginTop: 24, borderRadius: 16, padding: 20, background: "linear-gradient(160deg,rgba(123,123,255,.06),rgba(201,92,245,.03))", border: "1px solid rgba(123,123,255,.3)" }}>
            {/* collapsed by default: casual rippers see a one-line affordance, not a wall of math.
                Judges (or anyone skeptical) click to expand the full glass-box computation. */}
            <div
              onClick={() => setEngineOpen((o) => !o)}
              title={engineOpen ? "Hide the EV computation" : "Show exactly how the engine computed this EV"}
              style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span aria-hidden style={{ display: "inline-block", transition: "transform .2s", transform: engineOpen ? "rotate(90deg)" : "none", color: C.teal, fontSize: 11 }}>▸</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "#8a83a0" }}>Under the hood · the EV engine</span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, whiteSpace: "nowrap", color: engineOpen ? "#8a83a0" : C.teal, border: `1px solid ${engineOpen ? "rgba(255,255,255,.14)" : "rgba(63,240,207,.35)"}`, borderRadius: 999, padding: "3px 10px" }}>
                {engineOpen ? "hide the math" : "see the math"}
              </span>
            </div>
            {engineOpen && (
              <div style={{ marginTop: 16 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.dim, margin: "0 0 16px", maxWidth: 700, lineHeight: 1.5 }}>
              No black box. PullEV&apos;s own Go engine computes this verdict as a pure function of the pool
              above: one card is drawn, each card&apos;s probability = its weight ÷ the total weight. The same
              inputs always produce the same number and the same fingerprint hash, so anyone can reproduce it.
            </p>

            {/* the actual sum: EV = Σ over bands (draw chance × average FMV) */}
            {evBands.length > 0 && (
              <div style={{ borderRadius: 12, padding: 14, background: "rgba(255,255,255,.02)", border: `1px solid ${C.border}`, marginBottom: 14 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.muted, marginBottom: 10 }}>
                  expected value = Σ over bands ( draw chance × average FMV )
                </div>
                {evBands.map((b) => (
                  <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 12, padding: "5px 0", flexWrap: "wrap" }}>
                    <span style={{ width: 66, color: b.hue }}>{b.name}</span>
                    <span style={{ color: C.muted }}>{(b.chance * 100).toFixed(b.chance < 0.1 ? 2 : 1)}%</span>
                    <span style={{ color: C.dim }}>×</span>
                    <span style={{ color: C.ink }}>{money(b.avg)}</span>
                    <span style={{ color: C.dim }}>avg</span>
                    <span style={{ color: C.dim }}>=</span>
                    <span style={{ marginLeft: "auto", color: C.ink }}>{money(b.contribution, 2)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid rgba(255,255,255,.12)", marginTop: 8, paddingTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#8a83a0", textTransform: "uppercase", letterSpacing: ".12em" }}>Expected value</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-display)", fontSize: 22, color: v.color }}>{money(active.ev.expectedValue, 2)}</span>
                </div>
              </div>
            )}

            {/* verdict + profit derivations, each shown as its formula */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
              <EngineStep k="edge = EV ÷ cost" expr={`${money(active.ev.expectedValue, 2)} ÷ ${money(active.pack.priceUsd)}`} val={`${ratio.toFixed(2)}× · ${edgePct(ratio) >= 0 ? "+" : ""}${edgePct(ratio).toFixed(1)}%`} color={v.color} />
              <EngineStep k="P(profit)" expr="Σ pᵢ where FMVᵢ ≥ cost" val={`${(active.ev.chanceOfProfit * 100).toFixed(1)}%`} color={C.ink} />
              <EngineStep k="verdict" expr={v.sub} val={v.text} color={v.color} />
            </div>

            {/* fingerprint + provenance receipts */}
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9.5, color: C.dim }}>
              <span title={active.ev.inputsHash}>
                inputs fingerprint (SHA-256): <span style={{ color: "#b6afc8" }}>{active.ev.inputsHash.slice(0, 20)}…</span> · same pool → same hash
              </span>
              <span>
                <span style={{ color: C.teal }}>{liveCount}/{active.pool.cards.length}</span> prices LIVE Renaiss Index · pool membership + band odds = PullEV model
              </span>
            </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 26 }}>
            <div onClick={() => go(0)} style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: "#8a83a0" }}>← back to floor</div>
            <button onClick={pickAndAdvance} style={btnPrimary}>
              RIP FOR {money(active.pack.priceUsd)} →
            </button>
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.dim, marginTop: 10 }}>Informational only. Not financial advice.</p>
        </Station>

        {/* STATION 3 — RIP CHAMBER */}
        <Station n="03" title="Station 03 · Rip Chamber" center>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(640px,90vw)", height: "min(640px,80vh)", background: "radial-gradient(circle,rgba(201,92,245,.3),transparent 62%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
            <div title={SAMPLE_TOOLTIP} style={{ display: "inline-block", cursor: "help", fontFamily: "var(--font-mono)", fontSize: 10, color: "#ffd76a", border: "1px solid rgba(255,215,106,.4)", borderRadius: 999, padding: "5px 12px", marginBottom: 16 }}>
              {SAMPLE_LABEL}
            </div>
            <div style={{ position: "relative", width: 210, height: 294, margin: "0 auto 18px", boxShadow: "0 30px 80px rgba(201,92,245,.5)", animation: "pv-floaty 6s ease-in-out infinite" }}>
              {ripped && !ripping && ripped.image ? (
                <>
                  <CardArt src={ripped.image} hue={HUES[0]} radius={20} pad={4} sizes="220px" priority />
                  {/* name + FMV overlaid on the card (matches the design) */}
                  <div style={{ position: "absolute", left: 4, right: 4, bottom: 4, padding: "24px 12px 12px", borderRadius: "0 0 16px 16px", background: "linear-gradient(transparent,rgba(8,7,12,.55) 40%,rgba(8,7,12,.94))", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, lineHeight: 0.95, textShadow: "0 2px 10px rgba(0,0,0,.8)" }}>{ripped.cardName.split(" · ")[0]}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#d3cce4", marginTop: 4 }}>
                      {ripped.cardName.split(" · ")[1]} · <span style={{ color: C.teal }}>FMV {money(ripped.value, 2)}</span>
                    </div>
                    {ripped.set && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#a79fbe", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ripped.set}</div>}
                  </div>
                </>
              ) : ripped && !ripping ? (
                /* No art on file (labeled commons): the design's centered name/grade/FMV card. */
                <div style={{ width: "100%", height: "100%", borderRadius: 20, background: "linear-gradient(135deg,#ff5fb4,#c95cf5 40%,#7b7bff 70%,#3ff0cf)", padding: 4, boxSizing: "border-box" }}>
                  <div style={{ width: "100%", height: "100%", borderRadius: 16, background: "#0b0810", backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,.05) 0 5px,transparent 5px 10px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, textAlign: "center", padding: "0 14px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".2em", color: C.pink }}>{ripped.cardName.split(" · ")[1]}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 0.95 }}>{ripped.cardName.split(" · ")[0]}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.teal }}>FMV {money(ripped.value, 2)}</div>
                    {ripped.set && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "#a79fbe", padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{ripped.set}</div>}
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: C.dim, marginTop: 2 }}>artwork not on file</div>
                  </div>
                </div>
              ) : (
                <div style={{ width: "100%", height: "100%", borderRadius: 20, background: "linear-gradient(135deg,#ff5fb4,#c95cf5 40%,#7b7bff 70%,#3ff0cf)", padding: 4, boxSizing: "border-box" }}>
                  <div style={{ width: "100%", height: "100%", borderRadius: 16, background: "#0b0810", backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,.05) 0 5px,transparent 5px 10px)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: ripping ? C.teal : C.muted }}>{ripping ? "RIPPING…" : "press RIP"}</div>
                  </div>
                </div>
              )}
            </div>
            {ripped && !ripping && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.muted, marginBottom: 20 }}>
                draw leaf <span style={{ color: "#c3bad8" }}>0x{ripped.draw.proof.leaf.slice(0, 10)}…</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {ripped ? (
                <button onClick={() => go(3)} style={btnPrimary}>SEAL THE PROOF →</button>
              ) : (
                <button onClick={() => void rip()} disabled={ripping} style={btnPrimary}>{ripping ? "…" : "RIP THE PACK"}</button>
              )}
              <button onClick={() => void rip()} style={btnGhost}>Rip again</button>
            </div>
          </div>
        </Station>

        {/* STATION 4 — PROOF VAULT */}
        <Station n="04" title="Station 04 · Proof Vault · verify it yourself">
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px,4vw,52px)", lineHeight: 0.92, margin: "0 0 18px" }}>SEAL THE PROOF.</h1>
          {ripped ? (
            <ProofVault valid={ripped.draw} tampered={ripped.tampered} cardName={ripped.cardName} />
          ) : (
            <p style={{ color: C.muted, fontFamily: "var(--font-mono)", fontSize: 13 }}>
              Rip a pull first (Station 03) to get a proof to verify, or{" "}
              <Link href="/verify" style={{ color: C.teal }}>paste your own on /verify</Link>.
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
            <div onClick={() => go(2)} style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: "#8a83a0" }}>← back to the rip</div>
            <button onClick={() => { setRipped(null); go(0); }} style={{ ...btnGhost, marginLeft: "auto" }}>↺ RIP ANOTHER PACK</button>
          </div>
        </Station>
      </div>

      {/* swipe hint + disclaimer — a full-width fade-to-background bar so scrolling station
          content dissolves under it instead of visibly colliding with the text. */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30, padding: "34px 16px 12px", background: "linear-gradient(transparent, rgba(8,7,12,.94) 42%)", textAlign: "center", pointerEvents: "none" }}>
        <div className="pv-hide-xs" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", color: C.dim }}>
          ⟵ SWIPE OR SCROLL SIDEWAYS TO RIDE THE LINE ⟶
        </div>
        <div style={{ marginTop: 4, opacity: 0.7, fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".08em", color: C.dim, lineHeight: 1.4 }}>Independent tooling for Renaiss · not financial advice · card names for ID only (© their owners)</div>
      </div>

      {/* Floating grounded advisor */}
      <Advisor pack={active.pack} ev={active.ev} open={advisorOpen} setOpen={setAdvisorOpen} />
    </div>
  );
}

function Station({ n, title, children, center }: { n: string; title: string; children: React.ReactNode; center?: boolean }) {
  return (
    <div style={{ width: "100vw", height: "100vh", overflowY: "auto", position: "relative", padding: "112px clamp(16px,5vw,40px) 96px", display: center ? "flex" : "block", alignItems: center ? "center" : undefined, justifyContent: center ? "center" : undefined }}>
      <div style={{ position: "absolute", top: 60, right: "5%", fontFamily: "var(--font-display)", fontSize: "34vw", lineHeight: 0.7, color: "transparent", WebkitTextStroke: "1.5px rgba(255,255,255,.035)", pointerEvents: "none", userSelect: "none" }}>{n}</div>
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        {!center && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase", color: "#8a83a0", marginBottom: 16 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#9c94b6" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: color ?? "#f6f2fb" }}>{value}</div>
    </div>
  );
}

// One derivation step in the "under the hood" engine panel: a label, the formula it evaluates,
// and its result. Keeps the glass-box computation readable (name → formula → value).
function EngineStep({ k, expr, val, color }: { k: string; expr: string; val: string; color?: string }) {
  return (
    <div style={{ borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a83a0" }}>{k}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6f6885", margin: "4px 0 6px", lineHeight: 1.4 }}>{expr}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1.05, color: color ?? "#f6f2fb" }}>{val}</div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-display)",
  fontSize: 18,
  letterSpacing: ".03em",
  color: "#08070c",
  padding: "14px 28px",
  borderRadius: 12,
  background: "linear-gradient(115deg,#ff5fb4,#c95cf5 45%,#3ff0cf)",
  boxShadow: "0 10px 30px rgba(201,92,245,.45)",
};
const btnGhost: React.CSSProperties = {
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontWeight: 600,
  fontSize: 14,
  color: "#f6f2fb",
  padding: "14px 20px",
  borderRadius: 12,
  background: "transparent",
  border: "1px solid rgba(255,255,255,.2)",
};
