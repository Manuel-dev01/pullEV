package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strconv"
)

// Merkle scheme — documented and pluggable. This is an ASSUMPTION until Renaiss
// confirms its exact leaf-encoding + hashing at the coaching session. Domain
// separation (distinct prefixes for leaves vs internal nodes) guards against
// second-preimage attacks:
//
//	leaf = SHA256( 0x00 || utf8("cardId:fmv:weight") )
//	node = SHA256( 0x01 || left || right )     (left,right are raw 32-byte digests)
//	odd node counts duplicate the last node up a level.
//
// web/lib/merkle.ts implements this byte-for-byte identically.
const merkleSchemeNote = "ASSUMED SCHEME (pending Renaiss confirmation): SHA-256, domain-separated — " +
	"leaf=SHA256(0x00||\"cardId:fmv:weight\"), node=SHA256(0x01||left||right), odd nodes duplicated."

const rootNote = "Root computed by PullEV over the labeled pool — not Renaiss's on-chain root."

const (
	leafPrefix byte = 0x00
	nodePrefix byte = 0x01
)

// leafPreimageFor is the exact string hashed to form a card's leaf. It commits the
// card's identity AND its odds (fmv+weight) so neither can change post-commitment.
func leafPreimageFor(c Card, weight float64) string {
	return fmt.Sprintf("%s:%s:%s", c.ID, formatNum(c.FMVUsd), formatNum(weight))
}

// formatNum is the canonical number format shared with the TS side (minimal decimal).
func formatNum(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }

func hashLeaf(preimage string) []byte {
	h := sha256.New()
	h.Write([]byte{leafPrefix})
	h.Write([]byte(preimage))
	return h.Sum(nil)
}

func hashNode(left, right []byte) []byte {
	h := sha256.New()
	h.Write([]byte{nodePrefix})
	h.Write(left)
	h.Write(right)
	return h.Sum(nil)
}

// PoolCommitment is a Merkle commitment over a pack's pool (cards sorted by id).
type PoolCommitment struct {
	Root      []byte
	leafOrder []string          // card ids in leaf order
	preimages map[string]string // cardID -> leaf preimage
	leaves    map[string][]byte // cardID -> leaf hash
	levels    [][][]byte        // levels[0] = leaves; last level = [root]
}

// BuildPoolCommitment deterministically builds the Merkle tree over a pool.
func BuildPoolCommitment(pool Pool) PoolCommitment {
	entries := make([]PoolEntry, len(pool.Cards))
	copy(entries, pool.Cards)
	sort.Slice(entries, func(i, j int) bool { return entries[i].Card.ID < entries[j].Card.ID })

	pc := PoolCommitment{
		preimages: make(map[string]string, len(entries)),
		leaves:    make(map[string][]byte, len(entries)),
	}
	level := make([][]byte, 0, len(entries))
	for _, e := range entries {
		pre := leafPreimageFor(e.Card, e.Weight)
		leaf := hashLeaf(pre)
		pc.leafOrder = append(pc.leafOrder, e.Card.ID)
		pc.preimages[e.Card.ID] = pre
		pc.leaves[e.Card.ID] = leaf
		level = append(level, leaf)
	}
	pc.levels = append(pc.levels, level)

	for len(level) > 1 {
		next := make([][]byte, 0, (len(level)+1)/2)
		for i := 0; i < len(level); i += 2 {
			left := level[i]
			right := left // duplicate last if odd
			if i+1 < len(level) {
				right = level[i+1]
			}
			next = append(next, hashNode(left, right))
		}
		pc.levels = append(pc.levels, next)
		level = next
	}
	if len(level) == 1 {
		pc.Root = level[0]
	}
	return pc
}

// ProofFor returns an inclusion proof for a card, or false if not in the pool.
func (pc PoolCommitment) ProofFor(cardID string) (MerkleProof, bool) {
	idx := -1
	for i, id := range pc.leafOrder {
		if id == cardID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return MerkleProof{}, false
	}

	steps := make([]ProofStep, 0, len(pc.levels)-1)
	index := idx
	for lvl := 0; lvl < len(pc.levels)-1; lvl++ {
		level := pc.levels[lvl]
		var sibIdx int
		var pos string
		if index%2 == 0 {
			sibIdx, pos = index+1, "R"
			if sibIdx >= len(level) {
				sibIdx = index // duplicated self
			}
		} else {
			sibIdx, pos = index-1, "L"
		}
		steps = append(steps, ProofStep{Hash: hex.EncodeToString(level[sibIdx]), Position: pos})
		index /= 2
	}

	return MerkleProof{
		LeafPreimage:  pc.preimages[cardID],
		Leaf:          hex.EncodeToString(pc.leaves[cardID]),
		ProofPath:     steps,
		PublishedRoot: hex.EncodeToString(pc.Root),
		SchemeNote:    merkleSchemeNote,
		RootNote:      rootNote,
	}, true
}

// corruptHexChar flips one hex character so a proof deliberately fails to verify.
// Used to build the "tampered" EXAMPLE that demonstrates the MISMATCH state.
func corruptHexChar(s string) string {
	if s == "" {
		return s
	}
	b := []byte(s)
	if b[0] == '0' {
		b[0] = '1'
	} else {
		b[0] = '0'
	}
	return string(b)
}

// VerifyProof recomputes leaf and folds the path, returning whether it reaches the
// published root and the computed root hex. Mirrors what web/lib/merkle.ts does.
func VerifyProof(p MerkleProof) (ok bool, computedRoot string) {
	cur := hashLeaf(p.LeafPreimage)
	if hex.EncodeToString(cur) != p.Leaf {
		return false, hex.EncodeToString(cur) // leaf integrity failed
	}
	for _, step := range p.ProofPath {
		sib, err := hex.DecodeString(step.Hash)
		if err != nil {
			return false, ""
		}
		if step.Position == "L" {
			cur = hashNode(sib, cur)
		} else {
			cur = hashNode(cur, sib)
		}
	}
	computed := hex.EncodeToString(cur)
	return computed == p.PublishedRoot, computed
}
