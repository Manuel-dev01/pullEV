import type { MerkleProof, PoolEntry, ProofStep } from "@shared/types";

// Client-side Merkle verifier — byte-for-byte identical scheme to engine/merkle.go.
// Runs in the browser via Web Crypto (SHA-256). This is the whole point of the
// fairness feature: don't trust PullEV's "verified" claim, recompute it yourself.
//
//   leaf = SHA256( 0x00 || utf8("cardId:fmv:weight") )
//   node = SHA256( 0x01 || left || right )
//   odd node counts duplicate the last node up a level.

const enc = new TextEncoder();
const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(new ArrayBuffer(len));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function hashLeaf(preimage: string): Promise<Uint8Array> {
  return sha256(concat(LEAF_PREFIX, enc.encode(preimage)));
}

export async function hashNode(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(NODE_PREFIX, left, right));
}

export interface VerifyStep {
  label: string;
  siblingHash: string;
  position: "L" | "R";
  outputHash: string;
}

export interface VerifyResult {
  /** computed leaf matches the proof's stated leaf */
  leafOk: boolean;
  computedLeaf: string;
  statedLeaf: string;
  /** computed root matches the published root (and leaf integrity held) */
  rootOk: boolean;
  computedRoot: string;
  publishedRoot: string;
  steps: VerifyStep[];
}

/** Recompute a Merkle inclusion proof entirely in-browser. */
export async function verifyInclusion(proof: MerkleProof): Promise<VerifyResult> {
  const leaf = await hashLeaf(proof.leafPreimage);
  const computedLeaf = bytesToHex(leaf);
  const statedLeaf = (proof.leaf ?? "").toLowerCase();
  const leafOk = statedLeaf === "" ? true : computedLeaf === statedLeaf;

  let cur = leaf;
  const steps: VerifyStep[] = [];
  for (const step of proof.proofPath) {
    const sib = hexToBytes(step.hash);
    cur = step.position === "L" ? await hashNode(sib, cur) : await hashNode(cur, sib);
    steps.push({
      label: step.position === "L" ? "H(0x01 ‖ sibling ‖ node)" : "H(0x01 ‖ node ‖ sibling)",
      siblingHash: step.hash,
      position: step.position,
      outputHash: bytesToHex(cur),
    });
  }

  const computedRoot = bytesToHex(cur);
  return {
    leafOk,
    computedLeaf,
    statedLeaf: proof.leaf ?? "",
    rootOk: leafOk && computedRoot === proof.publishedRoot.toLowerCase(),
    computedRoot,
    publishedRoot: proof.publishedRoot,
    steps,
  };
}

// --- commitment builder (mirrors merkle.go) — used to generate EXAMPLE proofs ---

/** Canonical number format shared with the Go side (minimal decimal). */
function formatNum(n: number): string {
  return String(n);
}

export function leafPreimageFor(cardId: string, fmv: number, weight: number): string {
  return `${cardId}:${formatNum(fmv)}:${formatNum(weight)}`;
}

/** Build a pool commitment and return a proof factory. Pure, browser-side. */
export async function buildCommitment(cards: PoolEntry[]): Promise<{
  root: string;
  proofFor: (cardId: string) => MerkleProof | null;
}> {
  const sorted = [...cards].sort((a, b) =>
    a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0,
  );
  const ids = sorted.map((e) => e.card.id);
  const preimages = new Map<string, string>();
  const leavesHex = new Map<string, string>();

  let level: Uint8Array[] = [];
  for (const e of sorted) {
    const pre = leafPreimageFor(e.card.id, e.card.fmvUsd, e.weight);
    const leaf = await hashLeaf(pre);
    preimages.set(e.card.id, pre);
    leavesHex.set(e.card.id, bytesToHex(leaf));
    level.push(leaf);
  }
  const levels: Uint8Array[][] = [level];
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(await hashNode(left, right));
    }
    levels.push(next);
    level = next;
  }
  const root = level.length === 1 ? bytesToHex(level[0]) : "";

  const proofFor = (cardId: string): MerkleProof | null => {
    const idx = ids.indexOf(cardId);
    if (idx < 0) return null;
    const steps: ProofStep[] = [];
    let index = idx;
    for (let lvl = 0; lvl < levels.length - 1; lvl++) {
      const lv = levels[lvl];
      let sibIdx: number;
      let position: "L" | "R";
      if (index % 2 === 0) {
        sibIdx = index + 1;
        position = "R";
        if (sibIdx >= lv.length) sibIdx = index;
      } else {
        sibIdx = index - 1;
        position = "L";
      }
      steps.push({ hash: bytesToHex(lv[sibIdx]), position });
      index = Math.floor(index / 2);
    }
    return {
      leafPreimage: preimages.get(cardId)!,
      leaf: leavesHex.get(cardId)!,
      proofPath: steps,
      publishedRoot: root,
      schemeNote:
        "ASSUMED SCHEME (client-built): SHA-256 domain-separated; leaf=SHA256(0x00||preimage), node=SHA256(0x01||l||r).",
      rootNote:
        "Root computed in your browser over the bundled snapshot pool, not Renaiss's on-chain root.",
    };
  };

  return { root, proofFor };
}

/** Flip one hex char so a proof deliberately fails (the tampered EXAMPLE). */
export function corruptHexChar(s: string): string {
  if (!s) return s;
  const arr = s.split("");
  arr[0] = arr[0] === "0" ? "1" : "0";
  return arr.join("");
}
