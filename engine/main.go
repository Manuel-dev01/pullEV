package main

import (
	"bufio"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// activeAdapter is the single data source for pool STRUCTURE (which cards are in a pack).
var activeAdapter PackDataAdapter = NewMockAdapter()

// The real Renaiss Index API (beta) client + cache. Grounds per-card FMV in real
// valuations where a card is mapped to a real cert; everything else stays Mock.
// Initialized in main() AFTER loadDotEnv so env-provided keys are picked up (Go
// initializes package-level vars before any init(), so this can't be a var initializer).
var indexClient *IndexClient
var valuationCache *ValuationCache

func main() {
	// Data tooling subcommands (build real pools / refresh prices), then exit.
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "curate":
			runCurate()
			return
		case "refresh":
			runRefresh()
			return
		case "commons":
			runCommons()
			return
		}
	}

	loadDotEnv(".env")
	indexClient = NewIndexClient()
	valuationCache = NewValuationCache(indexClient)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("GET /api/packs", handlePacks)
	mux.HandleFunc("GET /api/packs/{id}/pool", handlePool)
	mux.HandleFunc("GET /api/packs/{id}/ev", handleEV)
	mux.HandleFunc("GET /api/packs/{id}/example-proof", handleExampleProof)
	mux.HandleFunc("GET /api/value/cert/{cert}", handleValueCert)
	mux.HandleFunc("GET /api/draws/{id}", handleDraw)

	addr := ":" + envOr("PORT", "8080")
	handler := withCORS(withLog(mux))

	log.Printf("PullEV engine listening on %s (adapter=%s)", addr, activeAdapter.Source())
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":     true,
		"source": activeAdapter.Source(),
	})
}

func handlePacks(w http.ResponseWriter, r *http.Request) {
	packs, prov, err := activeAdapter.ListPacks(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, Sourced[[]Pack]{Data: packs, Provenance: prov})
}

func handlePool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	pool, prov, err := activeAdapter.GetPool(r.Context(), id)
	if err != nil {
		writeError(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusOK, Sourced[Pool]{Data: pool, Provenance: prov})
}

func handleEV(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	pool, poolProv, err := activeAdapter.GetPool(r.Context(), id)
	if err != nil {
		writeError(w, statusFor(err), err)
		return
	}
	packs, packProv, err := activeAdapter.ListPacks(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	var pack *Pack
	for i := range packs {
		if packs[i].ID == id {
			pack = &packs[i]
			break
		}
	}
	if pack == nil {
		writeError(w, http.StatusNotFound, ErrNotFound)
		return
	}

	in := EVInput{
		PackID:            id,
		Cost:              pack.PriceUsd,
		Cards:             pool.Cards,
		PriceIsAssumption: pack.PriceIsAssumption,
	}
	// Inner sources = the input provenances that fed the math.
	result := ComputeEV(in, []Provenance{poolProv, packProv}, time.Now())

	// Outer provenance describes the computation itself (not a data fetch).
	outProv := Provenance{
		Source:     activeAdapter.Source(),
		FetchedAt:  time.Now().UTC().Format(time.RFC3339),
		IsOfficial: false,
		Notes: "EV computed by the PullEV engine from " + string(activeAdapter.Source()) +
			" inputs. Informational only. Not financial advice.",
	}
	writeJSON(w, http.StatusOK, Sourced[EVResult]{Data: result, Provenance: outProv})
}

// handleExampleProof builds a real Merkle inclusion proof over the pack's committed
// pool and returns it as clearly-labeled EXAMPLE data (never a real Renaiss draw).
// variant=tampered deliberately corrupts one hash so the client verification fails.
func handleExampleProof(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	variant := r.URL.Query().Get("variant")
	if variant != "tampered" {
		variant = "valid"
	}

	pool, _, err := activeAdapter.GetPool(r.Context(), id)
	if err != nil {
		writeError(w, statusFor(err), err)
		return
	}
	if len(pool.Cards) == 0 {
		writeError(w, http.StatusNotFound, ErrNotFound)
		return
	}

	pc := BuildPoolCommitment(pool)
	// Pick the highest-FMV card (the "chase") — the most compelling thing to prove was committed.
	chase := pool.Cards[0]
	for _, e := range pool.Cards {
		if e.Card.FMVUsd > chase.Card.FMVUsd {
			chase = e
		}
	}
	proof, ok := pc.ProofFor(chase.Card.ID)
	if !ok {
		writeError(w, http.StatusInternalServerError, ErrNotFound)
		return
	}

	label := "EXAMPLE · not a real Renaiss draw"
	note := "Demonstration proof over the labeled pool. PullEV does not sell packs or perform real draws."
	if variant == "tampered" {
		if len(proof.ProofPath) > 0 {
			proof.ProofPath[0].Hash = corruptHexChar(proof.ProofPath[0].Hash)
		} else {
			proof.PublishedRoot = corruptHexChar(proof.PublishedRoot)
		}
		label = "EXAMPLE (tampered) · should FAIL verification"
		note = "Deliberately corrupted proof: recomputation must NOT match the root. Demonstrates MISMATCH."
	}

	draw := Draw{
		ID:        "example-" + id + "-" + variant,
		PackID:    id,
		CardID:    chase.Card.ID,
		Proof:     proof,
		IsExample: true,
		Label:     label,
	}
	prov := Provenance{
		Source:     activeAdapter.Source(),
		FetchedAt:  time.Now().UTC().Format(time.RFC3339),
		IsOfficial: false,
		Notes:      "EXAMPLE proof built by PullEV over the " + string(activeAdapter.Source()) + " pool. " + note,
	}
	writeJSON(w, http.StatusOK, Sourced[Draw]{Data: draw, Provenance: prov})
}

// handleValueCert returns a real Renaiss Index valuation for a cert number, with
// live → cache → committed-seed fallback. Always 200 (found flag lives in the body)
// so the UI can show a graceful "not found" rather than erroring.
func handleValueCert(w http.ResponseWriter, r *http.Request) {
	cert := r.PathValue("cert")
	v, prov, _ := valuationCache.Get(r.Context(), cert)
	writeJSON(w, http.StatusOK, Sourced[Valuation]{Data: v, Provenance: prov})
}

func handleDraw(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	draw, prov, err := activeAdapter.GetDraw(r.Context(), id)
	if err != nil {
		writeError(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusOK, Sourced[Draw]{Data: draw, Provenance: prov})
}

// --- helpers ---

func statusFor(err error) int {
	if err == ErrNotFound {
		return http.StatusNotFound
	}
	return http.StatusBadGateway
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode error: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// loadDotEnv loads KEY=VALUE lines from a .env file into the process environment
// without overriding vars already set. Best-effort: a missing file is fine (the
// engine runs on the public Renaiss Index tier without keys). Secrets never logged.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if _, exists := os.LookupEnv(k); !exists {
			os.Setenv(k, v)
		}
	}
}

// withCORS allows the configured web origin(s). Default covers local dev; set
// WEB_ORIGIN (comma-separated) in production (e.g. the Vercel URL).
func withCORS(next http.Handler) http.Handler {
	allowed := strings.Split(envOr("WEB_ORIGIN", "http://localhost:3000,http://127.0.0.1:3000"), ",")
	allowedSet := make(map[string]bool, len(allowed))
	for _, o := range allowed {
		allowedSet[strings.TrimSpace(o)] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowedSet[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}
