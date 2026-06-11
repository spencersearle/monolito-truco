/* ============================================================
   MONOLITO · test_multiplayer_sim.js
   Lockstep-replication fuzz test for online play.

   Online games run a full engine in BOTH browsers: the host's
   instance has seats {you: host, ai: guest}; the guest's mirror
   has {you: guest, ai: host}. The host deals (broadcasting the
   hands) and every action is applied locally then replicated.
   This test simulates that exact protocol with random legal
   actions and asserts the two instances never fall out of sync.

   Run: node test_multiplayer_sim.js
   ============================================================ */

const Truco = require("./engine.js");
const { Game, freshDeal, other } = Truco;

const GAMES = 200;
const MAX_STEPS = 5000;

const flip = (p) => (p == null ? p : other(p));

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* assert the guest mirror is an exact seat-swapped copy of the host game */
function assertMirrored(host, guest, gameNo, step) {
  const fail = (what, h, g) => {
    throw new Error(
      `game ${gameNo} step ${step}: desync on ${what} — host=${JSON.stringify(h)} guest=${JSON.stringify(g)}`
    );
  };

  if (host.scores.you !== guest.scores.ai || host.scores.ai !== guest.scores.you)
    fail("scores", host.scores, guest.scores);
  if (host.trucoLevel !== guest.trucoLevel) fail("trucoLevel", host.trucoLevel, guest.trucoLevel);
  if (flip(host.trucoRaiser) !== guest.trucoRaiser) fail("trucoRaiser", host.trucoRaiser, guest.trucoRaiser);
  if (host.tricks.length !== guest.tricks.length) fail("tricks.length", host.tricks.length, guest.tricks.length);
  if (host.handOver !== guest.handOver) fail("handOver", host.handOver, guest.handOver);
  if (host.gameOver !== guest.gameOver) fail("gameOver", host.gameOver, guest.gameOver);
  if (flip(host.gameWinner) !== guest.gameWinner) fail("gameWinner", host.gameWinner, guest.gameWinner);
  if (flip(host.mano) !== guest.mano) fail("mano", host.mano, guest.mano);
  if (host.envidoResolved !== guest.envidoResolved) fail("envidoResolved", host.envidoResolved, guest.envidoResolved);

  if (!host.handOver && !host.gameOver) {
    if (flip(host.toAct) !== guest.toAct) fail("toAct", host.toAct, guest.toAct);
    const hp = host.pending, gp = guest.pending;
    if (!!hp !== !!gp) fail("pending presence", hp, gp);
    if (hp) {
      if (hp.kind !== gp.kind) fail("pending.kind", hp.kind, gp.kind);
      if (flip(hp.caller) !== gp.caller) fail("pending.caller", hp.caller, gp.caller);
      if (hp.kind === "envido" && hp.chain.join() !== gp.chain.join())
        fail("pending.chain", hp.chain, gp.chain);
    }
  }

  for (let i = 0; i < host.tricks.length; i++) {
    if (flip(host.tricks[i].winner === "tie" ? null : host.tricks[i].winner) !==
        (guest.tricks[i].winner === "tie" ? null : guest.tricks[i].winner))
      fail(`tricks[${i}].winner`, host.tricks[i].winner, guest.tricks[i].winner);
  }

  // hand contents (seat-swapped)
  const key = (c) => `${c.suit}${c.rank}`;
  if (host.hands.you.map(key).join() !== guest.hands.ai.map(key).join())
    fail("host hand", host.hands.you, guest.hands.ai);
  if (host.hands.ai.map(key).join() !== guest.hands.you.map(key).join())
    fail("guest hand", host.hands.ai, guest.hands.you);
}

let totalHands = 0;

for (let g = 1; g <= GAMES; g++) {
  // host begins: deal + coin flip for mano, exactly like ui.js hostBegin()
  const fixed = freshDeal();
  const mano = Math.random() < 0.5 ? "you" : "ai";
  const host = new Game(mano, fixed);
  const guest = new Game(flip(mano), { you: fixed.ai, ai: fixed.you });
  host.drainEvents();
  guest.drainEvents();

  let steps = 0;
  while (!host.gameOver) {
    if (++steps > MAX_STEPS) throw new Error(`game ${g}: exceeded ${MAX_STEPS} steps (deadlock)`);

    if (host.handOver) {
      // host deals the next hand and "broadcasts" it
      totalHands++;
      const next = freshDeal();
      host.nextHand(next);
      guest.nextHand({ you: next.ai, ai: next.you });
      host.drainEvents();
      guest.drainEvents();
      assertMirrored(host, guest, g, steps);
      continue;
    }

    // whose turn (host coordinates)?
    const actorSeat = host.pending ? other(host.pending.caller) : host.toAct;
    // each player consults their OWN engine, exactly like the real clients
    const actorGame = actorSeat === "you" ? host : guest;
    const mirrorGame = actorSeat === "you" ? guest : host;

    const legal = actorGame.legalActions("you");
    if (!legal.length) throw new Error(`game ${g} step ${steps}: no legal actions for ${actorSeat}`);

    const action = rand(legal);
    let ok1, ok2;
    if (action === "play") {
      const index = Math.floor(Math.random() * actorGame.hands.you.length);
      ok1 = actorGame.playCard("you", index);
      ok2 = mirrorGame.playCard("ai", index); // the replicated message
    } else {
      ok1 = actorGame.call("you", action);
      ok2 = mirrorGame.call("ai", action);
    }
    if (!ok1 || !ok2) throw new Error(`game ${g} step ${steps}: action ${action} rejected (local=${ok1} remote=${ok2})`);

    host.drainEvents();
    guest.drainEvents();
    assertMirrored(host, guest, g, steps);
  }

  totalHands++;
  if (host.scores[host.gameWinner] < 30) throw new Error(`game ${g}: winner below 30`);
  assertMirrored(host, guest, g, steps);
}

console.log(`${GAMES} lockstep games completed, ${totalHands} hands, host and guest never desynced`);
