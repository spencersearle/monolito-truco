# MONOLITO · Truco Argentino

A fully playable **Argentine Truco** card game in the browser — you against
**El Monolito**, an AI that bluffs. Futuristic midnight-blue table, flowing gold
waves, 3D card interactions, and a hand-drawn SVG Spanish deck.

**▶ Play it: https://spencer16078-cyber.github.io/monolito-truco/**

![Truco](trucoCardSheet.jpg)

## The game

- **2-player Truco** (you vs AI), first to **30 points**, sin flor
- Full **envido** system: Envido, Envido-Envido, Real Envido, Falta Envido with
  malas/buenas math, mano-wins-ties, "el envido está primero"
- Full **truco** escalation: Truco → Retruco → Vale Cuatro, with the
  quiero-side-raises rule
- **Ir al mazo** (folding), all five **parda** (tied-trick) resolution cases
- Rules verified against 5 independent sources — see [RULES.md](RULES.md)
- 56-test rule suite: `node test_engine.js`

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
| `engine.js` | Pure rules engine (no DOM — also runs in Node) |
| `ai.js` | El Monolito: heuristic opponent with bluffing |
| `ui.js` | Animation queue, event presentation, game flow |
| `test_engine.js` | Rule verification suite |
| `RULES.md` | The verified rules spec with sources |
| `truco_game.py` | The original tkinter prototype this project grew from |

Built for the CS 111 free coding project.
