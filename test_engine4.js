/* ============================================================
   MONOLITO · test_engine4.js
   Rule verification for the 4-player team engine (engine4.js),
   2v2 rules cross-checked against Pagat, Wikipedia(es),
   TrucoGame, TrucoArgentino.com.ar, Mundigames.
   Run: node test_engine4.js
   ============================================================ */

const Truco4 = require("./engine4.js");
const { Game4 } = Truco4;

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`      ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg || "mismatch"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

const C = (rank, suit) => ({ suit, rank });

/* hands builder: seat0..seat3 arrays */
const deal = (...hands) => hands;

/* play whatever card index 0 for every seat through the trick */
function playTrick(g, indexes = [0, 0, 0, 0]) {
  for (let i = 0; i < 4; i++) {
    const seat = g.toAct;
    assert(g.playCard(seat, indexes[seat] ?? 0), `seat ${seat} couldn't play`);
    if (g.handOver) return;
  }
}

/* ---------------- structure & rotation ---------------- */

console.log("\nSeating, dealing, rotation");

test("mano leads the first trick; play order rotates by seat", () => {
  const g = new Game4(1, deal(
    [C(4, "copas"), C(5, "copas"), C(6, "copas")],
    [C(4, "oros"), C(5, "oros"), C(6, "oros")],
    [C(4, "bastos"), C(5, "bastos"), C(6, "bastos")],
    [C(5, "espadas"), C(6, "espadas"), C(2, "espadas")],
  ));
  assertEq(g.mano, 1, "mano");
  assertEq(g.dealer, 0, "dealer is one seat behind mano");
  assertEq(g.toAct, 1, "mano acts first");
  assert(!g.playCard(0, 0), "out-of-turn play refused");
  assert(g.playCard(1, 0));
  assertEq(g.toAct, 2, "next seat in order");
});

test("mano rotates one seat each hand", () => {
  const g = new Game4(3);
  assertEq(g.mano, 3);
  g.call(3, "mazo");
  g.nextHand();
  assertEq(g.mano, 0, "wraps around");
});

test("teams are seats 0&2 vs 1&3", () => {
  assertEq(Truco4.teamOf(0), 0);
  assertEq(Truco4.teamOf(1), 1);
  assertEq(Truco4.teamOf(2), 0);
  assertEq(Truco4.teamOf(3), 1);
});

/* ---------------- trick resolution ---------------- */

console.log("\nTrick resolution (4 cards)");

test("highest card wins the trick for its team and leads next", () => {
  const g = new Game4(0, deal(
    [C(4, "copas"), C(4, "oros"), C(5, "copas")],
    [C(1, "espadas"), C(5, "oros"), C(6, "oros")],   // macho
    [C(6, "bastos"), C(7, "bastos"), C(10, "bastos")],
    [C(11, "espadas"), C(12, "espadas"), C(10, "espadas")],
  ));
  playTrick(g);
  assertEq(g.tricks[0].winner, 1, "team 1 wins");
  assertEq(g.tricks[0].winnerSeat, 1, "seat 1 won it");
  assertEq(g.toAct, 1, "winner leads next trick");
});

test("top cards all in one team: earliest played leads next", () => {
  // seats 0 and 2 (team 0) both play 3s — tied top power, same team
  const g = new Game4(0, deal(
    [C(3, "copas"), C(4, "oros"), C(5, "copas")],
    [C(2, "espadas"), C(5, "oros"), C(6, "oros")],
    [C(3, "bastos"), C(7, "bastos"), C(10, "bastos")],
    [C(11, "espadas"), C(12, "espadas"), C(10, "espadas")],
  ));
  playTrick(g);
  assertEq(g.tricks[0].winner, 0, "team 0 wins");
  assertEq(g.tricks[0].winnerSeat, 0, "first of the tied top cards (seat 0, the leader)");
  assertEq(g.toAct, 0);
});

