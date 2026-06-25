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

/* ---- snapshot / mirror / restore (reconnect & rejoin) ---- */
{
  const { freshDeal, mirror, other } = Truco;

  // a restored snapshot is byte-identical to its source
  const g = new Game("you", { you: [C("espadas", 1), C("oros", 7), C("copas", 3)],
                              ai: [C("bastos", 1), C("espadas", 7), C("copas", 5)] });
  g.call("you", "Envido");          // leave a call pending mid-hand
  g.drainEvents();
  const clone = Game.restore(g.serialize());
  eq(clone.serialize(), g.serialize(), "restore is byte-identical to source");
  eq(clone.events.length, 0, "restored game has no queued events");

  // mirroring twice is the identity
  eq(mirror(mirror(g.serialize())), g.serialize(), "double-mirror is identity");

  // mirrored restore stays in lockstep: 100 games, the guest is rebuilt from
  // the host snapshot mid-hand and must keep matching through to game over
  let restores = 0, ok = true;
  for (let n = 0; n < 100 && ok; n++) {
    const fixed = freshDeal();
    const mano = n % 2 === 0 ? "you" : "ai";
    const host = new Game(mano, fixed);
    let guest = new Game(other(mano), { you: fixed.ai, ai: fixed.you });
    host.drainEvents(); guest.drainEvents();
    let steps = 0;
    while (!host.gameOver) {
      if (++steps > 5000) { ok = false; break; }
      if (host.handOver) {
        const nx = freshDeal();
        host.nextHand(nx); guest.nextHand({ you: nx.ai, ai: nx.you });
        host.drainEvents(); guest.drainEvents();
        continue;
      }
      if (steps % 6 === 0) { guest = Game.restore(mirror(host.serialize())); restores++; }
      const actor = host.pending ? other(host.pending.caller) : host.toAct;
      const ag = actor === "you" ? host : guest;
      const mg = actor === "you" ? guest : host;
      const legal = ag.legalActions("you");
      if (!legal.length) { ok = false; break; }
      const act = legal[Math.floor(Math.random() * legal.length)];
      if (act === "play") {
        const i = Math.floor(Math.random() * ag.hands.you.length);
        ag.playCard("you", i); mg.playCard("ai", i);
      } else { ag.call("you", act); mg.call("ai", act); }
      host.drainEvents(); guest.drainEvents();
      if (JSON.stringify(mirror(host.serialize())) !== JSON.stringify(guest.serialize())) { ok = false; break; }
    }
  }
  eq(ok, true, `reconnect-restore stays in lockstep (${restores} mid-game restores across 100 games)`);
}

/* ============================================================
   Flor (optional "con flor" variant)
   ============================================================ */

const { florValue, isFlor } = Truco;

function florRig(youHand, aiHand, mano = "you") {
  const g = rig(youHand, aiHand, mano);
  g.flor = true;
  g.florResolved = false;
  return g;
}
// three of espadas (1,7,3 -> all same suit) => flor; value 20+1+7+3 = 31
const FLOR_HI = [C("espadas", 7), C("espadas", 6), C("espadas", 5)];   // 20+7+6+5 = 38 (max)
const FLOR_MID = [C("espadas", 1), C("espadas", 7), C("espadas", 3)];  // 20+1+7+3 = 31
const FLOR_LO = [C("oros", 12), C("oros", 11), C("oros", 10)];         // 20+0+0+0 = 20 (min)
const NOFLOR = [C("espadas", 7), C("oros", 6), C("copas", 5)];         // mixed suits

eq(isFlor(FLOR_HI), true, "isFlor: three of a suit");
eq(isFlor(NOFLOR), false, "isFlor: mixed suits");
eq(florValue(FLOR_HI), 38, "flor value max 38 (7+6+5)");
eq(florValue(FLOR_LO), 20, "flor value min 20 (three figures)");
eq(florValue(FLOR_MID), 31, "flor value 31 (1+7+3)");

