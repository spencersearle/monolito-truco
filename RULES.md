# Argentine Truco — Verified Rules Specification

*2 players · first to 30 points · sin flor. Synthesized from 5 independent sources
(cited at the bottom); where sources disagreed, Pagat and Wikipedia were given precedence.
This is the spec the game engine implements, verified by `test_engine.js`.*

## 1. Deck

- Spanish 40-card deck (baraja española): suits **espadas** (swords), **bastos** (clubs),
  **oros** (coins), **copas** (cups).
- Ranks per suit: **1–7, 10 (sota), 11 (caballo), 12 (rey)**. No 8s, 9s, or jokers.

## 2. Card Power Ranking — 14 tiers, highest to lowest

| Tier | Card(s) |
|------|---------|
| 1 | 1 of Espadas (*ancho de espadas*) |
| 2 | 1 of Bastos |
| 3 | 7 of Espadas |
| 4 | 7 of Oros |
| 5 | All 3s |
| 6 | All 2s |
| 7 | 1 of Copas, 1 of Oros (*anchos falsos*, equal) |
| 8 | All 12s (kings) |
| 9 | All 11s (knights) |
| 10 | All 10s (jacks) |
| 11 | 7 of Copas, 7 of Bastos (*sietes falsos*, equal) |
| 12 | All 6s |
| 13 | All 5s |
| 14 | All 4s |

Cards in the same tier are exactly equal; equal cards in a trick produce a **parda** (tie).

## 3. Dealing and Mano

- Each player gets **3 cards**. The non-dealer is **mano**: plays first and wins all ties.
- The deal (and therefore mano) alternates every hand.

## 4. Trick Play

- Up to **3 tricks** per hand; higher-ranked card wins; no suit-following obligation.
- Mano leads trick 1; the **winner of a trick leads the next**; after a parda the same
  leader leads again.
- Play stops as soon as the hand is mathematically decided.

## 5. Winning the Hand & Parda Resolution

First to **2 tricks** wins the hand (1 point if truco was never called). With pardas,
the hand goes to the winner of the **earliest non-tied trick**; if all three tie, **mano wins**:

1. Trick 1 parda → winner of trick 2 takes the hand.
2. Won trick 1, trick 2 parda → trick-1 winner takes the hand immediately.
3. Tricks 1 and 2 both parda → winner of trick 3.
4. Tricks split 1–1, trick 3 parda → trick-1 winner.
5. All three parda → mano.

## 6. Envido

**Value:** cards 1–7 count face value, figures count 0. Two cards of one suit = their
sum **+ 20** (max 33). Three of a suit (sin flor): best two + 20. No pair: highest single card.

**Window:** only during the first trick, only before the caller has played their first
card. An *accepted* truco forecloses envido. **El envido está primero:** answering a
first-trick Truco call with an envido call annuls the truco (it must be re-made later).

**Chain:** raises only by the responder, in order Envido → Envido (once) → Real Envido →
Falta Envido (terminal). Accepted values accumulate:

| Accepted chain | Points |
|---|---|
| Envido | 2 |
| Envido + Envido | 4 |
| Envido + Real Envido | 5 |
| Envido + Envido + Real Envido | 7 |
| Real Envido | 3 |
| … + Falta Envido | falta value |

**Falta Envido:** if both players are in **malas** (< 15), winning it wins the game;
if the leader is in **buenas** (≥ 15), it is worth 30 − leader's score.

**Rejection:** caller scores 1 if it was the chain's first call, otherwise the accumulated
value of the previously accepted calls (e.g. Envido→Envido declined = 2;
Envido→Envido→Real declined = 4).

**Showdown:** mano declares first; **mano wins ties**. Points score immediately;
the hand continues.

## 7. Truco / Retruco / Vale Cuatro

| Level | Accepted: hand worth | Rejected: caller scores |
|---|---|---|
| Truco | 2 | 1 |
| Retruco | 3 | 2 |
| Vale Cuatro | 4 | 3 |

Called on your turn or in response to a pending call. Only the side that said
**quiero** to the previous level may raise to the next. Declining concedes the hand.

## 8. Ir al Mazo (folding)

- Fold in trick 1 with the envido still unsettled: opponent scores **2** (1 envido + 1 truco).
- Otherwise: opponent scores the current truco stake (1/2/3/4).
- Folding with a call pending counts as **no quiero** to that call.

## 9. Flor

Not implemented (standard for 2-player, "sin flor").

## 10. Game End

First to **30 points** wins immediately, even mid-hand. Points 1–15 are *malas*,
16–30 are *buenas*.

---

### Sources

1. [Wikipedia — Truco](https://en.wikipedia.org/wiki/Truco) / [Truco argentino (es)](https://es.wikipedia.org/wiki/Truco_argentino)
2. [Pagat — Argentinean Truco](https://www.pagat.com/put/truco_ar.html)
3. [Envido y Truco — rules](https://www.envidoytruco.com/en/rules/truco-argentino)
4. [Ludoteka — Truco argentino](https://www.ludoteka.com/games/truco-argentino/rules)
5. [Torofun — Truco rules](https://torofun.com/en/truco/rules)

Card visuals reference the **Castilian pattern** (Fournier) baraja española:
[Wikipedia — Spanish-suited playing cards](https://en.wikipedia.org/wiki/Spanish-suited_playing_cards),
[IPCS pattern sheet PS-27](https://i-p-c-s.org/pattern/ps-27.html) — including the
*pinta* border-break system (oros 0, copas 1, espadas 2, bastos 3 breaks) and
traditional pip arrangements, restyled for this game's futuristic theme.