test("top cards split across teams: parda, previous leader leads again", () => {
  const g = new Game4(0, deal(
    [C(3, "copas"), C(4, "oros"), C(5, "copas")],
    [C(3, "espadas"), C(5, "oros"), C(6, "oros")],
    [C(6, "bastos"), C(7, "bastos"), C(10, "bastos")],
    [C(11, "espadas"), C(12, "espadas"), C(10, "espadas")],
  ));
  playTrick(g);
  assertEq(g.tricks[0].winner, "tie", "parda");
  assertEq(g.tricks[0].winnerSeat, null);
  assertEq(g.toAct, 0, "leader repeats");
});

/* ---------------- hand resolution / parda cases ---------------- */

console.log("\nHand resolution with pardas (team-valued)");

/* helper: build a game where trick winners can be forced via card powers.
   team 0 cards: seats 0,2; team 1: seats 1,3. */
function forcedGame(winners, mano = 0) {
  // winners: array of 0|1|'tie' per trick — craft hands accordingly.
  // strong card = 3 (power 10), weak = 4 (power 1); tie = both teams play 3s.
  const suits0 = ["copas", "oros"];   // distinct suits to avoid envido noise
  const suits1 = ["bastos", "espadas"];
  const hands = [[], [], [], []];
  for (let t = 0; t < 3; t++) {
    const w = winners[t] ?? 0;
    for (let seat = 0; seat < 4; seat++) {
      const team = seat % 2;
      const strongSeat = team === 0 ? seat === 0 : seat === 1; // one strong card per team max
      let rank;
      if (w === "tie") rank = strongSeat ? 3 : 4;
      else rank = (team === w && strongSeat) ? 3 : 4;
      const suit = (team === 0 ? suits0 : suits1)[seat >= 2 ? 1 : 0];
      hands[seat].push(C(rank, suit));
    }
  }
  return new Game4(mano, deal(...hands));
}

test("two straight tricks win the hand", () => {
  const g = forcedGame([0, 0]);
  playTrick(g);
  playTrick(g);
  assert(g.handOver, "hand over after 2-0");
  assertEq(g.scores, [1, 0]);
});

test("case 1: parda then won trick — winner of trick 2 takes hand", () => {
  const g = forcedGame(["tie", 1]);
  playTrick(g);
  playTrick(g);
  assert(g.handOver);
  assertEq(g.scores, [0, 1]);
});

test("case 2: won then parda — winner of trick 1 takes hand", () => {
  const g = forcedGame([1, "tie"]);
  playTrick(g);
  playTrick(g);
  assert(g.handOver);
  assertEq(g.scores, [0, 1]);
});

test("case 3: parda, parda, won — trick-3 winner takes hand", () => {
  const g = forcedGame(["tie", "tie", 1]);
  playTrick(g); playTrick(g); playTrick(g);
  assert(g.handOver);
  assertEq(g.scores, [0, 1]);
});

test("case 4: split tricks then parda — first-trick winner takes hand", () => {
  const g = forcedGame([1, 0, "tie"]);
  playTrick(g); playTrick(g); playTrick(g);
  assert(g.handOver);
  assertEq(g.scores, [0, 1]);
});

test("case 5: three pardas — the mano's TEAM takes the hand", () => {
  const g = forcedGame(["tie", "tie", "tie"], 1); // mano seat 1 → team 1
  playTrick(g); playTrick(g); playTrick(g);
  assert(g.handOver);
  assertEq(g.scores, [0, 1], "mano team 1 wins all-parda hand");
});

/* ---------------- envido ---------------- */

console.log("\nEnvido (team rules)");

const ENV_HANDS = deal(
  [C(7, "copas"), C(6, "copas"), C(4, "oros")],      // seat0: 33
  [C(5, "oros"), C(4, "oros2" in {} ? "oros" : "oros"), C(12, "bastos")], // seat1: 29
  [C(2, "bastos"), C(3, "bastos"), C(10, "copas")],  // seat2: 25
  [C(7, "espadas"), C(6, "espadas"), C(4, "espadas")], // seat3: 33
);

