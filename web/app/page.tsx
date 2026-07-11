import Link from "next/link";
import type { CSSProperties } from "react";
import { getPacks, getEV, getPool, getIndices } from "@/lib/api";
import { CardArt } from "@/components/CardArt";
import { MarketIndex } from "@/components/MarketIndex";
import type { EVResult, Pack, Pool } from "@shared/types";

// FOIL marketing landing. Server-rendered with REAL featured-pack EV + marquee.
const money = (n: number, d = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d });
const edgePct = (r: number) => (r - 1) * 100;

const GRAD = "linear-gradient(115deg,#ff5fb4,#c95cf5 45%,#3ff0cf)";

// The highest-FMV card image in a pool, used as the featured pack's console art.
function topCardImage(pool: Pool | undefined): string | undefined {
  if (!pool) return undefined;
  let top = pool.cards[0];
  for (const e of pool.cards) if (e.card.fmvUsd > (top?.card.fmvUsd ?? 0)) top = e;
  return top?.card.imageUrl;
}

// The rarest card's real draw odds (lowest weight / total), so the hero "MYTHIC" chip
// shows a real number from the live pool instead of a hardcoded figure.
function rarestOdds(pool: Pool): { name: string; pct: number } | undefined {
  if (!pool.cards.length) return undefined;
  const total = pool.cards.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return undefined;
  let min = pool.cards[0];
  for (const e of pool.cards) if (e.weight < min.weight) min = e;
  return { name: min.card.name, pct: (min.weight / total) * 100 };
}

