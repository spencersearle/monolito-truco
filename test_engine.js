/* Engine rule verification against the 5-source spec. Run: node test_engine.js */

const Truco = require("./engine.js");
const { Game, power, envidoValue } = Truco;

let passed = 0, failed = 0;
function eq(actual, expected, name) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; }
  else { failed++; console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const C = (suit, rank) => ({ suit, rank });

/* ---- card hierarchy: 14 tiers ---- */
eq(power(C("espadas", 1)), 14, "ancho de espadas top");
eq(power(C("bastos", 1)), 13, "ancho de bastos 2nd");
eq(power(C("espadas", 7)), 12, "7 espadas 3rd");
eq(power(C("oros", 7)), 11, "7 oros 4th");
eq(power(C("copas", 3)), 10, "threes");
eq(power(C("oros", 2)), 9, "twos");
eq(power(C("copas", 1)), 8, "false ace copas");
eq(power(C("oros", 1)), 8, "false ace oros");
eq(power(C("bastos", 12)), 7, "kings");
eq(power(C("oros", 11)), 6, "knights");
eq(power(C("copas", 10)), 5, "jacks");
eq(power(C("copas", 7)), 4, "false seven copas");
eq(power(C("bastos", 7)), 4, "false seven bastos");
eq(power(C("espadas", 6)), 3, "sixes");
eq(power(C("oros", 5)), 2, "fives");
eq(power(C("bastos", 4)), 1, "fours lowest");

/* ---- envido values ---- */
eq(envidoValue([C("oros", 7), C("oros", 6), C("copas", 2)]), 33, "max envido 33");
eq(envidoValue([C("oros", 12), C("oros", 11), C("copas", 2)]), 20, "two figures = 20");
eq(envidoValue([C("oros", 7), C("copas", 6), C("bastos", 2)]), 7, "no pair: highest card");
eq(envidoValue([C("oros", 12), C("copas", 11), C("bastos", 10)]), 0, "all figures no pair = 0");
eq(envidoValue([C("oros", 7), C("oros", 6), C("oros", 5)]), 33, "three of suit: best two");
eq(envidoValue([C("espadas", 1), C("espadas", 12), C("copas", 3)]), 21, "ace + figure = 21");

/* ---- helpers to build a controlled game ---- */
function rig(youHand, aiHand, mano = "you") {
  const g = new Game(mano === "you" ? "ai" : "you"); // constructor flips dealer, mano = other(dealer)
  g.hands = { you: [...youHand], ai: [...aiHand] };
  g.initialHands = { you: [...youHand], ai: [...aiHand] };
  g.tricks = []; g.current = { you: null, ai: null };
  g.mano = mano; g.leader = mano; g.toAct = mano;
  g.firstCardPlayed = { you: false, ai: false };
  g.trucoLevel = 0; g.trucoRaiser = null;
  g.envidoResolved = false; g.envidoForeclosed = false;
  g.pending = null; g.handOver = false;
  g.drainEvents();
  return g;
}

const playBoth = (g, yi, ai_) => {
  if (g.toAct === "you") { g.playCard("you", yi); g.playCard("ai", ai_); }
  else { g.playCard("ai", ai_); g.playCard("you", yi); }
};

/* ---- basic trick win: 2 of 3 ---- */
{
  const g = rig(
    [C("espadas", 1), C("bastos", 1), C("oros", 4)],
    [C("copas", 4), C("copas", 5), C("copas", 6)]);
  playBoth(g, 0, 0);
  playBoth(g, 0, 0);
  eq(g.handOver, true, "hand ends after 2 straight tricks");
  eq(g.scores.you, 1, "plain hand worth 1");
}

/* ---- parda case 1: trick1 tie, trick2 winner takes hand ---- */
{
  const g = rig(
    [C("espadas", 3), C("oros", 4), C("copas", 4)],
    [C("copas", 3), C("bastos", 12), C("bastos", 4)]);
  playBoth(g, 0, 0);             // 3 vs 3 = parda
  eq(g.tricks[0].winner, "tie", "trick1 parda");
  eq(g.toAct, "you", "leader leads again after parda");
  playBoth(g, 0, 0);             // oros4 < bastos12: ai wins trick2
  eq(g.handOver, true, "parda then win decides");
  eq(g.scores.ai, 1, "ai takes the hand");
}

/* ---- parda case 2: win trick1, tie trick2 → trick1 winner ---- */
{
  const g = rig(
    [C("espadas", 1), C("oros", 3), C("copas", 4)],
    [C("copas", 5), C("bastos", 3), C("bastos", 4)]);
  playBoth(g, 0, 0);             // you win
  playBoth(g, 0, 0);             // 3 vs 3 parda
  eq(g.handOver, true, "win+parda ends hand");
  eq(g.scores.you, 1, "trick1 winner wins");
}

/* ---- parda cases 3/5: tie, tie, then third decides / mano ---- */
{
  const g = rig(
    [C("espadas", 3), C("oros", 2), C("espadas", 1)],
    [C("copas", 3), C("bastos", 2), C("copas", 5)]);
  playBoth(g, 0, 0);             // parda
  playBoth(g, 0, 0);             // parda
  playBoth(g, 0, 0);             // you win trick 3
  eq(g.scores.you, 1, "double parda: trick3 decides");
}
{
  const g = rig(
    [C("espadas", 3), C("oros", 2), C("oros", 12)],
    [C("copas", 3), C("bastos", 2), C("copas", 12)], "ai");
  playBoth(g, 0, 0);
  playBoth(g, 0, 0);
  playBoth(g, 0, 0);             // triple parda
  eq(g.scores.ai, 1, "triple parda: mano wins");
}

/* ---- parda case 4: split 1-1, trick3 tie → trick1 winner ---- */
{
  const g = rig(
    [C("espadas", 1), C("oros", 4), C("oros", 3)],
    [C("copas", 5), C("bastos", 12), C("copas", 3)]);
  playBoth(g, 0, 0);             // you win t1
  playBoth(g, 0, 0);             // ai wins t2 (ai leads t2? no - you won t1, you lead)
  playBoth(g, 0, 0);             // 3 vs 3 parda
  eq(g.scores.you, 1, "split + parda3: trick1 winner");
}

/* ---- envido chain values & rejection ---- */
{
  const g = rig(
    [C("oros", 7), C("oros", 6), C("copas", 2)],   // you: 33
    [C("espadas", 7), C("espadas", 4), C("bastos", 2)]); // ai: 31
  g.call("you", "Envido");
  g.call("ai", "Envido");        // raise
  g.call("you", "Real Envido");  // raise again
  g.respond("ai", true);
  eq(g.scores.you, 7, "E+E+R accepted = 7 to envido winner");
}
{
  const g = rig(
    [C("oros", 7), C("oros", 6), C("copas", 2)],
    [C("espadas", 7), C("espadas", 4), C("bastos", 2)]);
  g.call("you", "Envido");
  g.call("ai", "Real Envido");
  g.respond("you", false);
  eq(g.scores.ai, 2, "E→R rejected = 2 (accumulated)");
}
{
  const g = rig(
    [C("oros", 7), C("oros", 6), C("copas", 2)],
    [C("espadas", 7), C("espadas", 4), C("bastos", 2)]);
  g.call("you", "Envido");
  g.respond("ai", false);
  eq(g.scores.you, 1, "first envido rejected = 1");
}
{
  const g = rig(
    [C("oros", 7), C("oros", 6), C("copas", 2)],
    [C("espadas", 7), C("espadas", 4), C("bastos", 2)]);
  const legal = g.legalActions("you");
  eq(legal.includes("Envido"), true, "may open with Envido");
  eq(legal.includes("Real Envido"), false, "may not open with Real Envido");
  eq(legal.includes("Falta Envido"), false, "may not open with Falta Envido");
  eq(g.call("you", "Real Envido"), false, "opening Real Envido is rejected");
  g.call("you", "Envido");
  const aiLegal = g.legalActions("ai");
  eq(aiLegal.includes("Real Envido"), true, "Real Envido available as raise");
  eq(aiLegal.includes("Falta Envido"), true, "Falta Envido available as raise");
}

/* ---- envido tie: mano wins ---- */
{
  const g = rig(
    [C("oros", 7), C("oros", 4), C("copas", 2)],     // 31
    [C("espadas", 7), C("espadas", 4), C("bastos", 2)], "ai"); // 31, ai is mano
  g.call("ai", "Envido");
  g.respond("you", true);
  eq(g.scores.ai, 2, "envido tie goes to mano");
}

/* ---- falta envido math ---- */
{
  const g = rig([C("oros", 7), C("oros", 6), C("copas", 2)],
                [C("espadas", 4), C("copas", 5), C("bastos", 2)]);
  g.scores = { you: 10, ai: 8 };  // both malas
  g.call("you", "Envido");
  g.call("ai", "Falta Envido");   // raised to falta
  g.respond("you", true);
  eq(g.gameOver, true, "falta in malas wins the game");
}
{
  const g = rig([C("oros", 7), C("oros", 6), C("copas", 2)],
                [C("espadas", 4), C("copas", 5), C("bastos", 2)]);
  g.scores = { you: 4, ai: 22 };  // leader in buenas
  g.call("you", "Envido");
  g.call("ai", "Falta Envido");
  g.respond("you", true);
  eq(g.scores.you, 4 + 8, "falta vs buenas leader = 30-22 = 8");
}

/* ---- truco escalation ---- */
{
  const g = rig([C("espadas", 1), C("bastos", 1), C("oros", 3)],
                [C("copas", 4), C("copas", 5), C("copas", 6)]);
  g.call("you", "Truco");
  g.call("ai", "Retruco");       // raise as response
  g.respond("you", true);
  eq(g.trucoLevel, 2, "retruco accepted");
  eq(g.trucoRaiser, "you", "accepter holds the raise right");
  eq(g.legalActions("ai").includes("Vale Cuatro"), false, "non-accepter cannot raise");
  playBoth(g, 0, 0); playBoth(g, 0, 0);
  eq(g.scores.you, 3, "retruco hand worth 3");
}
{
  const g = rig([C("espadas", 1), C("bastos", 1), C("oros", 3)],
                [C("copas", 4), C("copas", 5), C("copas", 6)]);
  g.call("you", "Truco");
  g.respond("ai", false);
  eq(g.scores.you, 1, "truco declined = 1");
  eq(g.handOver, true, "hand over on decline");
}

/* ---- envido está primero ---- */
{
  const g = rig([C("espadas", 1), C("oros", 7), C("oros", 6)],
                [C("copas", 4), C("espadas", 7), C("espadas", 4)]);
  g.call("you", "Truco");
  const aiLegal = g.legalActions("ai");
  eq(aiLegal.includes("Envido"), true, "responder may answer truco with envido in trick 1");
  g.call("ai", "Envido");
  eq(g.pending.kind, "envido", "truco annulled, envido pending");
  g.respond("you", true);
  eq(g.scores.you, 2, "you 33 beats ai 31: 2 pts");
  eq(g.trucoLevel, 0, "truco must be re-made");
}

/* ---- accepted truco forecloses envido ---- */
{
  const g = rig([C("espadas", 1), C("oros", 7), C("oros", 6)],
                [C("copas", 4), C("espadas", 7), C("espadas", 4)]);
  g.call("you", "Truco");
  g.respond("ai", true);
  eq(g.legalActions("you").includes("Envido"), false, "no envido after accepted truco");
}

/* ---- envido only before your first card ---- */
{
  const g = rig([C("espadas", 1), C("oros", 7), C("oros", 6)],
                [C("copas", 4), C("espadas", 7), C("espadas", 4)]);
  g.playCard("you", 0);
  eq(g.legalActions("ai").includes("Envido"), true, "ai hasn't played: may call");
  g.playCard("ai", 0);
  eq(g.envidoWindowOpen("you"), false, "window closed after first card");
}

/* ---- ir al mazo ---- */
{
  const g = rig([C("oros", 4), C("copas", 4), C("bastos", 4)],
                [C("espadas", 1), C("bastos", 1), C("espadas", 7)]);
  g.call("you", "mazo");
  eq(g.scores.ai, 2, "fold in trick1 pre-envido = 2 pts");
}
{
  const g = rig([C("espadas", 1), C("copas", 4), C("bastos", 4)],
                [C("copas", 5), C("bastos", 12), C("espadas", 7)]);
  g.call("you", "Truco");
  g.respond("ai", true);
  playBoth(g, 0, 0);             // you win trick 1, you lead trick 2
  g.call("you", "mazo");
  eq(g.scores.ai, 2, "fold after accepted truco = 2 pts");
}

/* ---- game to 30 ---- */
{
  const g = rig([C("espadas", 1), C("bastos", 1), C("oros", 3)],
                [C("copas", 4), C("copas", 5), C("copas", 6)]);
  g.scores = { you: 29, ai: 0 };
  playBoth(g, 0, 0); playBoth(g, 0, 0);
  eq(g.gameOver, true, "game ends at 30");
  eq(g.gameWinner, "you", "winner recorded");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
