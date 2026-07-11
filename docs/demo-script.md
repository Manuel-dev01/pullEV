# Demo script (about 100 seconds)

One tightly narrated run. Lead with the fairness verifier: it is the differentiator, a tool that audits Renaiss's
own flagship product for fairness, live, in the viewer's own browser, against Renaiss's real on-chain commitment.
Read the voiceover block verbatim and follow the on-screen actions beside it. To hit a hard 90 seconds, drop the
two parenthetical lines in the hook.

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
> Start with fairness, the differentiator. Renaiss commits every sealed pack's card pool as a Merkle root on
> BNB Chain. Here is that real root for the Champion pack, read live from Renaiss's own gacha contract, and this
> BscScan link lets you reproduce it yourself. All twelve sealed packs carry their genuine committed root. Now
> the recompute: this is an example proof over a labeled pool, hashed right here in your browser with Web Crypto,
> our server not involved. Green, the root matches. I corrupt one byte, red, mismatch. The real commitment lives
> on-chain and the math runs in your own machine, so you never trust PullEV. We keep the two clearly separate:
> the on-chain root is real, the recompute is a labeled example, because we cannot fabricate Renaiss's sealed pool.
>
> Now the money question: should you rip? Here is Renaiss's real lineup, three live Infinite packs plus twelve
> sold-out limiteds, each showing a live edge, and the timestamp is real because prices are re-priced off the
> Renaiss Index oracle on a schedule. Open one: expected value against cost, the distribution, chance of profit.
> And every card is a real Renaiss Index valuation, from cheap commons like a $6 Buggy to the rare chase, all
> tagged LIVE. There is no fabricated filler. What is our labeled model is only the odds and which cards make
> up each pack, so this is an EV for a modeled pool, not a measurement of Renaiss's own pack. The spread is an
> honest house edge from real prices. The Vault page lists the whole real card library the packs price from.
>
> And that EV is not a black box. Open the "Under the hood" panel and PullEV shows the exact computation its Go
> engine ran: expected value built up band by band as draw chance times average value, the edge as EV over cost,
> the profit odds, and a SHA-256 fingerprint of the inputs so the same pool always reproduces the same number.
> It is the EV twin of the fairness verifier: don't trust the verdict, read the math that made it.
>
> Want it in plain words? The advisor explains the verdict, and it must cite every number or it refuses. Ask it
> something off-topic and it declines, by design. It ends with "not financial advice." Restraint is the feature.
>
> That is the whole point. Every number on screen traces to a labeled source, model and example data are never
> dressed as fact, it reads Renaiss and never touches your wallet, and it proves fairness against a real on-chain
> root instead of claiming it. PullEV makes Infinite Gacha provably fair and EV-transparent. Verify any pull
> yourself, client-side.

## Timed actions

| Time | On screen | Voiceover beat |
| --- | --- | --- |
| 0:00-0:12 | Landing hero at `/`, then click into `/app`. | The hook: flagship product, but no EV up front and fairness is only a claim. |
| 0:12-0:40 | `/verify` on the Champion pack (marked with a chain icon): show Renaiss's REAL on-chain root + the BscScan "verify it yourself" link, note all twelve sealed packs have one. Then load EXAMPLE valid, recompute, hash ladder lands green VERIFIED. Switch to EXAMPLE tampered, recompute, red MISMATCH. Point at the EXAMPLE vs on-chain labels. | The money shot: Renaiss's real on-chain commitment, plus a client-side recompute; tamper breaks it; labels keep the real root and the example distinct. |
| 0:40-1:02 | Point at the landing's Renaiss market-index strip (real Pokémon / One Piece index + deltas). Then Station 01 Floor: three live Infinite packs plus the sold-out showcase, live edges, real refresh timestamp. Station 02 X-Ray: EV vs cost, distribution, the "what is loaded" three-band model, every card a LIVE Index price. Open the "Under the hood" panel: the glass-box EV computation (band-by-band sum, edge and profit formulas, the inputs fingerprint hash). Optionally `/vault` for the full priced library with real price-history sparklines. | EV transparency: real Index prices on every card, the odds are the only labeled model, and the verdict is a glass-box computation from PullEV's own deterministic Go engine, not a black box. |
| 1:02-1:24 | Open the advisor orb. Ask "should I rip this pack?" See the cited answer with [1] to [4] chips and "not financial advice." Ask "what is Bitcoin doing?" and it refuses. | Grounded AI: cites every number or refuses; restraint as a feature. |
| 1:24-1:40 | Pan across surfaces showing provenance badges (LIVE / ASSUMED / OFFICIAL / on-chain). | Provenance and safety close, then the positioning line. |

## One-line positioning

PullEV makes Renaiss's Infinite Gacha provably fair and EV-transparent. Verify any pull yourself, client-side.