// only a player holding three same-suit cards is offered Flor
{
  const g = florRig(FLOR_MID, NOFLOR, "you");
  eq(g.legalActions("you").includes("Flor"), true, "flor offered when you hold three of a suit");
  eq(g.legalActions("you").includes("Envido"), false, "envido suppressed for the flor-holder");
}
{
  const g = florRig(NOFLOR, FLOR_MID, "you");
  eq(g.legalActions("you").includes("Flor"), false, "flor NOT offered without three of a suit");
  eq(g.legalActions("you").includes("Envido"), true, "envido offered to a non-flor hand");
}
{
  const g = rig(FLOR_MID, NOFLOR, "you"); // flor disabled
  eq(g.legalActions("you").includes("Flor"), false, "flor never offered when the variant is off");
}

// uncontested flor scores 3 straight, and forecloses envido
{
  const g = florRig(FLOR_MID, NOFLOR, "you");
  g.call("you", "Flor");
  eq(g.scores.you, 3, "uncontested flor scores 3");
  eq(g.florResolved, true, "flor marked resolved");
  eq(g.legalActions("you").includes("Envido"), false, "no envido after flor");
}

// both have flor, both quiero at base -> higher flor wins 3 (mano breaks ties)
{
  const g = florRig(FLOR_MID, FLOR_HI, "you"); // ai 38 > you 31
  g.call("you", "Flor");      // you declare
  g.call("ai", "quiero");     // con flor quiero -> compare
  eq(g.scores.ai, 3, "higher flor wins the base 3");
  eq(g.scores.you, 0, "lower flor scores nothing");
}
{
  const a = [C("espadas", 7), C("espadas", 6), C("espadas", 4)];          // 37
  const g2 = florRig(a, [C("oros", 7), C("oros", 6), C("oros", 4)], "ai"); // both 37, mano=ai
  g2.call("ai", "Flor"); g2.call("you", "quiero");
  eq(g2.scores.ai, 3, "flor tie favors the mano");
}

// contraflor accepted -> winner gets 6
{
  const g = florRig(FLOR_HI, FLOR_MID, "you"); // you 38 > ai 31
  g.call("you", "Flor");
  g.call("ai", "Contraflor");
  g.call("you", "quiero");
  eq(g.scores.you, 6, "contraflor accepted pays 6 to the higher flor");
}

// contraflor declined ("me achico") -> the contraflor caller scores 4
{
  const g = florRig(FLOR_HI, FLOR_MID, "you");
  g.call("you", "Flor");
  g.call("ai", "Contraflor");
  g.call("you", "no-quiero");      // you back down
  eq(g.scores.ai, 4, "declining contraflor pays the caller 4");
  eq(g.scores.you, 0, "decliner scores nothing");
}

// contraflor al resto accepted -> higher flor wins the game
{
  const g = florRig(FLOR_HI, FLOR_MID, "you"); // you higher
  g.call("you", "Flor");
  g.call("ai", "Contraflor al Resto");
  g.call("you", "quiero");
  eq(g.gameOver, true, "contraflor al resto accepted ends the game");
  eq(g.gameWinner, "you", "the higher flor wins the resto");
}

// flor annuls a pending envido (la flor mata al envido)
{
  const g = florRig(NOFLOR, FLOR_MID, "you"); // you no flor, ai has flor
  g.call("you", "Envido");           // you open envido
  eq(g.legalActions("ai").includes("Flor"), true, "flor offered in response to envido");
  g.call("ai", "Flor");              // ai declares flor -> annuls envido
  eq(g.scores.ai, 3, "flor annuls the envido and scores 3");
  eq(g.envidoResolved, false, "envido never resolved (it was annulled)");
}

// flor state survives serialize/restore
{
  const g = florRig(FLOR_MID, FLOR_HI, "you");
  g.call("you", "Flor");             // pending flor
  const r = Truco.Game.restore(g.serialize());
  eq(r.flor, true, "restored game keeps flor enabled");
  eq(JSON.stringify(r.pending), JSON.stringify(g.pending), "restored pending flor matches");
  r.call("ai", "quiero");
  eq(r.scores.ai, 3, "restored flor resolves correctly");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
