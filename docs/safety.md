# Safety and responsible handling

PullEV is built so that a judge can verify its safety claims, not just read them. Every statement below points
to a file you can open in this repo. The short version: PullEV reads and verifies, it never transacts, it
collects nothing about you, and it never presents a model or an AI answer as a verified fact.

## User data: none collected

- No accounts, login, sessions, cookies, analytics, or tracking. There is no auth code anywhere in the repo.
- No personal data is asked for or stored. The only user input in the whole app is a public grading cert number
  (PSA / CGC / BGS) on the `/value` page, handled by `handleValueCert` in [`engine/main.go`](../engine/main.go).
  A cert number is public information printed on a graded slab, not personal data.
- The app is read-only from the user's side: pick a pack, view EV, paste a proof to verify. Nothing you do is
  recorded server-side.

## Wallet data: never touched

- No wallet connection, no private keys, no seed phrases, no message signing, no transactions. PullEV does not
  move funds or write on-chain.
- There are no wallet or web3 libraries in the project. Check the dependency list in
  [`web/package.json`](../web/package.json): it is Next, React, and Tailwind only.
- This is deliberate scope (see the OUT list in [`CLAUDE.md`](../CLAUDE.md)): PullEV reads Renaiss data and
  verifies fairness math. Transacting is explicitly out of scope.

## API access and secrets: env-only, never committed

- All credentials come from the environment and are never hard-coded. `.env` files are gitignored in every
  location ([`.gitignore`](../.gitignore), [`web/.gitignore`](../web/.gitignore),
  [`engine/.dockerignore`](../engine/.dockerignore)); only `*.env.example` templates are tracked. Confirm with
  `git ls-files | grep .env` (returns only the two example files).
- The DeepSeek advisor key is **server-only**. The advisor runs on the Node runtime and reads
  `process.env.DEEPSEEK_API_KEY` on the server ([`web/app/api/advisor/route.ts`](../web/app/api/advisor/route.ts));
  it is never prefixed `NEXT_PUBLIC_`, so it is never sent to the browser or bundled into client code.
- Renaiss Index credentials are sent only as `X-Api-Key` / `X-Api-Secret` headers to the official oracle, and are
  never logged ([`engine/renaiss_index.go`](../engine/renaiss_index.go)).
- The autonomous-refresh trigger `POST /api/admin/refresh` is disabled by default and only enabled when a
  `REFRESH_TOKEN` is set; callers must present it in the `X-Refresh-Token` header ([`engine/main.go`](../engine/main.go)).
- Rate limits from the Index are handled as soft misses that fall back to cached or committed data, so exhausting a
  quota degrades gracefully instead of failing or exposing anything.

## AI-generated outputs: grounded, cited, and labeled

- The AI Pull Advisor is a grounded assist layer, never an oracle. It receives **only** the computed EV context
  for the current pack (EV, distribution, per-card prices and their provenance), assembled in
  [`web/lib/advisor.ts`](../web/lib/advisor.ts).
- Its system prompt hard-requires that **every sentence cite a number** from that context with a `[1]` to `[4]`
  tag, **refuses** anything not answerable from the context, never presents an estimate as a guaranteed or
  verified fact, and ends with "Not financial advice." Ask it an off-topic question and it declines by design.
- Advisor output is always shown as an AI assist with inline citation chips, so a reader can trace every figure
  back to the underlying number. It is never blended into the app's factual displays.

## Provenance: every number is labeled

The core safety invariant: every number on screen reaches a provenance badge, and nothing that is a model or an
example is ever shown as authoritative. Badges come from
[`web/components/ProvenanceBadge.tsx`](../web/components/ProvenanceBadge.tsx):

- `OFFICIAL` / `LIVE` for real Renaiss Index (beta) valuations.
- `ASSUMED` for a labeled PullEV assumption (for example the representative commons tier).
- `PULLEV MODEL` for pool membership and draw weights (Renaiss exposes no pool or odds API, so these are our
  construction, and they rotate each refresh cycle).
- `BUNDLED SNAPSHOT` when the engine is unreachable and the app serves offline fallback data.
- `EXAMPLE` for the demo Merkle proofs, with the published root labeled "computed by PullEV over the labeled pool,
  not Renaiss's on-chain root."

See [`data-sources.md`](data-sources.md) for the full per-datapoint breakdown of what is real versus modeled.

## Intellectual property

Card names and images are shown for identification only. Pokemon, One Piece, and related marks are the property of
their respective owners. PullEV is independent, unofficial tooling for the Renaiss ecosystem. Not financial advice.