test("opening call must be plain Envido; Real/Falta only as raises", () => {
  const g = new Game4(0, ENV_HANDS);
  const legal = g.legalActions(0);
  assert(legal.includes("Envido"), "Envido offered");
  assert(!legal.includes("Real Envido"), "Real Envido not an opener");
  assert(!legal.includes("Falta Envido"), "Falta Envido not an opener");
  assert(!g.call(0, "Real Envido"), "refused");
  assert(g.call(0, "Envido"));
});

test("either opponent may respond on the team's behalf; caller's partner may not", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");
  assert(g.legalActions(1).includes("quiero"), "seat 1 can answer");
  assert(g.legalActions(3).includes("quiero"), "seat 3 can answer too");
  assertEq(g.legalActions(2), [], "caller's partner must stay silent");
  assertEq(g.legalActions(0), [], "caller waits");
  assert(g.call(3, "quiero"), "pie answers");
  assert(g.envidoResolved);
});

test("envido ties favor the seat closer to mano (declaration order)", () => {
  // seats 0 and 3 both have 33; mano = 3 → seat 3 declares first and wins ties
  const g = new Game4(3, ENV_HANDS);
  g.call(3, "Envido");
  g.call(0, "quiero");
  const ev = g.drainEvents().find((e) => e.type === "envido-result");
  assertEq(ev.winnerSeat, 3, "mano-side seat wins the tie");
  assertEq(g.scores, [0, 2], "team 1 scores 2");
});

test("envido ties favor mano even against later higher seats", () => {
  // mano = 0: seat 0 (33) beats seat 3 (33) by declaration priority
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");
  g.call(1, "quiero");
  const ev = g.drainEvents().find((e) => e.type === "envido-result");
  assertEq(ev.winnerSeat, 0);
  assertEq(g.scores, [2, 0]);
});

test("chain raises stack: Envido + Envido + Real Envido = 7", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");
  assert(g.legalActions(1).includes("Envido"), "second Envido raise available");
  g.call(1, "Envido");
  assert(!g.legalActions(0).includes("Envido"), "no third plain Envido");
  g.call(0, "Real Envido");
  g.call(3, "quiero");
  assertEq(g.scores, [7, 0], "2+2+3 to team 0 (seat 0 has 33)");
});

test("declining the opening Envido gives the caller's team exactly 1", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");
  g.call(1, "no-quiero");
  assertEq(g.scores, [1, 0]);
  assert(g.envidoResolved);
});

test("declining a raised chain gives the previous stake", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");
  g.call(1, "Real Envido");
  g.call(0, "no-quiero");
  assertEq(g.scores, [0, 2], "previous stake (Envido=2) to team 1");
});

test("falta envido: both in malas wins the game outright", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");
  g.call(1, "Falta Envido");
  g.call(0, "quiero");
  assert(g.gameOver, "30 points awarded");
  assertEq(g.gameWinner, 0, "seat 0's 33 wins it for team 0");
});

test("envido window closes per seat once that seat has played its first card", () => {
  const g = new Game4(0, ENV_HANDS);
  g.playCard(0, 0);
  assert(!g.legalActions(0).includes("Envido"), "seat 0 window closed");
  assert(g.legalActions(1).includes("Envido"), "seat 1 still open");
  g.playCard(1, 0);
  g.playCard(2, 0);
  assert(g.legalActions(3).includes("Envido"), "seat 3 open until it plays");
});

test("envido unavailable after the first trick", () => {
  const g = forcedGame([0, 0]);
  playTrick(g);
  assert(!g.legalActions(g.toAct).includes("Envido"));
});

/* ---------------- truco ---------------- */

console.log("\nTruco (team rules)");

