/* ============================================================
   MONOLITO · engine4.js
   Pure rules engine for 4-player team Truco (2v2, sin flor),
   first to 30. Same verified spec as engine.js, extended to
   partnerships: seats 0-3 in play order, seats 0&2 vs 1&3.
   Every client runs this with absolute seat numbers — only the
   rendering is rotated, so there is no mirrored state to sync.
   No DOM access — also loadable in Node for testing.
   ============================================================ */

const Truco4 = (() => {

  const DECK_SUITS = ["espadas", "bastos", "oros", "copas"];
  const DECK_RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

  const { power, envidoValue } = (typeof Truco !== "undefined")
    ? Truco
    : require("./engine.js");

  const ENVIDO_CALL_VALUE = { envido: 2, "real-envido": 3 };
  const TRUCO_NAMES = { 1: "Truco", 2: "Retruco", 3: "Vale Cuatro" };
  const TRUCO_HAND_VALUE = { 0: 1, 1: 2, 2: 3, 3: 4 };

  const teamOf = (seat) => seat % 2;
  const otherTeam = (t) => 1 - t;

  /* shuffle a fresh deck and deal 3 cards to each of the 4 seats */
  function freshDeal4() {
    const deck = [];
    for (const suit of DECK_SUITS)
      for (const rank of DECK_RANKS) deck.push({ suit, rank });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return [deck.slice(0, 3), deck.slice(3, 6), deck.slice(6, 9), deck.slice(9, 12)];
  }

  class Game4 {
    constructor(firstMano, fixedHands) {
      this.scores = [0, 0];               // [team 0, team 1]
      this.mano = null;                   // set by startHand
      this.firstMano = firstMano == null ? Math.floor(Math.random() * 4) : firstMano;
      this.gameOver = false;
      this.gameWinner = null;             // team index
      this.events = [];
      this.startHand(fixedHands);
    }

    emit(type, data = {}) {
      this.events.push({ type, ...data });
    }

    drainEvents() {
      const out = this.events;
      this.events = [];
      return out;
    }

    /* ---------- hand setup ---------- */

    startHand(fixedHands) {
      if (this.gameOver) return;
      this.mano = this.mano == null ? this.firstMano : (this.mano + 1) % 4;
      this.dealer = (this.mano + 3) % 4;

      const deal = fixedHands || freshDeal4();
      this.hands = deal.map((h) => [...h]);
      this.initialHands = this.hands.map((h) => [...h]);
      this.tricks = [];                   // [{cards:[4], winnerSeat, winner: 0|1|'tie'}]
      this.current = [null, null, null, null];
      this.leader = this.mano;
      this.toAct = this.mano;
      this.firstCardPlayed = [false, false, false, false];

      this.trucoLevel = 0;                // accepted level: 0..3
      this.trucoRaiserTeam = null;        // team that may raise next; null = either may open
      this.envidoResolved = false;
      this.envidoForeclosed = false;
      this.pending = null;                // {kind, caller(seat), callerTeam, level|chain}
      this.handOver = false;

      this.emit("hand-start", { mano: this.mano, dealer: this.dealer });
    }

    /* ---------- queries ---------- */

    inFirstTrick() {
      return this.tricks.length === 0;
    }

    envidoWindowOpen(seat) {
      return (
        this.inFirstTrick() &&
        !this.firstCardPlayed[seat] &&
        !this.envidoResolved &&
        !this.envidoForeclosed &&
        this.trucoLevel === 0
      );
    }

    /* legal actions for a seat right now */
    legalActions(seat) {
      if (this.gameOver || this.handOver) return [];

      // responding to a pending call: either member of the other team may answer
      if (this.pending) {
        if (this.pending.callerTeam === teamOf(seat)) return [];
        const acts = ["quiero", "no-quiero"];
        if (this.pending.kind === "truco") {
          if (this.pending.level < 3) acts.push(TRUCO_NAMES[this.pending.level + 1]);
          // "el envido está primero": initial Truco, trick 1, responder hasn't played.
          // The chain must open with plain Envido; raises come after.
          if (this.pending.level === 1 && this.envidoWindowOpen(seat)) {
            acts.push("Envido");
          }
        } else {
          const chain = this.pending.chain;
          const hasReal = chain.includes("real-envido");
          const hasFalta = chain.includes("falta-envido");
          const envidoCount = chain.filter((c) => c === "envido").length;
          if (!hasFalta) {
            if (!hasReal && envidoCount === 1) acts.push("Envido");
            if (!hasReal) acts.push("Real Envido");
            acts.push("Falta Envido");
          }
        }
        acts.push("mazo");
        return acts;
      }

      if (this.toAct !== seat) return [];

      const acts = ["play"];
      // opening call is plain Envido only; Real/Falta enter as raises
      if (this.envidoWindowOpen(seat)) acts.push("Envido");
      if (this.trucoLevel === 0 ||
          (this.trucoLevel < 3 && this.trucoRaiserTeam === teamOf(seat))) {
        acts.push(TRUCO_NAMES[this.trucoLevel + 1]);
      }
      acts.push("mazo");
      return acts;
    }

    /* ---------- card play ---------- */

    playCard(seat, index) {
      if (this.pending || this.handOver || this.gameOver) return false;
      if (this.toAct !== seat) return false;
      const card = this.hands[seat][index];
      if (!card) return false;

      this.hands[seat].splice(index, 1);
      this.current[seat] = card;
      this.firstCardPlayed[seat] = true;
      this.emit("card-played", { seat, card });

      if (this.current.every((c) => c !== null)) {
        this.resolveTrick();
      } else {
        this.toAct = (seat + 1) % 4;
        this.emit("turn", { seat: this.toAct });
      }
      return true;
    }

    resolveTrick() {
      // best card wins for its team; equal top cards across teams = parda.
      // Among the winning team's top cards, the one played earliest (in play
      // order from the leader) leads the next trick.
      const top = Math.max(...this.current.map(power));
      const holders = [];
      for (let i = 0; i < 4; i++) {
        const seat = (this.leader + i) % 4;
        if (power(this.current[seat]) === top) holders.push(seat);
      }
      const teams = new Set(holders.map(teamOf));
      const winner = teams.size === 2 ? "tie" : teamOf(holders[0]);
      const winnerSeat = winner === "tie" ? null : holders[0];

      this.tricks.push({ cards: [...this.current], winnerSeat, winner });
      this.emit("trick-end", { winner, winnerSeat, trickIndex: this.tricks.length - 1 });

      const handWinner = this.handWinner();
      if (handWinner !== null) {
        this.finishHand(handWinner, TRUCO_HAND_VALUE[this.trucoLevel], "tricks");
        return;
      }

      // next trick: winner leads; after parda the same leader leads again
      this.leader = winnerSeat === null ? this.leader : winnerSeat;
      this.toAct = this.leader;
      this.current = [null, null, null, null];
      this.emit("turn", { seat: this.toAct });
    }

    /* parda-aware hand resolution (spec section 5), team-valued */
    handWinner() {
      const w = this.tricks.map((t) => t.winner);
      const wins = (t) => w.filter((x) => x === t).length;
      for (const t of [0, 1]) if (wins(t) >= 2) return t;

      const manoTeam = teamOf(this.mano);
      if (w.length >= 2) {
        if (w[0] === "tie" && w[1] !== "tie") return w[1];       // case 1
        if (w[0] !== "tie" && w[1] === "tie") return w[0];       // case 2
      }
      if (w.length === 3) {
        if (w[0] === "tie" && w[1] === "tie") {
          return w[2] === "tie" ? manoTeam : w[2];               // cases 3, 5
        }
        if (w[2] === "tie") return w[0];                          // case 4
      }
      return null;
    }

    /* ---------- calls ---------- */

    call(seat, name) {
      if (this.gameOver || this.handOver) return false;
      const legal = this.legalActions(seat);
      if (!legal.includes(name)) return false;

      if (name === "mazo") return this.irAlMazo(seat);
      if (name === "quiero") return this.respond(seat, true);
      if (name === "no-quiero") return this.respond(seat, false);

      const envidoNames = { Envido: "envido", "Real Envido": "real-envido", "Falta Envido": "falta-envido" };

      if (name in envidoNames) {
        const call = envidoNames[name];
        if (this.pending && this.pending.kind === "truco") {
          // el envido está primero — annul the truco call
          this.emit("envido-primero", { seat });
          this.pending = null;
          this.trucoRaiserTeam = null;
        }
        if (this.pending) {
          this.pending.chain.push(call);
          this.pending.caller = seat;
          this.pending.callerTeam = teamOf(seat);
        } else {
          this.pending = { kind: "envido", chain: [call], caller: seat, callerTeam: teamOf(seat) };
        }
        this.emit("call", { seat, name });
        return true;
      }

      // truco family
      const level = { Truco: 1, Retruco: 2, "Vale Cuatro": 3 }[name];
      if (level == null) return false;
      this.pending = { kind: "truco", level, caller: seat, callerTeam: teamOf(seat) };
      this.emit("call", { seat, name });
      return true;
    }

    respond(seat, accepted) {
      if (!this.pending || this.pending.callerTeam === teamOf(seat)) return false;
      const pending = this.pending;
      this.pending = null;

      this.emit("response", { seat, accepted });

      if (pending.kind === "truco") {
        if (accepted) {
          this.trucoLevel = pending.level;
          this.trucoRaiserTeam = teamOf(seat);  // only the accepting team may raise
          this.envidoForeclosed = true;         // accepted truco closes envido
          this.emit("stake", { handValue: TRUCO_HAND_VALUE[this.trucoLevel] });
          this.emit("turn", { seat: this.toAct });
        } else {
          const points = TRUCO_HAND_VALUE[pending.level - 1];
          this.finishHand(pending.callerTeam, points, "no-quiero");
        }
        return true;
      }

      // envido
      this.envidoResolved = true;
      const chain = pending.chain;
      if (accepted) {
        const points = this.envidoChainValue(chain);
        const values = this.initialHands.map(envidoValue);
        // declarations run from the mano; a later seat only wins by strictly
        // beating the best so far, so ties favor whoever is closer to mano
        let winnerSeat = this.mano;
        for (let i = 1; i < 4; i++) {
          const seatI = (this.mano + i) % 4;
          if (values[seatI] > values[winnerSeat]) winnerSeat = seatI;
        }
        const winnerTeam = teamOf(winnerSeat);
        this.emit("envido-result", { values, winnerSeat, winnerTeam, points, mano: this.mano });
        this.award(winnerTeam, points);
      } else {
        const points = chain.length === 1 ? 1 : this.envidoChainValue(chain.slice(0, -1));
        this.emit("envido-declined", { callerSeat: pending.caller, callerTeam: pending.callerTeam, points });
        this.award(pending.callerTeam, points);
      }
      if (!this.gameOver) this.emit("turn", { seat: this.toAct });
      return true;
    }

    envidoChainValue(chain) {
      if (chain[chain.length - 1] === "falta-envido") return this.faltaValue();
      return chain.reduce((sum, c) => sum + (ENVIDO_CALL_VALUE[c] || 0), 0);
    }

    faltaValue() {
      const leaderScore = Math.max(this.scores[0], this.scores[1]);
      if (leaderScore < 15) return 30;            // both in malas: wins the game
      return 30 - leaderScore;                    // points the leader lacks
    }

    /* ---------- folding ---------- */

    irAlMazo(seat) {
      this.emit("mazo", { seat });

      if (this.pending) {
        // folding while a call is pending = no quiero
        return this.respond(seat, false);
      }

      let points;
      const anyWindow = [0, 1, 2, 3].some((s) => this.envidoWindowOpen(s));
      if (this.inFirstTrick() && !this.envidoResolved && !this.envidoForeclosed && anyWindow) {
        points = 2;                                // envido point + truco point
      } else {
        points = TRUCO_HAND_VALUE[this.trucoLevel];
      }
      this.finishHand(otherTeam(teamOf(seat)), points, "mazo");
      return true;
    }

    /* ---------- scoring ---------- */

    award(team, points) {
      this.scores[team] = Math.min(30, this.scores[team] + points);
      this.emit("score", { team, points, scores: [...this.scores] });
      if (this.scores[team] >= 30) {
        this.gameOver = true;
        this.gameWinner = team;
        this.handOver = true;
        this.emit("game-over", { winner: team });
      }
    }

    finishHand(team, points, reason) {
      this.handOver = true;
      this.emit("hand-end", { winner: team, points, reason });
      this.award(team, points);
    }

    nextHand(fixedHands) {
      if (this.gameOver) return false;
      this.startHand(fixedHands);
      return true;
    }

    /* ---------- snapshot (late join / rejoin) ---------- */

    /* full mid-game state as plain JSON — the host sends this to a player
       taking over a seat so they can continue in lockstep */
    serialize() {
      return JSON.parse(JSON.stringify({
        scores: this.scores,
        firstMano: this.firstMano,
        mano: this.mano,
        dealer: this.dealer,
        hands: this.hands,
        initialHands: this.initialHands,
        tricks: this.tricks,
        current: this.current,
        leader: this.leader,
        toAct: this.toAct,
        firstCardPlayed: this.firstCardPlayed,
        trucoLevel: this.trucoLevel,
        trucoRaiserTeam: this.trucoRaiserTeam,
        envidoResolved: this.envidoResolved,
        envidoForeclosed: this.envidoForeclosed,
        pending: this.pending,
        handOver: this.handOver,
        gameOver: this.gameOver,
        gameWinner: this.gameWinner,
      }));
    }

    static restore(state) {
      // bypass the constructor: no new deal, no hand-start event
      const g = Object.create(Game4.prototype);
      Object.assign(g, JSON.parse(JSON.stringify(state)));
      g.events = [];
      return g;
    }
  }

  return { Game4, freshDeal4, teamOf, otherTeam, TRUCO_NAMES, TRUCO_HAND_VALUE };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Truco4;
