# PullEV web

Next.js (App Router) frontend for PullEV: the FOIL landing, the Pipeline app (`/app`), the fairness
verifier (`/verify`), the oracle lookup (`/value`), and the grounded advisor route (`/api/advisor`).

See the [root README](../README.md) for the full project overview, architecture, and run instructions,
and [`docs/data-sources.md`](../docs/data-sources.md) for provenance labels.

## Develop

```bash
cp .env.example .env    # set ENGINE_URL and DEEPSEEK_API_KEY
npm install
npm run dev             # http://localhost:3000
```

The app calls the Go engine at `ENGINE_URL`. If the engine is down, it serves the bundled offline
snapshot, badged BUNDLED SNAPSHOT.
