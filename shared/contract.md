# PullEV shared contract

The wire contract between `/engine` (Go) and `/web` (TS). Both languages serialize to the **same JSON
keys**. `shared/types.ts` and `engine/types.go` are mirrors — change one, change the other.

## Envelope
Every data endpoint returns a `Sourced<T>`:
```json
{ "data": <payload>, "provenance": { "source": "...", "fetchedAt": "...", "isOfficial": false, "notes": "..." } }
```

## Endpoints (Slice 0)
| Method | Path                     | Returns                  |
|--------|--------------------------|--------------------------|
| GET    | `/api/health`            | `{ "ok": true, "source": "Mock" }` |
| GET    | `/api/packs`             | `Sourced<Pack[]>`        |
| GET    | `/api/packs/{id}/pool`   | `Sourced<Pool>`          |
| GET    | `/api/draws/{id}`        | `Sourced<Draw>` (used in Slice 2) |

## Provenance is mandatory
No number reaches the UI without a reachable `Provenance`. `isOfficial` is `true` **only** for confirmed
Renaiss-official data. Mock and scraped data are always `false`, with `notes` naming the assumption.

## Key types
See `shared/types.ts` for the authoritative definitions: `SourceKind`, `Provenance`, `Card`, `Pack`,
`Pool`/`PoolEntry`, `Draw`, `MerkleProof`/`ProofStep`, `EVResult`, `Sourced<T>`.
