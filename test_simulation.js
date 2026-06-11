/* Full-game fuzz: AI vs random-legal-move "human" for 300 games.
   Catches deadlocks, illegal-state crashes, runaway hands. Run: node test_simulation.js */

global.Truco = require("./engine.js");
const TrucoAI = require("./ai.js");

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let games = 0, totalHands = 0;

for (let g = 0; g < 300; g++) {
  const game = new Truco.Game();
  let steps = 0;

  while (!game.gameOver) {
    if (++steps > 5000) throw new Error(`deadlock: game ${g} exceeded 5000 steps`);
    game.drainEvents();

    if (game.handOver) { totalHands++; game.nextHand(); continue; }

    // whose action?
    let actor = null;
    if (game.pending) actor = Truco.other(game.pending.caller);
    else actor = game.toAct;

    if (actor === "ai") {
      const d = TrucoAI.decide(game);
      if (!d) throw new Error(`AI returned null with legal=${game.legalActions("ai")}`);
      const ok = d.action === "play" ? game.playCard("ai", d.index) : game.call("ai", d.action);
      if (!ok) throw new Error(`AI illegal action ${JSON.stringify(d)} legal=${game.legalActions("ai")}`);
    } else {
      const legal = game.legalActions("you");
      if (!legal.length) throw new Error(`no legal actions for you; pending=${JSON.stringify(game.pending)} toAct=${game.toAct}`);
      const choice = pick(legal);
      const ok = choice === "play"
        ? game.playCard("you", Math.floor(Math.random() * game.hands.you.length))
        : game.call("you", choice);
      if (!ok) throw new Error(`human illegal action ${choice}`);
    }
  }
  games++;
  if (game.scores[game.gameWinner] < 30) throw new Error("game over but winner under 30");
}

console.log(`${games} games completed, ${totalHands} hands, no deadlocks or illegal states`);