export default async function Landing() {
  const packs = await getPacks();
  const evs: { pack: Pack; ev: EVResult }[] = [];
  for (const p of packs.data) {
    const e = await getEV(p.id);
    if (e) evs.push({ pack: p, ev: e.data });
  }
  evs.sort((a, b) => b.ev.evToCostRatio - a.ev.evToCostRatio);
  // Feature a live (rippable) pack, never a sold-out previous pack.
  const featured = evs.find((e) => !e.pack.soldOut) ?? evs[0];
  const liveEvs = evs.filter((e) => !e.pack.soldOut);
  // Fetch the featured pool for the console art, the rarest-card odds (MYTHIC chip), and
  // its provenance, so every number on this page routes through a reachable badge.
  const featuredPoolF = featured ? await getPool(featured.pack.id) : null;
  const featuredPool = featuredPoolF?.data;
  const featuredImg = topCardImage(featuredPool);
  const mythic = featuredPool ? rarestOdds(featuredPool) : undefined;
  // When the engine is unreachable, numbers come from the bundled snapshot. Label it.
  const offline = packs.fallback || (featuredPoolF?.fallback ?? false);
  // Real Renaiss market indices (the ecosystem's own price index) for market context.
  const indices = await getIndices();

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "#f6f2fb", background: "#08070c", overflowX: "hidden" }}>
      {/* NAV */}
      <div className="pv-nav" style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px clamp(16px,4vw,40px)", backdropFilter: "blur(14px)", background: "linear-gradient(180deg,rgba(8,7,12,.86),rgba(8,7,12,.45))", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 30, height: 30, flex: "none", transform: "rotate(45deg)", borderRadius: 8, background: GRAD, boxShadow: "0 0 20px rgba(201,92,245,.6)" }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>PULL<span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>EV</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 26, fontSize: 14, color: "#b6afc8" }}>
          <div className="pv-nav-links" style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <Link href="#how" style={navLink}>How it works</Link>
            <Link href="#fair" style={navLink}>Provably fair</Link>
            <Link href="/vault" style={navLink}>Vault</Link>
            <Link href="/value" style={navLink}>Oracle</Link>
          </div>
          <Link href="/app" style={{ border: "none", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", color: "#08070c", padding: "11px 20px", borderRadius: 10, background: GRAD, boxShadow: "0 6px 22px rgba(201,92,245,.45)", textDecoration: "none" }}>Launch app</Link>
        </div>
      </div>

      {/* HERO */}
      <div style={{ position: "relative", minHeight: "108vh", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "url('/image_1.jpg')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 78% 30%, rgba(8,7,12,0) 0%, rgba(8,7,12,.55) 46%, #08070c 82%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(8,7,12,.35) 0%,transparent 22%,transparent 55%,#08070c 100%)" }} />
        {/* floating slab chips — anchored to the hero and slanted, floating over the nebula (matches FOIL design) */}
        {featured && (
          <div style={{ position: "absolute", top: "9%", left: "6%", zIndex: 4, "--r": "-8deg", animation: "pv-floaty-r 7s ease-in-out infinite" } as CSSProperties}>
            <div title="Featured pack's live EV edge (expected value vs cost), computed by PullEV's EV engine" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#3ff0cf", background: "rgba(12,9,18,.72)", border: "1px solid rgba(63,240,207,.35)", borderRadius: 10, padding: "8px 12px", backdropFilter: "blur(6px)", whiteSpace: "nowrap", cursor: "help" }}>
              {edgePct(featured.ev.evToCostRatio) >= 0 ? "+" : ""}{edgePct(featured.ev.evToCostRatio).toFixed(1)}% EDGE
            </div>
          </div>
        )}
        {mythic && (
          <div style={{ position: "absolute", top: "64%", left: "12%", zIndex: 4, "--r": "6deg", animation: "pv-floaty-r 9s ease-in-out .6s infinite" } as CSSProperties}>
            <div title={`Rarest card in the featured pool: ${mythic.name}, ${mythic.pct.toFixed(1)}% draw chance in PullEV's model odds (labeled, not real Renaiss odds)`} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#ff5fb4", background: "rgba(12,9,18,.72)", border: "1px solid rgba(255,95,180,.35)", borderRadius: 10, padding: "8px 12px", backdropFilter: "blur(6px)", whiteSpace: "nowrap", cursor: "help" }}>CHASE · {mythic.pct.toFixed(1)}%</div>
          </div>
        )}
        <div style={{ position: "relative", zIndex: 5, maxWidth: 1360, margin: "0 auto", padding: "96px clamp(18px,5vw,40px) 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <div style={{ maxWidth: 720, marginTop: 24 }}>
              <div>
                <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "clamp(64px,9vw,132px)", lineHeight: 0.86, margin: 0, textShadow: "0 8px 60px rgba(0,0,0,.6)" }}>
                  KNOW THE<br />EV BEFORE<br />YOU <span style={{ background: "linear-gradient(115deg,#ff5fb4,#c95cf5 34%,#7b7bff 60%,#4bc6ff 80%,#3ff0cf)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", animation: "pv-shimmer 6s linear infinite" }}>RIP.</span>
                </h1>
              </div>
              <p style={{ maxWidth: 460, fontSize: 17, lineHeight: 1.6, color: "#c3bad8", margin: "26px 0 30px" }}>
                Live expected value on every Infinite Gacha pack, from real Renaiss Index prices, then verify any pull&apos;s fairness yourself, client-side. Trust the math, not the claim.
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Link href="/app" style={{ ...heroBtn, background: GRAD, color: "#08070c" }}>RIP THE FIRST PACK</Link>
                <Link href="/verify" style={{ ...heroBtn, background: "rgba(18,14,26,.55)", color: "#f6f2fb", border: "1px solid rgba(255,255,255,.18)", backdropFilter: "blur(6px)" }}>Verify a pull →</Link>
              </div>
            </div>

            {/* 3D verdict console — REAL featured pack */}
            {featured && (
              <div style={{ perspective: 1600, marginTop: 40 }}>
                <div style={{ position: "relative", width: 420, maxWidth: "88vw", transform: "rotateY(-16deg) rotateX(6deg) rotate(-4deg)", borderRadius: 22, padding: 24, background: "linear-gradient(180deg,rgba(20,16,25,.9),rgba(10,8,15,.92))", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 40px 90px rgba(0,0,0,.6),0 0 60px rgba(123,123,255,.2)", backdropFilter: "blur(10px)", overflow: "hidden", animation: "pv-floaty 8s ease-in-out infinite" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 38, background: "linear-gradient(90deg,rgba(255,95,180,.16),rgba(63,240,207,.12))", mixBlendMode: "screen", filter: "blur(8px)", animation: "pv-scan 4s linear infinite", pointerEvents: "none" }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 34, height: 44, flex: "none" }}><CardArt src={featuredImg} hue={GRAD} radius={6} pad={2} sizes="40px" priority /></div>
                      <div><div style={{ fontFamily: "var(--font-display)", fontSize: 20, lineHeight: 1 }}>{featured.pack.name.toUpperCase()}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#9c94b6", marginTop: 3 }}>renaiss · cost {money(featured.pack.priceUsd)}</div></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(63,240,207,.12)", border: "1px solid rgba(63,240,207,.4)", borderRadius: 999, padding: "5px 11px" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3ff0cf", boxShadow: "0 0 9px #3ff0cf" }} /><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#3ff0cf", letterSpacing: ".08em" }}>{edgePct(featured.ev.evToCostRatio) >= 0 ? "RIP" : "SKIP"}</span></div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#9c94b6" }}>EXPECTED VALUE</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 2 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 66, lineHeight: 0.9 }}>{money(featured.ev.expectedValue)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "#3ff0cf" }}>{edgePct(featured.ev.evToCostRatio) >= 0 ? "+" : ""}{edgePct(featured.ev.evToCostRatio).toFixed(1)}%</div>
                  </div>
                  {/* illustrative value-distribution curve with a cost marker */}
                  <svg viewBox="0 0 380 84" style={{ width: "100%", height: 78, marginTop: 10 }}>
                    <defs>
                      <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#ff5fb4" stopOpacity=".5" />
                        <stop offset="1" stopColor="#ff5fb4" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,74 C46,74 74,20 140,17 C214,14 250,64 320,70 C350,72 368,73 380,73 L380,84 L0,84 Z" fill="url(#heroFill)" />
                    <path d="M0,74 C46,74 74,20 140,17 C214,14 250,64 320,70 C350,72 368,73 380,73" fill="none" stroke="#ff5fb4" strokeWidth="2.4" />
                    <line x1="210" y1="6" x2="210" y2="84" stroke="#3ff0cf" strokeDasharray="3 3" strokeWidth="1.3" />
                    <text x="214" y="16" fontFamily="var(--font-mono)" fontSize="9" fill="#3ff0cf">cost</text>
                  </svg>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <Stat label="P(PROFIT)" value={`${(featured.ev.chanceOfProfit * 100).toFixed(0)}%`} />
                    <Stat label="MEDIAN" value={money(featured.ev.distribution.median)} />
                    <Stat label="TOP" value={money(featured.ev.distribution.p90)} color="#ff5fb4" />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: offline ? "#f0b23f" : "#6f6885", marginTop: 14 }}>
                    {offline ? "bundled snapshot · live engine offline · not financial advice" : "live Renaiss Index prices · not financial advice"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* scroll cue (hidden once the hero stacks, so it never overlaps the console) */}
        <div className="pv-hide-sm" style={{ position: "absolute", bottom: 150, left: "50%", transform: "translateX(-50%)", zIndex: 5, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".3em", color: "#8a83a0", textAlign: "center" }}>
          SCROLL
          <div style={{ width: 1, height: 34, margin: "10px auto 0", background: "linear-gradient(#8a83a0,transparent)" }} />
        </div>
      </div>

      {/* MARQUEE — real edges, governed by a reachable provenance badge */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", borderBottom: "1px solid rgba(255,255,255,.08)", background: "#0b0810", padding: "14px 0", position: "relative", marginTop: -80, display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ flex: "none", paddingLeft: 24, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", color: "#8a83a0", whiteSpace: "nowrap" }}>
          PACK EDGES <span style={{ color: offline ? "#f0b23f" : "#3ff0cf" }}>· {offline ? "snapshot" : "live"}</span>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ display: "flex", width: "max-content", animation: "pv-marquee 26s linear infinite" }}>
            {[0, 1].map((rep) => (
              <div key={rep} style={{ display: "flex", gap: 40, paddingRight: 40, fontFamily: "var(--font-mono)", fontSize: 15 }}>
                {liveEvs.map(({ pack, ev }) => {
                  const e = edgePct(ev.evToCostRatio);
                  return (
                    <span key={pack.id + rep} style={{ color: "#f6f2fb" }}>
                      {pack.name.toUpperCase()} <span style={{ color: e >= 0 ? "#3ff0cf" : "#ff8fa0" }}>{e >= 0 ? "+" : ""}{e.toFixed(1)}%</span>
                      <span style={{ color: "#3a3450", marginLeft: 40 }}>/</span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* REAL RENAISS MARKET INDEX — the ecosystem's own price index (grounded market context) */}
      <MarketIndex tiles={indices.data} />

      {/* TWO QUESTIONS */}
      <div id="how" style={{ maxWidth: 1300, margin: "0 auto", padding: "clamp(56px,9vw,120px) clamp(18px,5vw,40px) 80px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase", color: "#8a83a0", marginBottom: 48 }}>Two questions every ripper asks</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 30, alignItems: "flex-start" }}>
          <QCard n="01" title={<>SHOULD I RIP<br />THIS PACK?</>} body="Live EV from real Renaiss Index card prices under a labeled model pool, with the whole value distribution, not just an average. See your edge, your odds of profit, and the fat tail before you spend a cent. A model estimate, not a claim about Renaiss's own pack." tags={["EV vs cost", "Full distribution", "Oracle prices"]} border="rgba(255,255,255,.09)" glow="rgba(201,92,245,.35)" />
          <div style={{ marginTop: 70, flex: 1, minWidth: "min(340px, 100%)" }}>
            <QCard n="02" title={<>WAS MY<br />PULL FAIR?</>} body="An independent Merkle-proof verifier recomputes your draw's inclusion proof entirely in your browser. If the root matches Renaiss's published commitment, it's provably fair. No server, no trust required." tags={["Client-side", "Merkle proof", "Zero trust"]} border="rgba(63,240,207,.18)" glow="rgba(63,240,207,.28)" />
          </div>
        </div>
      </div>

      {/* CHROME GRAFFITI break */}
      <div style={{ position: "relative", minHeight: "72vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "url('/image_2.webp')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,#08070c 2%,rgba(8,7,12,.6) 40%,rgba(8,7,12,.15) 70%,rgba(8,7,12,.7) 100%)" }} />
        <div style={{ position: "relative", zIndex: 5, maxWidth: 1300, margin: "0 auto", padding: "0 clamp(18px,5vw,40px)", width: "100%" }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase", color: "#3ff0cf", marginBottom: 20 }}>The whole point</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(48px,7vw,96px)", lineHeight: 0.9, margin: 0, textShadow: "0 6px 40px rgba(0,0,0,.7)" }}>TRUST MATH,<br />NOT A CLAIM.</h2>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: "#d3cce4", maxWidth: 460, marginTop: 24 }}>Renaiss commits to a Merkle root before any pack is ripped. PullEV lets you recompute the proof yourself. Fairness you can check beats fairness you&apos;re told about.</p>
          </div>
        </div>
      </div>

      {/* VAULT section */}
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "clamp(64px,9vw,110px) clamp(18px,5vw,40px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 60, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "min(300px, 100%)", position: "relative", display: "flex", justifyContent: "center" }}>
            <div style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(123,123,255,.4),transparent 68%)", filter: "blur(6px)" }} />
            <div style={{ position: "absolute", width: 300, height: 300, border: "1px solid rgba(255,255,255,.1)", borderRadius: "50%", animation: "pv-spin 40s linear infinite" }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/image_3.png" alt="Renaiss vault case" style={{ position: "relative", maxWidth: 400, width: "100%", filter: "drop-shadow(0 30px 60px rgba(0,0,0,.6))", animation: "pv-floaty 9s ease-in-out infinite" }} />
          </div>
          <div style={{ flex: 1, minWidth: "min(300px, 100%)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase", color: "#8a83a0", marginBottom: 18 }}>Vault-backed pool</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(40px,5vw,64px)", lineHeight: 0.94, margin: "0 0 22px" }}>EVERY PULL IS<br />BACKED BY REAL<br />INVENTORY.</h2>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: "#c3bad8", maxWidth: 480 }}>The EV isn&apos;t a vibe. It&apos;s computed against real graded cards, each priced by the Renaiss Index oracle (beta). PullEV reads the same valuations, so the number you see is grounded in real market data.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 30 }}>
              <VaultStat big={`${evs.length}`} small="packs analyzed" />
              <VaultStat big={featured ? `${edgePct(featured.ev.evToCostRatio) >= 0 ? "+" : ""}${edgePct(featured.ev.evToCostRatio).toFixed(0)}%` : "N/A"} small={`top edge (${featured?.pack.name ?? ""})`} color="#3ff0cf" />
              <VaultStat big={offline ? "offline" : "live"} small={offline ? "bundled snapshot" : "oracle sync"} color={offline ? "#f0b23f" : undefined} />
            </div>
          </div>
        </div>
      </div>

      {/* MERKLE explainer — HOW A PROOF CHECKS OUT */}
      <div id="fair" style={{ background: "linear-gradient(180deg,#08070c,#0b0912 50%,#08070c)", borderTop: "1px solid rgba(255,255,255,.06)", borderBottom: "1px solid rgba(255,255,255,.06)", padding: "clamp(64px,9vw,110px) clamp(18px,5vw,40px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase", color: "#8a83a0", marginBottom: 16 }}>Provably fair · client-side</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(40px,5vw,68px)", lineHeight: 0.94, margin: 0 }}>HOW A PROOF CHECKS OUT</h2>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 420 260" style={{ flex: 1, minWidth: "min(340px, 100%)", maxWidth: 460 }}>
              <defs>
                <linearGradient id="rootg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#ff5fb4" />
                  <stop offset="1" stopColor="#3ff0cf" />
                </linearGradient>
              </defs>
              <g stroke="rgba(255,255,255,.14)" strokeWidth="1.5">
                <line x1="210" y1="40" x2="110" y2="110" /><line x1="210" y1="40" x2="310" y2="110" />
                <line x1="110" y1="110" x2="60" y2="190" /><line x1="110" y1="110" x2="160" y2="190" />
                <line x1="310" y1="110" x2="260" y2="190" /><line x1="310" y1="110" x2="360" y2="190" />
              </g>
              <g stroke="#ff5fb4" strokeWidth="2.6"><line x1="210" y1="40" x2="110" y2="110" /><line x1="110" y1="110" x2="60" y2="190" /></g>
              <circle cx="160" cy="190" r="11" fill="#12101a" stroke="rgba(255,255,255,.2)" />
              <circle cx="260" cy="190" r="11" fill="#12101a" stroke="rgba(255,255,255,.2)" />
              <circle cx="360" cy="190" r="11" fill="#12101a" stroke="rgba(255,255,255,.2)" />
              <circle cx="310" cy="110" r="12" fill="#12101a" stroke="rgba(255,255,255,.2)" />
              <circle cx="60" cy="190" r="12" fill="#ff5fb4" />
              <circle cx="110" cy="110" r="13" fill="#c95cf5" />
              <circle cx="210" cy="40" r="15" fill="url(#rootg)" />
              <text x="60" y="224" fontFamily="var(--font-mono)" fontSize="10" fill="#ff5fb4" textAnchor="middle">your leaf</text>
              <text x="210" y="18" fontFamily="var(--font-mono)" fontSize="10" fill="#3ff0cf" textAnchor="middle">root</text>
            </svg>
            <div style={{ flex: 1, minWidth: "min(320px, 100%)", maxWidth: 480, display: "flex", flexDirection: "column", gap: 14 }}>
              <ProofStep n="01" color="#ff5fb4" title="Hash your draw into a leaf" body="Your card, its serial and value become one leaf hash: deterministic and yours alone." />
              <ProofStep n="02" color="#c95cf5" title="Walk the sibling path" body="Combine with each sibling hash up the tree, the proof PullEV recomputes in your browser." />
              <ProofStep n="03" color="#3ff0cf" title="Match the committed root" body="If your recomputed root equals the published one, the pull was fair. Full stop." />
            </div>
          </div>
        </div>
      </div>

      {/* ADVISOR teaser */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(56px,9vw,90px) clamp(18px,5vw,40px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 48, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "min(300px, 100%)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".3em", textTransform: "uppercase", color: "#8a83a0", marginBottom: 18 }}>AI Pull Advisor</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(40px,5vw,64px)", lineHeight: 0.94, margin: "0 0 22px" }}>EVERY VERDICT,<br />IN PLAIN WORDS.</h2>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: "#c3bad8", maxWidth: 460 }}>Ask whether a pack is worth it and the advisor answers with the math: grounded, and citing every number back to the pool, the oracle, or the proof. It refuses anything it can&apos;t source. No hype it can&apos;t back up.</p>
            <Link href="/app" style={{ ...heroBtn, display: "inline-block", marginTop: 24, background: GRAD, color: "#08070c" }}>Ask the advisor →</Link>
          </div>
          <div style={{ flex: 1, minWidth: "min(300px, 100%)", borderRadius: 22, padding: 22, background: "linear-gradient(180deg,#12101a,#0b0912)", border: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <div style={{ background: "rgba(255,95,180,.14)", border: "1px solid rgba(255,95,180,.3)", borderRadius: "14px 14px 4px 14px", padding: "12px 15px", fontSize: 14, maxWidth: "78%" }}>Should I rip {featured?.pack.name ?? "this pack"} right now?</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 34, height: 34, flex: "none", borderRadius: 9, background: GRAD, display: "grid", placeItems: "center", fontFamily: "var(--font-display)", color: "#0b0810", fontSize: 14 }}>EV</div>
              <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)", borderRadius: "14px 14px 14px 4px", padding: "14px 16px", fontSize: 14, lineHeight: 1.6, color: "#e6e0f2", maxWidth: "82%" }}>
                {featured ? (
                  <>EV is <strong style={{ color: "#3ff0cf" }}>{money(featured.ev.expectedValue)} vs {money(featured.pack.priceUsd)} cost, {edgePct(featured.ev.evToCostRatio) >= 0 ? "a +" : "a "}{edgePct(featured.ev.evToCostRatio).toFixed(1)}% edge<sup style={{ color: "#7b7bff" }}>[1]</sup></strong>. {(featured.ev.chanceOfProfit * 100).toFixed(0)}% of pulls profit<sup style={{ color: "#7b7bff" }}>[2]</sup>. Not financial advice.</>
                ) : (
                  "Pick a pack in the app to get a grounded verdict."
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                  {["[1] EV engine", "[2] distribution"].map((t) => (
                    <span key={t} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7b7bff", border: "1px solid rgba(123,123,255,.35)", borderRadius: 6, padding: "3px 8px" }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA + FOOTER */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(140deg,#1a1226,#0b0912 60%)", borderTop: "1px solid rgba(255,255,255,.08)", padding: "clamp(64px,9vw,110px) clamp(18px,5vw,40px) 50px" }}>
        <div style={{ position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)", width: 700, height: 400, background: "radial-gradient(circle,rgba(201,92,245,.3),transparent 65%)" }} />
        <div style={{ position: "relative", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(48px,8vw,110px)", lineHeight: 0.86, margin: 0 }}>RIP WITH THE<br /><span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>RECEIPTS.</span></h2>
          <Link href="/app" style={{ ...heroBtn, display: "inline-block", marginTop: 32, fontSize: 22, background: GRAD, color: "#08070c" }}>LAUNCH PULLEV</Link>
        </div>
        <div style={{ position: "relative", maxWidth: 1200, margin: "80px auto 0", paddingTop: 30, borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 22, height: 22, transform: "rotate(45deg)", borderRadius: 6, background: GRAD }} /><span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>PULLEV</span></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "#8a83a0", maxWidth: 620, textAlign: "right" }}>
            Independent, unofficial tooling for Renaiss · Infinite Gacha · not financial advice. Card names shown for identification only; Pokémon / One Piece marks © their respective owners. Card prices are real Renaiss Index (beta) estimates; the pool membership and draw odds are a labeled PullEV model.
          </div>
        </div>
      </div>
    </div>
  );
}

const navLink: React.CSSProperties = { cursor: "pointer", color: "#b6afc8", textDecoration: "none", whiteSpace: "nowrap" };
const heroBtn: React.CSSProperties = { border: "none", cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 19, letterSpacing: ".03em", padding: "16px 28px", borderRadius: 13, textDecoration: "none", boxShadow: "0 10px 34px rgba(201,92,245,.4)" };

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,.04)", borderRadius: 9, padding: "9px 10px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#9c94b6" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: color ?? "#f6f2fb" }}>{value}</div>
    </div>
  );
}

function ProofStep({ n, color, title, body }: { n: string; color: string; title: string; body: string }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color, minWidth: 34 }}>{n}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 14, color: "#9c94b6", lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}

function VaultStat({ big, small, color }: { big: string; small: string; color?: string }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 16 }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: color ?? "#f6f2fb" }}>{big}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#9c94b6", marginTop: 4 }}>{small}</div>
    </div>
  );
}

function QCard({ n, title, body, tags, border, glow }: { n: string; title: React.ReactNode; body: string; tags: string[]; border: string; glow: string }) {
  return (
    <div style={{ flex: 1, minWidth: "min(340px, 100%)", position: "relative", borderRadius: 24, padding: "clamp(24px,5vw,40px) clamp(20px,4vw,36px)", background: "linear-gradient(160deg,#171020,#0d0912)", border: `1px solid ${border}`, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -60, right: -60, width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle,${glow},transparent 70%)` }} />
      <div style={{ fontFamily: "var(--font-display)", fontSize: 120, lineHeight: 0.8, color: "transparent", WebkitTextStroke: "1.5px rgba(255,255,255,.14)" }}>{n}</div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 38, lineHeight: 1, margin: "18px 0 14px" }}>{title}</h3>
      <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#c3bad8", maxWidth: 420 }}>{body}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
        {tags.map((t, i) => (
          <span key={t} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: i === 0 ? "#3ff0cf" : "#c9c1e0", border: `1px solid ${i === 0 ? "rgba(63,240,207,.35)" : "rgba(255,255,255,.14)"}`, borderRadius: 999, padding: "6px 12px" }}>{t}</span>
        ))}
      </div>
    </div>
  );
}