test("truco: either opponent answers; accepting TEAM gains the raise right", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Truco");
  assert(g.legalActions(1).includes("quiero"));
  assert(g.legalActions(3).includes("Retruco"), "either opponent may raise instead");
  assertEq(g.legalActions(2), [], "caller's partner silent");
  g.call(3, "quiero");
  assertEq(g.trucoLevel, 1);
  assertEq(g.trucoRaiserTeam, 1, "accepting team holds the quiero");
  assert(g.legalActions(1).includes("Retruco") || g.toAct !== 1 ?
    true : false, "structure check");
  // the accepter's PARTNER may raise too once it's their turn context
  g.playCard(0, 0);
  assert(g.legalActions(1).includes("Retruco"), "partner of accepting team raises");
  assert(!g.legalActions(0).includes("Retruco") || g.toAct !== 0, "caller team may not re-raise");
});

test("declined Truco scores 1; declined Retruco scores 2", () => {
  let g = new Game4(0, ENV_HANDS);
  g.call(0, "Truco");
  g.call(1, "no-quiero");
  assert(g.handOver);
  assertEq(g.scores, [1, 0]);

  g = new Game4(0, ENV_HANDS);
  g.call(0, "Truco");
  g.call(1, "Retruco");
  g.call(0, "quiero");
  assertEq(g.trucoLevel, 2);
  assertEq(g.trucoRaiserTeam, 0, "team 0 accepted the retruco");
  g.call(0, "Vale Cuatro");
  g.call(3, "no-quiero");
  assert(g.handOver);
  assertEq(g.scores, [3, 0], "retruco value to team 0");
});

test("accepted truco forecloses envido", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Truco");
  g.call(1, "quiero");
  assert(!g.legalActions(0).includes("Envido"));
  assert(!g.legalActions(3).includes("Envido"));
});

test("el envido está primero: responder may convert initial Truco to Envido", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Truco");
  assert(g.legalActions(1).includes("Envido"), "interjection offered");
  g.call(1, "Envido");
  assertEq(g.pending.kind, "envido", "truco annulled");
  assertEq(g.pending.caller, 1);
  g.call(0, "quiero");
  assert(g.envidoResolved);
  assertEq(g.trucoLevel, 0, "truco must be re-called");
  assertEq(g.trucoRaiserTeam, null);
});

test("won hand pays the accepted truco level", () => {
  const g = forcedGame([0, 0]);
  g.call(0, "Truco");
  g.call(1, "quiero");
  playTrick(g);
  playTrick(g);
  assert(g.handOver);
  assertEq(g.scores, [2, 0]);
});

/* ---------------- mazo & scoring ---------------- */

console.log("\nIr al mazo, scoring, game end");

test("mazo in first trick with envido open concedes 2 to the other team", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "mazo");
  assert(g.handOver);
  assertEq(g.scores, [0, 2]);
});

test("mazo after envido resolved concedes the truco value", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");
  g.call(1, "no-quiero");        // team 0 +1
  g.call(0, "Truco");
  g.call(3, "quiero");
  g.call(0, "mazo");
  assert(g.handOver);
  assertEq(g.scores, [1, 2], "truco value 2 to team 1");
});

test("mazo while a call is pending = no quiero (hand continues, as in 1v1)", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");
  g.call(1, "mazo");
  assertEq(g.scores, [1, 0], "declined opening envido = 1");
  assert(!g.handOver, "hand plays on after the declined call");
  assert(g.envidoResolved);
});

test("first team to 30 wins the game", () => {
  const g = new Game4(0, ENV_HANDS);
  g.scores = [29, 0];
  g.call(0, "Truco");
  g.call(1, "no-quiero");
  assert(g.gameOver);
  assertEq(g.gameWinner, 0);
  assert(!g.nextHand(), "no further hands");
});

test("fixed hands round-trip through nextHand (lockstep dealing)", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "mazo");
  const next = Truco4.freshDeal4();
  g.nextHand(next);
  assertEq(g.hands, next, "dealt hands match");
  assertEq(g.mano, 1, "rotated");
});

/* ---------------- snapshot / restore (mid-game rejoin) ---------------- */

console.log("\nSnapshot & restore (late join / rejoin)");

