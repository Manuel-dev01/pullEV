"use client";

import { useState } from "react";
import type { Draw, MerkleProof } from "@shared/types";
import { verifyInclusion, type VerifyResult } from "@/lib/merkle";

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

const short = (h: string, n = 10) =>
  !h ? "—" : h.length <= n * 2 + 1 ? h : `${h.slice(0, n)}…${h.slice(-6)}`;

type Source = { key: "valid" | "tampered" | "paste"; label: string };
const SOURCES: Source[] = [
  { key: "valid", label: "Example · valid" },
  { key: "tampered", label: "Example · tampered" },
  { key: "paste", label: "Paste your own" },
];

export function ProofVault({
  valid,
  tampered,
  cardName,
}: {
  valid: Draw | null;
  tampered: Draw | null;
  cardName: string | null;
}) {
  const [source, setSource] = useState<Source["key"]>("valid");
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(false);
  const [activeDraw, setActiveDraw] = useState<Draw | null>(null);

  function currentProof(): { proof: MerkleProof; draw: Draw | null } | null {
    if (source === "valid" && valid) return { proof: valid.proof, draw: valid };
    if (source === "tampered" && tampered) return { proof: tampered.proof, draw: tampered };
    if (source === "paste") {
      try {
        const parsed = JSON.parse(pasteText);
        if (!parsed.leafPreimage || !Array.isArray(parsed.proofPath) || !parsed.publishedRoot) {
          throw new Error("need leafPreimage, proofPath[], publishedRoot");
        }
        const proof: MerkleProof = {
          leafPreimage: String(parsed.leafPreimage),
          leaf: parsed.leaf ?? "",
          proofPath: parsed.proofPath,
          publishedRoot: String(parsed.publishedRoot),
          schemeNote: parsed.schemeNote ?? "user-supplied",
          rootNote: parsed.rootNote ?? "user-supplied proof",
        };
        return { proof, draw: null };
      } catch (e) {
        setPasteError((e as Error).message);
        return null;
      }
    }
    return null;
  }

  async function recompute() {
    setPasteError(null);
    const cur = currentProof();
    if (!cur) return;
    setRunning(true);
    setResult(null);
    setRevealed(0);
    setActiveDraw(cur.draw);

    // Recompute entirely in the browser via Web Crypto (SHA-256).
    const r = await verifyInclusion(cur.proof);
    setResult(r);

    // Reveal the ladder step by step for legibility.
    for (let i = 1; i <= r.steps.length; i++) {
      await new Promise((res) => setTimeout(res, 130));
      setRevealed(i);
    }
    setRunning(false);
  }

  const verified = result?.rootOk === true;
  const done = result !== null && !running;

  return (
    <div style={{ color: C.ink }}>
      {/* Trust banner */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: C.teal,
          border: `1px solid rgba(63,240,207,.3)`,
          background: "rgba(63,240,207,.06)",
          borderRadius: 12,
          padding: "10px 14px",
          marginBottom: 20,
        }}
      >
        ⛨ Runs entirely in your browser via Web Crypto (SHA-256). PullEV&apos;s server is not involved in
        this check — recompute it yourself.
      </div>

      {/* Source selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {SOURCES.map((s) => {
          const active = s.key === source;
          return (
            <button
              key={s.key}
              onClick={() => {
                setSource(s.key);
                setResult(null);
                setRevealed(0);
              }}
              style={{
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: ".04em",
                padding: "8px 14px",
                borderRadius: 10,
                color: active ? C.bg : C.ink,
                border: active ? "none" : `1px solid ${C.border}`,
                background: active
                  ? "linear-gradient(115deg,#ff5fb4,#c95cf5 45%,#3ff0cf)"
                  : "transparent",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        {/* LEFT — draw input */}
        <div
          style={{
            flex: "1 1 300px",
            borderRadius: 16,
            padding: 20,
            background: C.panel,
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "#8a83a0",
              marginBottom: 14,
            }}
          >
            Proof input
          </div>

          {source === "paste" ? (
            <>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`{\n  "leafPreimage": "cardId:fmv:weight",\n  "proofPath": [{"hash":"…","position":"R"}],\n  "publishedRoot": "…"\n}`}
                spellCheck={false}
                style={{
                  width: "100%",
                  minHeight: 160,
                  resize: "vertical",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: C.ink,
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: 12,
                }}
              />
              {pasteError && (
                <div style={{ color: C.pink, fontSize: 12, marginTop: 8, fontFamily: "var(--font-mono)" }}>
                  {pasteError}
                </div>
              )}
            </>
          ) : (
            <InputRows draw={source === "valid" ? valid : tampered} cardName={cardName} />
          )}

          <button
            onClick={recompute}
            disabled={running}
            style={{
              width: "100%",
              marginTop: 14,
              border: "none",
              cursor: running ? "default" : "pointer",
              opacity: running ? 0.7 : 1,
              fontFamily: "var(--font-display)",
              fontSize: 16,
              letterSpacing: ".02em",
              color: C.bg,
              padding: 13,
              borderRadius: 11,
              background: "linear-gradient(115deg,#ff5fb4,#c95cf5 45%,#3ff0cf)",
            }}
          >
            {running ? "RECOMPUTING…" : "RECOMPUTE PROOF"}
          </button>
        </div>

        {/* RIGHT — merkle ladder + result */}
        <div
          style={{
            flex: "1.4 1 320px",
            borderRadius: 16,
            padding: 20,
            background: C.panel,
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "#8a83a0",
              marginBottom: 14,
            }}
          >
            Merkle path · recomputed locally
          </div>

          {!result ? (
            <div style={{ color: C.dim, fontFamily: "var(--font-mono)", fontSize: 12, padding: "20px 0" }}>
              Press <span style={{ color: C.muted }}>Recompute proof</span> to hash the path in your browser.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <LadderRow
                mark="L"
                label={`leaf = H(0x00 ‖ "${result.computedLeaf ? proofLeafPreimageLabel(activeDraw) : ""}")`}
                hash={result.computedLeaf}
                ok={result.leafOk}
                shown
              />
              {result.steps.map((s, i) => (
                <LadderRow
                  key={i}
                  mark={s.position}
                  label={`${s.label}  ·  sibling ${short(s.siblingHash, 8)}`}
                  hash={s.outputHash}
                  ok={verified}
                  shown={revealed > i}
                />
              ))}
            </div>
          )}

          {done && result && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 11,
                textAlign: "center",
                background: verified ? "rgba(63,240,207,.08)" : "rgba(255,95,180,.08)",
                border: `1px solid ${verified ? "rgba(63,240,207,.35)" : "rgba(255,95,180,.4)"}`,
                animation: "pv-rise .3s ease",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  color: verified ? C.teal : C.pink,
                }}
              >
                {verified ? "VERIFIED — ROOT MATCH ✓" : "MISMATCH — DO NOT TRUST ✕"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: C.muted, marginTop: 6 }}>
                {verified
                  ? "your browser's recomputed root equals the published root"
                  : !result.leafOk
                    ? "leaf does not match its preimage — the committed card/odds were altered"
                    : "recomputed root differs from the published root"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.dim, marginTop: 8 }}>
                computed {short(result.computedRoot, 12)} · published {short(result.publishedRoot, 12)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function proofLeafPreimageLabel(draw: Draw | null): string {
  return draw?.proof.leafPreimage ?? "cardId:fmv:weight";
}

function InputRows({ draw, cardName }: { draw: Draw | null; cardName: string | null }) {
  if (!draw) {
    return <div style={{ color: C.dim, fontSize: 13 }}>No example available for this pack.</div>;
  }
  const rows: [string, string, string?][] = [
    ["card", cardName ?? draw.cardId, C.ink],
    ["preimage", draw.proof.leafPreimage, C.ink],
    ["leaf", short(draw.proof.leaf, 12), C.pink],
    ["root", short(draw.proof.publishedRoot, 12), C.teal],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, fontFamily: "var(--font-mono)", fontSize: 12 }}>
      {rows.map(([k, v, color]) => (
        <div
          key={k}
          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 12px" }}
        >
          <span style={{ color: C.dim }}>{k.padEnd(9, " ")}</span>
          <span style={{ color: color ?? C.ink, wordBreak: "break-all" }}>{v}</span>
        </div>
      ))}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: draw.label.includes("tampered") ? C.pink : C.muted,
          marginTop: 2,
        }}
      >
        {draw.label} · {draw.proof.rootNote}
      </div>
    </div>
  );
}

function LadderRow({
  mark,
  label,
  hash,
  ok,
  shown,
}: {
  mark: string;
  label: string;
  hash: string;
  ok: boolean;
  shown: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 10,
        opacity: shown ? 1 : 0.25,
        transition: "opacity .2s",
        background: shown ? (ok ? "rgba(63,240,207,.06)" : "rgba(255,95,180,.06)") : "#08070c",
        border: `1px solid ${shown ? (ok ? "rgba(63,240,207,.25)" : "rgba(255,95,180,.25)") : "rgba(255,255,255,.06)"}`,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          flex: "none",
          borderRadius: 6,
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          background: shown ? (ok ? C.teal : C.pink) : "rgba(255,255,255,.08)",
          color: shown ? C.bg : C.dim,
        }}
      >
        {shown ? (ok ? "✓" : "✕") : mark}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            color: "#e6e0f2",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: shown ? (ok ? C.teal : C.pink) : C.dim,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {short(hash, 14)}
        </div>
      </div>
    </div>
  );
}
