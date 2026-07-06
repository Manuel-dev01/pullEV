"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Draw, EVResult, Pack, Pool, Provenance } from "@shared/types";
import { buildCommitment, corruptHexChar } from "@/lib/merkle";
import { ProvenanceBadge, LiveTag, AssumptionTag } from "./ProvenanceBadge";
import { Distribution } from "./Distribution";
import { ProofVault } from "./ProofVault";
import { Advisor } from "./Advisor";

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
  if (ratio >= 0.98) return { text: "MARGINAL", color: "#ffd76a", sub: "EV ≈ cost — coin-flip territory" };
  return { text: "SKIP", color: "#ff8fa0", sub: "house edge — EV below cost" };
}
const edgePct = (ratio: number) => (ratio - 1) * 100;

type Ripped = { draw: Draw; tampered: Draw; cardName: string; value: number };

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
  const [advisorOpen, setAdvisorOpen] = useState(false);
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
        label: "EXAMPLE PULL · demonstration, not a real Renaiss draw",
      };
      const tamperedProof = { ...proof, proofPath: proof.proofPath.map((s, i) => (i === 0 ? { ...s, hash: corruptHexChar(s.hash) } : s)) };
      const tampered: Draw = { ...draw, proof: tamperedProof, label: "EXAMPLE (tampered) · should FAIL" };
      setRipped({ draw, tampered, cardName: `${picked.card.name} · ${picked.card.grade}`, value: picked.card.fmvUsd });
    }
    setRipping(false);
  }, [active]);

  function pickAndAdvance() {
    void rip();
    go(2);
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
          padding: "16px 30px 10px",
          backdropFilter: "blur(12px)",
          background: "linear-gradient(180deg,rgba(8,7,12,.85),rgba(8,7,12,.25))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, maxWidth: 1180, margin: "0 auto" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, flex: "none", textDecoration: "none", color: C.ink }}>
            <div style={{ width: 24, height: 24, transform: "rotate(45deg)", borderRadius: 6, background: HUES[0], boxShadow: "0 0 14px rgba(201,92,245,.6)" }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
              PULL<span style={{ background: HUES[0], WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>EV</span>
            </span>
          </Link>
          <div style={{ flex: 1, position: "relative", height: 44, display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: 8, right: 8, top: "50%", height: 2, background: "rgba(255,255,255,.1)", borderRadius: 2 }} />
            <div style={{ position: "absolute", left: 8, top: "50%", height: 2, borderRadius: 2, background: "linear-gradient(90deg,#ff5fb4,#c95cf5,#3ff0cf)", width: `${(station / 3) * 100}%`, transition: "width .8s cubic-bezier(.72,0,.18,1)", boxShadow: "0 0 12px rgba(201,92,245,.6)" }} />
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
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", color: activeNode ? C.ink : C.dim }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ flex: "none", textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: C.muted }}>VERDICT</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: v.color, lineHeight: 1 }}>{v.text}</div>
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
            Pick a pack to send it down the line. Live EV on every one — from real Renaiss Index prices.
          </p>
          <div style={{ marginTop: 8 }}>
            <ProvenanceBadge provenance={packsProvenance} fallback={false} />
          </div>
          <div data-noswipe="1" style={{ display: "flex", gap: 20, overflowX: "auto", padding: "30px 4px 24px", marginTop: 8 }}>
            {packs.map((pd, i) => {
              const e = edgePct(pd.ev.evToCostRatio);
              const pos = e >= 0;
              return (
                <div
                  key={pd.pack.id}
                  onClick={() => {
                    setActiveId(pd.pack.id);
                    setRipped(null);
                    go(1);
                  }}
                  style={{ flex: "none", width: 210, cursor: "pointer", borderRadius: 18, padding: 16, background: C.panel, border: `1px solid ${pd.pack.id === activeId ? "rgba(201,92,245,.55)" : C.border}` }}
                >
                  <div style={{ height: 210, borderRadius: 12, background: HUES[i % HUES.length], padding: 3, boxShadow: "0 16px 40px rgba(0,0,0,.5)" }}>
                    <div style={{ width: "100%", height: "100%", borderRadius: 9, background: "#0b0810", backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,.06) 0 4px,transparent 4px 8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 16 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: ".04em" }}>{pd.pack.name.split(" ")[0].toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1 }}>{pd.pack.name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.muted, marginTop: 3 }}>cost {money(pd.pack.priceUsd)}</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: pos ? C.teal : "#ff8fa0", border: `1px solid ${pos ? "rgba(63,240,207,.35)" : "rgba(255,143,160,.35)"}`, borderRadius: 999, padding: "5px 9px" }}>
                      {pos ? "+" : ""}
                      {e.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.dim }}>↔ drag the shelf · tap a pack to load it into the line</div>
        </Station>

        {/* STATION 2 — X-RAY BAY */}
        <Station n="02" title="Station 02 · X-Ray Bay — see through the pack">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" }}>
            <div style={{ flex: "1 1 340px", minWidth: 320, display: "flex", flexDirection: "column", gap: 16 }}>
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

            <div style={{ flex: "0 0 320px", borderRadius: 16, padding: 20, background: C.panel, border: `1px solid ${C.border}`, alignSelf: "flex-start" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "#8a83a0" }}>Pool · oracle-priced</div>
                <ProvenanceBadge provenance={active.poolProvenance} fallback={active.poolFallback} />
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
                  <div key={e.card.id} style={{ display: "flex", alignItems: "center", padding: "8px 2px", borderTop: "1px solid rgba(255,255,255,.05)", fontSize: 12 }}>
                    <span style={{ flex: 2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.card.name}</span>
                    <span style={{ flex: 1.3, textAlign: "right", fontFamily: "var(--font-mono)", color: C.ink }}>
                      {money(e.card.fmvUsd)}
                      {e.card.fmvSource === "Index" ? <LiveTag confidence={e.card.fmvConfidence} deltaPct={e.card.fmvDeltaPct} asOf={e.card.fmvAsOf} /> : e.card.fmvIsAssumption ? <AssumptionTag /> : null}
                    </span>
                    <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-mono)", color: C.muted }}>{((e.weight / totalW) * 100).toFixed(1)}%</span>
                  </div>
                ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 26 }}>
            <div onClick={() => go(0)} style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: "#8a83a0" }}>← back to floor</div>
            <button onClick={pickAndAdvance} style={btnPrimary}>
              RIP FOR {money(active.pack.priceUsd)} →
            </button>
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.dim, marginTop: 10 }}>Informational only — not financial advice.</p>
        </Station>

        {/* STATION 3 — RIP CHAMBER */}
        <Station n="03" title="Station 03 · Rip Chamber" center>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(640px,90vw)", height: "min(640px,80vh)", background: "radial-gradient(circle,rgba(201,92,245,.3),transparent 62%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
            <div style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 10, color: "#ffd76a", border: "1px solid rgba(255,215,106,.4)", borderRadius: 999, padding: "5px 12px", marginBottom: 16 }}>
              EXAMPLE PULL · demonstration, not a real Renaiss draw
            </div>
            <div style={{ width: 210, height: 294, margin: "0 auto 22px", borderRadius: 20, background: HUES[0], padding: 4, boxShadow: "0 30px 80px rgba(201,92,245,.5)", animation: "pv-floaty 6s ease-in-out infinite" }}>
              <div style={{ width: "100%", height: "100%", borderRadius: 16, background: "#0b0810", backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,.05) 0 5px,transparent 5px 10px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, textAlign: "center" }}>
                {ripping ? (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C.teal }}>RIPPING…</div>
                ) : ripped ? (
                  <>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 0.95 }}>{ripped.cardName.split(" · ")[0]}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.muted }}>{ripped.cardName.split(" · ")[1]}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C.teal }}>FMV {money(ripped.value, 2)}</div>
                  </>
                ) : (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C.muted }}>press RIP</div>
                )}
              </div>
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
        <Station n="04" title="Station 04 · Proof Vault — verify it yourself">
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px,4vw,52px)", lineHeight: 0.92, margin: "0 0 18px" }}>SEAL THE PROOF.</h1>
          {ripped ? (
            <ProofVault valid={ripped.draw} tampered={ripped.tampered} cardName={ripped.cardName} />
          ) : (
            <p style={{ color: C.muted, fontFamily: "var(--font-mono)", fontSize: 13 }}>
              Rip a pull first (Station 03) to get a proof to verify — or{" "}
              <Link href="/verify" style={{ color: C.teal }}>paste your own on /verify</Link>.
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
            <div onClick={() => go(2)} style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: "#8a83a0" }}>← back to the rip</div>
            <button onClick={() => { setRipped(null); go(0); }} style={{ ...btnGhost, marginLeft: "auto" }}>↺ RIP ANOTHER PACK</button>
          </div>
        </Station>
      </div>

      {/* swipe hint + disclaimer */}
      <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 30, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", color: C.dim, textAlign: "center", pointerEvents: "none" }}>
        ⟵ SWIPE OR SCROLL SIDEWAYS TO RIDE THE LINE ⟶
        <div style={{ marginTop: 4, opacity: 0.7 }}>Independent tooling for Renaiss · not financial advice · card names for ID only (© their owners)</div>
      </div>

      {/* Floating grounded advisor */}
      <Advisor pack={active.pack} ev={active.ev} open={advisorOpen} setOpen={setAdvisorOpen} />
    </div>
  );
}

function Station({ n, title, children, center }: { n: string; title: string; children: React.ReactNode; center?: boolean }) {
  return (
    <div style={{ width: "100vw", height: "100vh", overflowY: "auto", position: "relative", padding: "112px 40px 60px", display: center ? "flex" : "block", alignItems: center ? "center" : undefined, justifyContent: center ? "center" : undefined }}>
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
