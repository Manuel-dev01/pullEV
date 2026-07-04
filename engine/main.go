package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// activeAdapter is the single data source for the whole service. Slice 0 uses Mock;
// Slice 3 will let this switch to Public (best-effort scrape) with fallback to Mock.
var activeAdapter PackDataAdapter = NewMockAdapter()

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("GET /api/packs", handlePacks)
	mux.HandleFunc("GET /api/packs/{id}/pool", handlePool)
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
	w.Header().Set("Content-Type", "application/json")
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
