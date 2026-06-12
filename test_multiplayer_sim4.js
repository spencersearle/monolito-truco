/* ============================================================
   MONOLITO · test_multiplayer_sim4.js
   Lockstep-replication fuzz test for 2v2 online play.
   Four engines (the host's plus three guests') play full games
   through the real protocol shape: every action is applied to
   the host's engine first (host-authoritative ordering), then
   replicated to each guest as an {seat, action} broadcast; the
   host deals every hand and broadcasts the fixed deal. After
   every step all four engines must hold identical state.
   Run: node test_multiplayer_sim4.js
   ============================================================ */

const Truco4 = require("./engine4.js");
const { Game4, freshDeal4 } = Truco4;

const GAMES = 200;

function snapshot(g) {
  return JSON.stringify({
    scores: g.scores,
    mano: g.mano,
    dealer: g.dealer,
    toAct: g.toAct,
    leader: g.leader,
    hands: g.hands,
    current: g.current,
    tricks: g.tricks,
    trucoLevel: g.trucoLevel,
    trucoRaiserTeam: g.trucoRaiserTeam,
    envidoResolved: g.envidoResolved,
    envidoForeclosed: g.envidoForeclosed,
    pending: g.pending,
    handOver: g.handOver,
    gameOver: g.gameOver,
    gameWinner: g.gameWinner,
  });
}

function assertSynced(engines, where) {
  const ref = snapshot(engines[0]);
  for (let i = 1; i < 4; i++) {
    if (snapshot(engines[i]) !== ref) {
      throw new Error(`DESYNC at ${where}: engine ${i} diverged\nhost:  ${ref}\nguest: ${snapshot(engines[i])}`);
    }
  }
}

let totalHands = 0;

for (let n = 0; n < GAMES; n++) {
  const mano = n % 4;
  const fixed = freshDeal4();
  // host engine + 3 guest engines, all absolute seats (no mirroring in 2v2)
  const engines = [0, 1, 2, 3].map(() =>
    new Game4(mano, fixed.map((h) => h.map((c) => ({ ...c })))));
  engines.forEach((g) => g.drainEvents());

  let steps = 0;
  while (!engines[0].gameOver) {
    if (++steps > 6000) throw new Error("stuck game");
    const host = engines[0];

    if (host.handOver) {
      // host deals and broadcasts; guests apply the same fixed deal
      const deal = freshDeal4();
      for (const g of engines) g.nextHand(deal.map((h) => h.map((c) => ({ ...c }))));
      totalHands++;
      engines.forEach((g) => g.drainEvents());
      assertSynced(engines, `game ${n} new hand`);
      continue;
    }

    // pick a random seat with a legal action (during a pending call both
    // members of the responding team may race — pick either, like real play)
    const actors = [0, 1, 2, 3].filter((s) => host.legalActions(s).length);
    if (!actors.length) throw new Error(`game ${n}: nobody can act`);
    const seat = actors[Math.floor(Math.random() * actors.length)];
    const acts = host.legalActions(seat);
    const name = acts[Math.floor(Math.random() * acts.length)];
    const a = name === "play"
      ? { kind: "play", index: Math.floor(Math.random() * host.hands[seat].length) }
      : { kind: "call", name };

    // host-authoritative: validate + apply on the host first…
    const ok = a.kind === "play" ? host.playCard(seat, a.index) : host.call(seat, a.name);
    if (!ok) throw new Error(`game ${n}: host rejected a legal action ${JSON.stringify(a)}`);

    // …then broadcast to every guest
    for (let i = 1; i < 4; i++) {
      const g = engines[i];
      const applied = a.kind === "play" ? g.playCard(seat, a.index) : g.call(seat, a.name);
      if (!applied) throw new Error(`game ${n}: guest ${i} rejected replicated action ${JSON.stringify(a)}`);
    }

    engines.forEach((g) => g.drainEvents());
    assertSynced(engines, `game ${n} step ${steps}`);
  }
  totalHands++;
}

console.log(`${GAMES} lockstep 2v2 games completed, ${totalHands} hands, host and all 3 guests never desynced`);
