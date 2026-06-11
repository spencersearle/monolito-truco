/* ============================================================
   MONOLITO · ai.js
   "El Monolito" — heuristic AI opponent with a taste for bluffing.
   Decides one action for the 'ai' player given the engine state.
   ============================================================ */

const TrucoAI = (() => {

  const { power, envidoValue } = Truco;

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

  /* ---------- decision: returns {action:'play', index} or {action:<call name>} ---------- */

  function decide(game) {
    const legal = game.legalActions("ai");
    if (!legal.length) return null;

    const hand = game.hands.ai;
    const env = envidoValue(game.initialHands.ai);
    const str = strength(hand);
    const tricksWon = game.tricks.filter((t) => t.winner === "ai").length;
    const tricksLost = game.tricks.filter((t) => t.winner === "you").length;

    /* --- responding to a pending call --- */
    if (game.pending && game.pending.caller === "you") {
      if (game.pending.kind === "envido") {
        return respondEnvido(game, legal, env);
      }
      return respondTruco(game, legal, str, tricksWon, tricksLost);
    }

    /* --- own turn: maybe call, else play --- */

    // envido calls (window open only in trick 1 before playing)
    if (legal.includes("Envido")) {
      if (env >= 31 && rand() < 0.85) return { action: rand() < 0.4 ? "Real Envido" : "Envido" };
      if (env >= 28 && rand() < 0.7) return { action: "Envido" };
      if (env >= 25 && rand() < 0.35) return { action: "Envido" };
      if (env <= 20 && rand() < 0.12) return { action: "Envido" }; // pure bluff
    }

    // truco escalation
    const trucoCall = ["Truco", "Retruco", "Vale Cuatro"].find((n) => legal.includes(n));
    if (trucoCall) {
      const winningHand = tricksWon > tricksLost && str > 0.45;
      if (str >= 0.78 && rand() < 0.65) return { action: trucoCall };
      if (winningHand && rand() < 0.45) return { action: trucoCall };
      if (str <= 0.3 && tricksWon === 0 && game.tricks.length >= 1 && rand() < 0.18)
        return { action: trucoCall }; // desperation bluff
    }

    /* card play */
    return { action: "play", index: chooseCard(game, hand) };
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

  function respondTruco(game, legal, str, tricksWon, tricksLost) {
    // "el envido está primero" — sneak the envido in when strong
    if (legal.includes("Envido")) {
      const env = envidoValue(game.initialHands.ai);
      if (env >= 28 && rand() < 0.75) return { action: "Envido" };
    }
    const level = game.pending.level;
    const raise = ["Retruco", "Vale Cuatro"].find((n) => legal.includes(n));
    const committed = tricksWon > tricksLost;

    if (raise && str >= 0.82 && rand() < 0.5) return { action: raise };
    const threshold = level === 1 ? 0.42 : level === 2 ? 0.55 : 0.65;
    if (str >= threshold || committed) return { action: "quiero" };
    if (rand() < 0.22) return { action: "quiero" }; // call the bluff sometimes
    return { action: "no-quiero" };
  }

  function chooseCard(game, hand) {
    if (hand.length === 1) return 0;
    const youCard = game.current.you;
    const trickNum = game.tricks.length; // 0-based
    const tricksWon = game.tricks.filter((t) => t.winner === "ai").length;

    if (youCard) {
      // responding: win as cheaply as possible
      const winner = lowestWinner(hand, Truco.power(youCard));
      if (winner !== null) return winner;
      // can't win — try to tie (parda keeps mano value alive), else dump lowest
      const tie = hand.findIndex((c) => Truco.power(c) === Truco.power(youCard));
      if (tie !== -1 && trickNum === 0) return tie;
      return lowestIndex(hand);
    }

    // leading
    if (trickNum === 0) {
      // lead second-best to probe, keep the boss card
      const order = hand.map((c, i) => [Truco.power(c), i]).sort((a, b) => b[0] - a[0]);
      return order.length >= 2 ? order[1][1] : order[0][1];
    }
    if (tricksWon >= 1) return highestIndex(hand); // close it out
    return highestIndex(hand);                      // must win this one
  }

  return { decide, strength };
})();

if (typeof module !== "undefined" && module.exports) module.exports = TrucoAI;
