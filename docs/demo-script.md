# Demo script (about 100 seconds)

One tightly narrated run. Lead with the fairness verifier: it is the differentiator, a tool that audits Renaiss's
own flagship product for fairness, live, in the viewer's own browser. Read the voiceover block verbatim and follow
the on-screen actions beside it. To hit a hard 90 seconds, drop the two parenthetical lines in the hook.

## Setup

- App: https://pullev.vercel.app
- Engine: https://pullev-engine-production.up.railway.app (keep it live so numbers read LIVE, not BUNDLED SNAPSHOT).
- Optional: trigger `POST /api/admin/refresh` a minute before, so prices and the timestamp read freshly updated.
- If the engine is down, do not panic: everything still renders, clearly badged BUNDLED SNAPSHOT, and the verifier
  still works. That fallback is part of the safety design, so it is fine to show.

## Voiceover (read start to finish, about 100 seconds)

> Renaiss's Infinite Gacha is its flagship: perpetual packs of real, vault-backed graded cards. But before you
> pay, you cannot see whether a pack is worth ripping. And when you pull, you are told the draw was fair. Told.
> That is a claim, not proof. PullEV fixes both, and it never asks you to trust us either.
>
> Start with fairness. This is a real pull's Merkle proof, and I am recomputing its root right here in the browser,
> with Web Crypto. Our server is not involved. Green: the root matches, the card really was in the committed pool.
> Now I corrupt one hash. Red, mismatch. One bad byte and the proof collapses. You do not trust PullEV; you trust
> your own math. And notice the labels: this is an example proof over a labeled pool. For a sealed pack like
> Champion, we also show Renaiss's real on-chain Merkle root, read live from their gacha contract on BNB Chain,
> with a BscScan link so you can reproduce it yourself. Real commitment, real chain, zero PullEV trust required.
>
> Now the money question: should you rip? Here is Renaiss's real pack lineup, each showing a live edge, and this timestamp is
> real: prices are re-priced off the Renaiss Index oracle on a schedule, not frozen. Open one and you get expected
> value against cost, the full distribution, chance of profit. Every card shows its source: LIVE for a real Index
> valuation, ASSUMED for a labeled model value. The spread is honest, mostly house edge, because real gacha is.
>
> Want it in plain words? The advisor explains the verdict, and it must cite every number or it refuses. Ask it
> something off-topic and it declines, by design. It ends with "not financial advice." Restraint is the feature.
>
> That is the whole point. Every number on screen traces to a labeled source. It reads Renaiss, it never touches
> your wallet, and it proves fairness instead of claiming it. PullEV makes Infinite Gacha provably fair and
> EV-transparent. Verify any pull yourself, client-side.

## Timed actions

| Time | On screen | Voiceover beat |
| --- | --- | --- |
| 0:00-0:12 | Landing hero at `/`, then click into `/app`. | The hook: flagship product, but no EV up front and fairness is only a claim. |
| 0:12-0:38 | `/verify` on the Champion pack (⛓): show Renaiss's real on-chain root + BscScan audit link, then load EXAMPLE valid, recompute, hash ladder lands green VERIFIED. Switch to EXAMPLE tampered, recompute, red MISMATCH. Point at the EXAMPLE and root labels. | The money shot: Renaiss's real on-chain commitment, plus recompute in the browser, tamper breaks it, labels keep it honest. |
| 0:38-1:00 | Station 01 Floor: the real live Infinite packs (plus the sold-out previous-pack showcase), live edges, the real refresh timestamp on the shelf badge. Open Station 02 X-Ray on a pack: EV vs cost, distribution histogram, the "what is loaded" three-band odds model, per-card LIVE and ASSUMED tags. Optionally hit `/vault` for the full priced card library. | EV transparency: real Index prices, labeled model odds, honest house-edge spread, every card traceable. |
| 1:00-1:22 | Open the advisor orb. Ask "should I rip this pack?" See the cited answer with [1] to [4] chips and "not financial advice." Ask "what is Bitcoin doing?" and it refuses. | Grounded AI: cites every number or refuses; restraint as a feature. |
| 1:22-1:40 | Pan across a screen showing several provenance badges. | Provenance and safety close, then the positioning line. |

## One-line positioning

PullEV makes Renaiss's Infinite Gacha provably fair and EV-transparent. Verify any pull yourself, client-side.
