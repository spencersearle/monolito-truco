/* ============================================================
   MONOLITO · ai4.js
   Bot brain for 4-player team Truco. Same heuristic family as
   El Monolito (ai.js) — hand strength, cheap wins, bluffs —
   extended with partnership awareness: don't waste big cards
   when your partner already holds the trick, answer team calls
   sensibly. Decides one action for a given seat of a Game4.
   Runs host-side only; decisions are replicated like human moves.
   ============================================================ */

const TrucoAI4 = (() => {

  const baseTruco = (typeof Truco !== "undefined") ? Truco : require("./engine.js");
  const base4 = (typeof Truco4 !== "undefined") ? Truco4 : require("./engine4.js");
  const { power, envidoValue } = baseTruco;
  const { teamOf } = base4;

  const rand = () => Math.random();

  /* hand strength 0..1 from card powers (14 max per card) */
  function strength(hand) {
    if (!hand.length) return 0;
    const sorted = hand.map(power).sort((a, b) => b - a);
    const top = sorted[0] / 14;
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length / 14;
    return 0.65 * top + 0.35 * avg;
  }

  /* pick index of lowest card that still beats `target` power; null if none */
  function lowestWinner(hand, target) {
    let best = null;
    hand.forEach((c, i) => {
      const p = power(c);
      if (p > target && (best === null || p < power(hand[best]))) best = i;
    });
    return best;
  }

  function lowestIndex(hand) {
    let best = 0;
    hand.forEach((c, i) => { if (power(c) < power(hand[best])) best = i; });
    return best;
  }

  function highestIndex(hand) {
    let best = 0;
    hand.forEach((c, i) => { if (power(c) > power(hand[best])) best = i; });
    return best;
  }

  /* who currently holds the trick on the table, and at what power */
  function trickState(game, seat) {
    let bestPower = -1, bestSeat = null;
    for (let i = 0; i < 4; i++) {
      const s = (game.leader + i) % 4;
      const c = game.current[s];
      if (c && power(c) > bestPower) { bestPower = power(c); bestSeat = s; }
    }
    const cardsDown = game.current.filter(Boolean).length;
    return {
      bestPower,
      bestSeat,
      partnerHolds: bestSeat !== null && bestSeat !== seat && teamOf(bestSeat) === teamOf(seat),
      lastToPlay: cardsDown === 3,
    };
  }

  /* ---------- decision: {action:'play', index} or {action:<call name>} ---------- */

  function decide(game, seat) {
    const legal = game.legalActions(seat);
    if (!legal.length) return null;

    const hand = game.hands[seat];
    const env = envidoValue(game.initialHands[seat]);
    const str = strength(hand);
    const team = teamOf(seat);
    const tricksWon = game.tricks.filter((t) => t.winner === team).length;
    const tricksLost = game.tricks.filter((t) => t.winner === 1 - team).length;

    /* --- responding to a pending call --- */
    if (game.pending && game.pending.callerTeam !== team) {
      if (game.pending.kind === "envido") {
        return respondEnvido(game, legal, env);
      }
      return respondTruco(game, legal, env, str, tricksWon, tricksLost);
    }

    if (game.pending) return null; // partner called; we wait

    /* --- own turn: maybe call, else play --- */

    // envido calls (window open only in trick 1 before playing; chain opens plain)
    if (legal.includes("Envido")) {
      if (env >= 31 && rand() < 0.85) return { action: "Envido" };
      if (env >= 28 && rand() < 0.7) return { action: "Envido" };
      if (env >= 25 && rand() < 0.3) return { action: "Envido" };
      if (env <= 20 && rand() < 0.1) return { action: "Envido" }; // pure bluff
    }

    // truco escalation
    const trucoCall = ["Truco", "Retruco", "Vale Cuatro"].find((n) => legal.includes(n));
    if (trucoCall) {
      const winningHand = tricksWon > tricksLost && str > 0.45;
      if (str >= 0.78 && rand() < 0.6) return { action: trucoCall };
      if (winningHand && rand() < 0.4) return { action: trucoCall };
      if (str <= 0.3 && tricksWon === 0 && game.tricks.length >= 1 && rand() < 0.15)
        return { action: trucoCall }; // desperation bluff
    }

    /* card play */
    return { action: "play", index: chooseCard(game, seat, hand) };
  }

  function respondEnvido(game, legal, env) {
    const stake = game.envidoChainValue(game.pending.chain);
    // raise with monsters
    if (env >= 31 && legal.includes("Falta Envido") && rand() < 0.3) return { action: "Falta Envido" };
    if (env >= 30 && legal.includes("Real Envido") && rand() < 0.45) return { action: "Real Envido" };
    if (env >= 28 && legal.includes("Envido") && rand() < 0.4) return { action: "Envido" };

    const threshold = stake >= 5 ? 28 : stake >= 3 ? 26 : 24;
    if (env >= threshold) return { action: "quiero" };
    if (env >= threshold - 3 && rand() < 0.4) return { action: "quiero" };
    return { action: "no-quiero" };
  }

  function respondTruco(game, legal, env, str, tricksWon, tricksLost) {
    // "el envido está primero" — sneak the envido in when strong
    if (legal.includes("Envido") && env >= 28 && rand() < 0.75) return { action: "Envido" };

    const level = game.pending.level;
    const raise = ["Retruco", "Vale Cuatro"].find((n) => legal.includes(n));
    const committed = tricksWon > tricksLost;

    if (raise && str >= 0.82 && rand() < 0.5) return { action: raise };
    const threshold = level === 1 ? 0.42 : level === 2 ? 0.55 : 0.65;
    if (str >= threshold || committed) return { action: "quiero" };
    if (rand() < 0.2) return { action: "quiero" }; // call the bluff sometimes
    return { action: "no-quiero" };
  }

  function chooseCard(game, seat, hand) {
    if (hand.length === 1) return 0;
    const { bestPower, bestSeat, partnerHolds, lastToPlay } = trickState(game, seat);
    const trickNum = game.tricks.length; // 0-based
    const team = teamOf(seat);
    const tricksWon = game.tricks.filter((t) => t.winner === team).length;

    if (bestSeat !== null) {
      // someone has played before us
      if (partnerHolds) {
        // partner holds the trick: save ammo unless we're cheap-securing as pie
        if (lastToPlay && bestPower >= 9) return lowestIndex(hand); // partner's 2+ holds
        if (bestPower >= 10) return lowestIndex(hand);              // partner played a 3+
        // partner holds with a weak card — try a cheap improvement
        const win = lowestWinner(hand, bestPower);
        if (win !== null && power(hand[win]) <= 10) return win;
        return lowestIndex(hand);
      }
      // an opponent holds: win as cheaply as possible
      const winner = lowestWinner(hand, bestPower);
      if (winner !== null) return winner;
      // can't win — tie keeps the parda alive for the mano team in trick 1
      const tie = hand.findIndex((c) => power(c) === bestPower);
      if (tie !== -1 && trickNum === 0 && teamOf(game.mano) === team) return tie;
      return lowestIndex(hand);
    }

    // leading
    if (trickNum === 0) {
      // lead second-best to probe, keep the boss card
      const order = hand.map((c, i) => [power(c), i]).sort((a, b) => b[0] - a[0]);
      return order.length >= 2 ? order[1][1] : order[0][1];
    }
    if (tricksWon >= 1) return highestIndex(hand); // close it out
    return highestIndex(hand);                      // must win this one
  }

  return { decide, strength };
})();

if (typeof module !== "undefined" && module.exports) module.exports = TrucoAI4;
