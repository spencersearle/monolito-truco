# MONOLITO · Truco Argentino

A fully playable **Argentine Truco** card game in the browser — face the
bluffing AI **El Monolito**, duel a friend **online 1v1**, or gather a table
for **2v2 team play** with a share link, player names, bot fill-ins, and a
table-talk chat. Futuristic midnight-blue table, flowing gold waves, 3D card
interactions, and a hand-drawn SVG Spanish deck. Works on desktop, phones,
and tablets.

**▶ Play it: https://spencersearle.github.io/monolito-truco/**

![Truco](trucoCardSheet.jpg)

## The game

- **Truco for 2 or 4** (vs AI, 1v1 online, or 2v2 in teams), first to **30 points**, sin flor
- Full **envido** system: Envido, Envido-Envido, Real Envido, Falta Envido with
  malas/buenas math, mano-wins-ties, "el envido está primero"
- Full **truco** escalation: Truco → Retruco → Vale Cuatro, with the
  quiero-side-raises rule
- **Ir al mazo** (folding), all five **parda** (tied-trick) resolution cases
- Rules verified against 5 independent sources — and the **2v2 team rules**
  against 5 more — see [RULES.md](RULES.md)
- 101 engine tests: `node test_engine.js` (1v1) + `node test_engine4.js` (2v2)

## Play online

Hit **PLAY ONLINE** on the title screen, type your name, and pick a table:

- **1 vs 1** — the game opens a private table and shows a short **table code**.
  Tell a friend the code; the moment they're in, the cards fly.
- **2 vs 2** — share one code with up to three friends; the lobby seats them
  into alternating teams as they arrive. Short of players? Fill any empty
  seat with a **bot** (any human/bot mix that adds up to 4 works). If someone
  drops mid-game, a bot quietly takes over their seat so the hand plays on.
- **Join (or rejoin) by code** — hit **JOIN GAME**, type the table code, and
  sit down. The same code is the way back in after a dropped connection or even
  after you exit: the host pauses, you re-enter the code, and the hand picks up
  **exactly where it left off** — in 1v1 the host streams you a state snapshot;
  in 2v2 you reclaim the bot holding your seat. No new code needed. (A shareable
  link still works too, and the mode is detected automatically on connect.)
- **Table talk** — a built-in chat works in the lobby and at the table. New
  messages pop a toast with the sender's name and a count on the chat icon, in
  both modes.
- **Change your name anytime** — rename yourself in the lobby or mid-game with
  the ✎ button; the new name updates on every screen.

Under the hood:

- Peer-to-peer over WebRTC ([PeerJS](https://peerjs.com), vendored), so the
  whole site still ships as static files on GitHub Pages — no game server
- Every browser runs the full rules engine in lockstep: the host deals and
  broadcasts the hands, and every action is replicated. In 2v2 the host is
  authoritative — guests send intents, the host validates, applies, and
  broadcasts, so four screens can never disagree on the order of play
- Rejoin works mid-hand in both modes: the host streams the joiner a full
  **state snapshot** (`Game.serialize()` + `mirror()` for 1v1, `Game4.serialize()`
  for 2v2) and they continue in lockstep from the next action. A lightweight
  heartbeat detects a silently dropped peer within a few seconds, so the host
  pauses (1v1) or hands the seat to a bot (2v2) almost immediately
- Fuzz-tested for sync: `node test_multiplayer_sim.js` (200 1v1 games across
  two mirrored engines) and `node test_multiplayer_sim4.js` (200 2v2 games
  across four engines) assert the replicas never diverge

## The cards

All 40 cards of the baraja española are drawn programmatically in SVG
(`cards.js`), keeping authentic Castilian-pattern details — the **pinta**
border-breaks that identify each suit (oros 0, copas 1, espadas 2, bastos 3)
and traditional pip arrangements — restyled in navy and gold.

## Run locally

No build step, no dependencies:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `styles.css` | Midnight-holotable theme: blue gradients, gold waves, 3D table |
| `cards.js` | SVG renderer for the 40-card Spanish deck |
| `engine.js` | Pure 1v1 rules engine (no DOM — also runs in Node) |
| `engine4.js` | 2v2 team rules engine: 4 seats, team tricks/envido/truco |
| `ai.js` | El Monolito: heuristic opponent with bluffing |
| `ai4.js` | Team-aware bots for 2v2 (don't trump the partner's winner) |
| `net.js` | PeerJS transport: 1v1 link + 2v2 star room with host relay |
| `peerjs.min.js` | Vendored PeerJS 1.5.5 |
| `ui.js` | Animation queue, presenters (1v1 + 2v2), lobby, chat, game flow |
| `test_engine.js` | 1v1 rule verification suite (66 tests, incl. snapshot/mirror/restore) |
| `test_engine4.js` | 2v2 team-rule verification suite (35 tests, incl. snapshot/restore) |
| `test_multiplayer_sim.js` | Lockstep-replication fuzz test for 1v1 online |
| `test_multiplayer_sim4.js` | Lockstep fuzz for 2v2: host + 3 guest engines |
| `RULES.md` | The verified rules spec with sources |
| `truco_game.py` | The original tkinter prototype this project grew from |

Built for the CS 111 free coding project.
