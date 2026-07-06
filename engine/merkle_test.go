package main

import (
	"encoding/hex"
	"testing"
)

func poolOf(entries ...PoolEntry) Pool {
	return Pool{PackID: "test", Cards: entries}
}

// flipHexChar returns s with one hex character changed, keeping it valid hex.
func flipHexChar(s string, i int) string {
	b := []byte(s)
	if b[i] == '0' {
		b[i] = '1'
	} else {
		b[i] = '0'
	}
	return string(b)
}

func TestMerkle_AllProofsVerify(t *testing.T) {
	// 5 cards → odd level, exercises the duplicate-last path.
	pool := poolOf(
		entry("a", 25, 20, false),
		entry("b", 90, 6, false),
		entry("c", 110, 5, false),
		entry("d", 320, 2, false),
		entry("e", 600, 1, false),
	)
	pc := BuildPoolCommitment(pool)
	root := hex.EncodeToString(pc.Root)

	for _, e := range pool.Cards {
		proof, ok := pc.ProofFor(e.Card.ID)
		if !ok {
			t.Fatalf("no proof for %s", e.Card.ID)
		}
		verified, computed := VerifyProof(proof)
		if !verified {
			t.Errorf("card %s did not verify (computed %s vs root %s)", e.Card.ID, computed, root)
		}
		if computed != root {
			t.Errorf("card %s computed root %s != %s", e.Card.ID, computed, root)
		}
	}
}

func TestMerkle_TamperFails(t *testing.T) {
	pool := poolOf(
		entry("a", 25, 20, false),
		entry("b", 90, 6, false),
		entry("c", 110, 5, false),
		entry("d", 320, 2, false),
	)
	pc := BuildPoolCommitment(pool)
	proof, _ := pc.ProofFor("b")

	// Sanity: unmodified proof verifies.
	if ok, _ := VerifyProof(proof); !ok {
		t.Fatal("baseline proof should verify")
	}

	// Tamper the published root.
	badRoot := proof
	badRoot.PublishedRoot = flipHexChar(badRoot.PublishedRoot, 0)
	if ok, _ := VerifyProof(badRoot); ok {
		t.Error("tampered root should NOT verify")
	}

	// Tamper a sibling hash.
	if len(proof.ProofPath) > 0 {
		badSib := proof
		badSib.ProofPath = append([]ProofStep(nil), proof.ProofPath...)
		badSib.ProofPath[0].Hash = flipHexChar(badSib.ProofPath[0].Hash, 0)
		if ok, _ := VerifyProof(badSib); ok {
			t.Error("tampered sibling should NOT verify")
		}
	}

	// Tamper the leaf preimage (changing the committed odds) — leaf integrity fails.
	badPre := proof
	badPre.LeafPreimage = proof.LeafPreimage + "x"
	if ok, _ := VerifyProof(badPre); ok {
		t.Error("tampered preimage should NOT verify")
	}
}

func TestMerkle_DeterministicAndOrderIndependent(t *testing.T) {
	a := poolOf(entry("a", 10, 1, false), entry("b", 20, 2, false), entry("c", 30, 3, false))
	b := poolOf(entry("c", 30, 3, false), entry("a", 10, 1, false), entry("b", 20, 2, false))
	if hex.EncodeToString(BuildPoolCommitment(a).Root) != hex.EncodeToString(BuildPoolCommitment(b).Root) {
		t.Fatal("root must be independent of input order")
	}
}

func TestMerkle_TwoCardStructure(t *testing.T) {
	// Root of two sorted leaves must equal hashNode(leaf(min-id), leaf(max-id)).
	pool := poolOf(entry("z", 5, 1, false), entry("a", 9, 2, false))
	pc := BuildPoolCommitment(pool)
	leafA := hashLeaf(leafPreimageFor(Card{ID: "a", FMVUsd: 9}, 2))
	leafZ := hashLeaf(leafPreimageFor(Card{ID: "z", FMVUsd: 5}, 1))
	want := hex.EncodeToString(hashNode(leafA, leafZ)) // "a" < "z"
	if got := hex.EncodeToString(pc.Root); got != want {
		t.Fatalf("2-card root = %s, want %s", got, want)
	}
}

func TestMerkle_SingleCard(t *testing.T) {
	pool := poolOf(entry("solo", 42, 1, false))
	pc := BuildPoolCommitment(pool)
	proof, ok := pc.ProofFor("solo")
	if !ok {
		t.Fatal("no proof for solo")
	}
	if len(proof.ProofPath) != 0 {
		t.Errorf("single-card proof should have 0 steps, got %d", len(proof.ProofPath))
	}
	if verified, _ := VerifyProof(proof); !verified {
		t.Error("single-card proof should verify")
	}
}