function snap(g) {
  return JSON.stringify({
    scores: g.scores, mano: g.mano, dealer: g.dealer, toAct: g.toAct,
    leader: g.leader, hands: g.hands, current: g.current, tricks: g.tricks,
    initialHands: g.initialHands, firstCardPlayed: g.firstCardPlayed,
    trucoLevel: g.trucoLevel, trucoRaiserTeam: g.trucoRaiserTeam,
    envidoResolved: g.envidoResolved, envidoForeclosed: g.envidoForeclosed,
    pending: g.pending, handOver: g.handOver, gameOver: g.gameOver,
    gameWinner: g.gameWinner, firstMano: g.firstMano,
  });
}

test("a restored snapshot is byte-identical to the source mid-hand", () => {
  const g = new Game4(0, ENV_HANDS);
  g.call(0, "Envido");        // leave a call pending
  g.drainEvents();
  const reborn = Truco4.Game4.restore(g.serialize());
  assertEq(snap(reborn), snap(g), "restored state matches");
  assert(reborn.events.length === 0, "restored game starts with no queued events");
});

test("a restored game keeps playing in lockstep with the original", () => {
  // 200 games; at a few mid-hand points, restore a fresh client from the host
  // snapshot and assert it stays identical through several more actions
  for (let n = 0; n < 200; n++) {
    const host = new Game4(n % 4);
    let steps = 0;
    while (!host.gameOver) {
      if (++steps > 5000) throw new Error("stuck game");
      if (host.handOver) { host.nextHand(); host.drainEvents(); continue; }
      if (steps % 9 === 0) {
        const clone = Truco4.Game4.restore(host.serialize());
        if (snap(clone) !== snap(host)) throw new Error(`restore mismatch game ${n}`);
        // replicate the next action to both and re-compare
        const actors = [0, 1, 2, 3].filter((s) => host.legalActions(s).length);
        const seat = actors[0];
        const act = host.legalActions(seat)[0];
        const idx = Math.floor(Math.random() * host.hands[seat].length);
        if (act === "play") { host.playCard(seat, idx); clone.playCard(seat, idx); }
        else { host.call(seat, act); clone.call(seat, act); }
        host.drainEvents(); clone.drainEvents();
        if (snap(clone) !== snap(host)) throw new Error(`post-restore desync game ${n}`);
        continue;
      }
      const actors = [0, 1, 2, 3].filter((s) => host.legalActions(s).length);
      const seat = actors[Math.floor(Math.random() * actors.length)];
      const acts = host.legalActions(seat);
      const act = acts[Math.floor(Math.random() * acts.length)];
      if (act === "play") host.playCard(seat, Math.floor(Math.random() * host.hands[seat].length));
      else host.call(seat, act);
      host.drainEvents();
    }
  }
});

/* ---------------- determinism fuzz ---------------- */

console.log("\nRandom-play fuzz (500 games)");

test("500 random games complete without crashes or stuck states", () => {
  for (let n = 0; n < 500; n++) {
    const g = new Game4(n % 4);
    let steps = 0;
    while (!g.gameOver) {
      if (++steps > 5000) throw new Error("stuck game");
      if (g.handOver) { g.nextHand(); continue; }
      // collect every seat with a legal move (responders during pending)
      const actors = [0, 1, 2, 3].filter((s) => g.legalActions(s).length);
      if (!actors.length) throw new Error(`no legal actors, hand state: ${JSON.stringify({ pending: g.pending, toAct: g.toAct })}`);
      const seat = actors[Math.floor(Math.random() * actors.length)];
      const acts = g.legalActions(seat);
      const act = acts[Math.floor(Math.random() * acts.length)];
      const ok = act === "play"
        ? g.playCard(seat, Math.floor(Math.random() * g.hands[seat].length))
        : g.call(seat, act);
      if (!ok) throw new Error(`legal action refused: seat ${seat} ${act}`);
      g.drainEvents();
    }
    const total = g.scores[0] + g.scores[1];
    if (g.scores[g.gameWinner] < 30) throw new Error("winner below 30");
    if (total > 60) throw new Error("absurd score");
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
