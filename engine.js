/* ============================================================
   MONOLITO · engine.js
   Pure rules engine for 2-player Argentine Truco (sin flor),
   first to 30. Implements the spec verified against 5 sources:
   Wikipedia, Pagat, EnvidoYTruco, Ludoteka, Torofun.
   No DOM access — also loadable in Node for testing.
   ============================================================ */

const Truco = (() => {

  const DECK_SUITS = ["espadas", "bastos", "oros", "copas"];
  const DECK_RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

  /* power tiers, higher beats lower; equal power = parda */
  function power(card) {
    const { suit, rank } = card;
    if (rank === 1 && suit === "espadas") return 14;
    if (rank === 1 && suit === "bastos") return 13;
    if (rank === 7 && suit === "espadas") return 12;
    if (rank === 7 && suit === "oros") return 11;
    if (rank === 3) return 10;
    if (rank === 2) return 9;
    if (rank === 1) return 8;            // false aces: copas, oros
    if (rank === 12) return 7;
    if (rank === 11) return 6;
    if (rank === 10) return 5;
    if (rank === 7) return 4;            // false sevens: copas, bastos
    if (rank === 6) return 3;
    if (rank === 5) return 2;
    return 1;                            // fours
  }

  /* envido: 1-7 face value, figures 0; best two of a suit + 20 */
  function envidoValue(hand) {
    const val = (c) => (c.rank <= 7 ? c.rank : 0);
    let best = 0;
    for (const suit of DECK_SUITS) {
      const inSuit = hand.filter((c) => c.suit === suit).map(val).sort((a, b) => b - a);
      if (inSuit.length >= 2) best = Math.max(best, 20 + inSuit[0] + inSuit[1]);
    }
    if (best === 0) best = Math.max(...hand.map(val));
    return best;
  }

  /* flor: three cards of the same suit. Value = 20 + pips (figures count 0),
     so 20 (three figures) to 38 (7+6+5). Optional variant. */
  function isFlor(hand) {
    return hand.length === 3 &&
      hand[0].suit === hand[1].suit && hand[1].suit === hand[2].suit;
  }
  function florValue(hand) {
    const v = (c) => (c.rank <= 7 ? c.rank : 0);
    return 20 + hand.reduce((sum, c) => sum + v(c), 0);
  }

  const ENVIDO_CALL_VALUE = { envido: 2, "real-envido": 3 };

  const TRUCO_NAMES = { 1: "Truco", 2: "Retruco", 3: "Vale Cuatro" };
  const TRUCO_HAND_VALUE = { 0: 1, 1: 2, 2: 3, 3: 4 };

  const other = (p) => (p === "you" ? "ai" : "you");

  /* shuffle a fresh deck and deal 3 cards to each seat */
  function freshDeal() {
    const deck = [];
    for (const suit of DECK_SUITS)
      for (const rank of DECK_RANKS) deck.push({ suit, rank });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return { you: deck.slice(0, 3), ai: deck.slice(3, 6) };
  }

  class Game {
    constructor(firstDealer, fixedHands, flor = false) {
      this.scores = { you: 0, ai: 0 };
      this.dealer = firstDealer || (Math.random() < 0.5 ? "you" : "ai");
      this.flor = !!flor;               // optional "con flor" variant
      this.gameOver = false;
      this.gameWinner = null;
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
      this.dealer = other(this.dealer);
      this.mano = other(this.dealer);

      const deal = fixedHands || freshDeal();
      this.hands = { you: [...deal.you], ai: [...deal.ai] };
      this.initialHands = { you: [...this.hands.you], ai: [...this.hands.ai] };
      this.tricks = [];                 // [{you, ai, winner: 'you'|'ai'|'tie'}]
      this.current = { you: null, ai: null };
      this.leader = this.mano;
      this.toAct = this.mano;
      this.firstCardPlayed = { you: false, ai: false };

      this.trucoLevel = 0;              // accepted level: 0..3
      this.trucoRaiser = null;          // who may raise next; null = either may open Truco
      this.envidoResolved = false;      // called & settled (or window closed by accepted truco)
      this.envidoForeclosed = false;
      this.florResolved = false;        // flor declared & settled (or window passed)
      this.pending = null;              // {kind:'truco'|'envido'|'flor', ...} + caller
      this.handOver = false;

      this.emit("hand-start", { mano: this.mano, dealer: this.dealer });
    }

    /* ---------- queries ---------- */

    inFirstTrick() {
      return this.tricks.length === 0;
    }

    envidoWindowOpen(player) {
      return (
        this.inFirstTrick() &&
        !this.firstCardPlayed[player] &&
        !this.envidoResolved &&
        !this.envidoForeclosed &&
        this.trucoLevel === 0
      );
    }

    /* does this player hold flor (decided from the dealt three)? */
    hasFlor(player) {
      return this.flor && isFlor(this.initialHands[player]);
    }

    /* may this player still declare flor? (first trick, before they play,
       before flor/envido settled, no accepted truco yet) */
    florWindowOpen(player) {
      return (
        this.hasFlor(player) &&
        this.inFirstTrick() &&
        !this.firstCardPlayed[player] &&
        !this.florResolved &&
        !this.envidoResolved &&
        this.trucoLevel === 0
      );
    }

    /* legal actions for a player right now */
    legalActions(player) {
      if (this.gameOver || this.handOver) return [];

      // responding to a pending call
      if (this.pending && this.pending.caller !== player) {
        // flor: con flor quiero / me achico, and the contraflor raises
        if (this.pending.kind === "flor") {
          const acts = ["quiero", "no-quiero"];
          const last = this.pending.chain[this.pending.chain.length - 1];
          if (last === "flor") acts.push("Contraflor", "Contraflor al Resto");
          else if (last === "contraflor") acts.push("Contraflor al Resto");
          acts.push("mazo");
          return acts;
        }
        const acts = ["quiero", "no-quiero"];
        if (this.pending.kind === "truco") {
          if (this.pending.level < 3) acts.push(TRUCO_NAMES[this.pending.level + 1]);
          // "el envido está primero": initial Truco, trick 1, responder hasn't played.
          // The chain must open with plain Envido; raises come after.
          if (this.pending.level === 1 && this.envidoWindowOpen(player) && !this.hasFlor(player)) {
            acts.push("Envido");
          }
          // flor can be declared even over a pending Truco in the first trick
          if (this.florWindowOpen(player)) acts.push("Flor");
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
          // flor beats the envido — declaring it annuls the pending envido
          if (this.florWindowOpen(player)) acts.push("Flor");
        }
        acts.push("mazo");
        return acts;
      }

      if (this.pending) return []; // caller waits

      if (this.toAct !== player) return [];

      const acts = ["play"];
      // flor (if held) replaces the envido for this player
      if (this.florWindowOpen(player)) acts.push("Flor");
      // opening call is plain Envido only; Real/Falta enter as raises
      if (this.envidoWindowOpen(player) && !this.hasFlor(player)) acts.push("Envido");
      if (this.trucoLevel === 0 || (this.trucoLevel < 3 && this.trucoRaiser === player)) {
        acts.push(TRUCO_NAMES[this.trucoLevel + 1]);
      }
      acts.push("mazo");
      return acts;
    }

    /* ---------- card play ---------- */

    playCard(player, index) {
      if (this.pending || this.handOver || this.gameOver) return false;
      if (this.toAct !== player) return false;
      const card = this.hands[player][index];
      if (!card) return false;

      this.hands[player].splice(index, 1);
      this.current[player] = card;
      this.firstCardPlayed[player] = true;
      this.emit("card-played", { player, card });

      if (this.current.you && this.current.ai) {
        this.resolveTrick();
      } else {
        this.toAct = other(player);
        this.emit("turn", { player: this.toAct });
      }
      return true;
    }

    resolveTrick() {
      const py = power(this.current.you);
      const pa = power(this.current.ai);
      const winner = py > pa ? "you" : pa > py ? "ai" : "tie";
      this.tricks.push({ you: this.current.you, ai: this.current.ai, winner });
      this.emit("trick-end", { winner, trickIndex: this.tricks.length - 1 });

      const handWinner = this.handWinner();
      if (handWinner) {
        this.finishHand(handWinner, TRUCO_HAND_VALUE[this.trucoLevel], "tricks");
        return;
      }

      // next trick: winner leads; after parda the same leader leads again
      this.leader = winner === "tie" ? this.leader : winner;
      this.toAct = this.leader;
      this.current = { you: null, ai: null };
      this.emit("turn", { player: this.toAct });
    }

    /* parda-aware hand resolution (spec section 5) */
    handWinner() {
      const w = this.tricks.map((t) => t.winner);
      const wins = (p) => w.filter((x) => x === p).length;
      for (const p of ["you", "ai"]) if (wins(p) >= 2) return p;

      if (w.length >= 2) {
        if (w[0] === "tie" && w[1] !== "tie") return w[1];       // case 1
        if (w[0] !== "tie" && w[1] === "tie") return w[0];       // case 2
      }
      if (w.length === 3) {
        if (w[0] === "tie" && w[1] === "tie") {
          return w[2] === "tie" ? this.mano : w[2];              // cases 3, 5
        }
        if (w[2] === "tie") return w[0];                          // case 4
      }
      return null;
    }

    /* ---------- calls ---------- */

    call(player, name) {
      if (this.gameOver || this.handOver) return false;
      const legal = this.legalActions(player);
      if (!legal.includes(name)) return false;

      if (name === "mazo") return this.irAlMazo(player);
      if (name === "quiero") return this.respond(player, true);
      if (name === "no-quiero") return this.respond(player, false);

      if (name === "Flor" || name === "Contraflor" || name === "Contraflor al Resto") {
        return this.florCall(player, name);
      }

      const envidoNames = { Envido: "envido", "Real Envido": "real-envido", "Falta Envido": "falta-envido" };

      if (name in envidoNames) {
        const call = envidoNames[name];
        if (this.pending && this.pending.kind === "truco") {
          // el envido está primero — annul the truco call
          this.emit("envido-primero", { player });
          this.pending = null;
          this.trucoRaiser = null;
        }
        if (this.pending) {
          this.pending.chain.push(call);
          this.pending.caller = player;
        } else {
          this.pending = { kind: "envido", chain: [call], caller: player };
        }
        this.emit("call", { player, name });
        return true;
      }

      // truco family
      const level = { Truco: 1, Retruco: 2, "Vale Cuatro": 3 }[name];
      if (level == null) return false;
      this.pending = { kind: "truco", level, caller: player };
      this.emit("call", { player, name });
      return true;
    }

    /* ---------- flor (optional variant) ---------- */

    florCall(player, name) {
      // Contraflor / Contraflor al Resto: raises while a flor is pending
      if (name === "Contraflor" || name === "Contraflor al Resto") {
        if (!this.pending || this.pending.kind !== "flor" || this.pending.caller === player) return false;
        this.pending.chain.push(name === "Contraflor" ? "contraflor" : "contraflor-resto");
        this.pending.caller = player;
        this.emit("call", { player, name });
        return true;
      }

      // name === "Flor": the opening declaration. Flor beats the envido (and a
      // first-trick truco), so declaring it sets aside any such pending call.
      if (this.pending && (this.pending.kind === "envido" || this.pending.kind === "truco")) {
        this.emit("flor-annul", { player, kind: this.pending.kind });
        if (this.pending.kind === "truco") this.trucoRaiser = null;
        this.pending = null;
      }
      this.envidoForeclosed = true;
      this.emit("call", { player, name: "Flor" });

      const opp = other(player);
      if (!this.hasFlor(opp)) {
        // uncontested flor: 3 points straight
        this.florResolved = true;
        const fv = { you: florValue(this.initialHands.you), ai: florValue(this.initialHands.ai) };
        this.emit("flor-result", { values: fv, winner: player, points: 3, contested: false, mano: this.mano });
        this.award(player, 3);
        if (!this.gameOver) this.emit("turn", { player: this.toAct });
      } else {
        // both have flor: the other side may raise (contraflor) or settle
        this.pending = { kind: "flor", chain: ["flor"], caller: player };
      }
      return true;
    }

    respond(player, accepted) {
      if (!this.pending || this.pending.caller === player) return false;
      const pending = this.pending;
      this.pending = null;

      this.emit("response", { player, accepted });

      if (pending.kind === "flor") {
        this.florResolved = true;
        const chain = pending.chain;
        const last = chain[chain.length - 1];
        const fv = { you: florValue(this.initialHands.you), ai: florValue(this.initialHands.ai) };
        if (accepted) {
          const winner = fv.you === fv.ai ? this.mano : fv.you > fv.ai ? "you" : "ai";
          const points = last === "flor" ? 3 : last === "contraflor" ? 6 : this.faltaValue();
          this.emit("flor-result", { values: fv, winner, points, contested: true, mano: this.mano });
          this.award(winner, points);
        } else {
          // "con flor me achico": the last caller takes the prior stake
          const points = last === "flor" ? 3 : last === "contraflor" ? 4 : 6;
          this.emit("flor-declined", { caller: pending.caller, points });
          this.award(pending.caller, points);
        }
        if (!this.gameOver) this.emit("turn", { player: this.toAct });
        return true;
      }

      if (pending.kind === "truco") {
        if (accepted) {
          this.trucoLevel = pending.level;
          this.trucoRaiser = player;     // only the accepter may raise
          this.envidoForeclosed = true;  // accepted truco closes envido
          this.emit("stake", { handValue: TRUCO_HAND_VALUE[this.trucoLevel] });
          this.emit("turn", { player: this.toAct });
        } else {
          const points = TRUCO_HAND_VALUE[pending.level - 1];
          this.finishHand(pending.caller, points, "no-quiero");
        }
        return true;
      }

      // envido
      this.envidoResolved = true;
      const chain = pending.chain;
      if (accepted) {
        const points = this.envidoChainValue(chain);
        const ev = { you: envidoValue(this.initialHands.you), ai: envidoValue(this.initialHands.ai) };
        const winner = ev.you === ev.ai ? this.mano : ev.you > ev.ai ? "you" : "ai";
        this.emit("envido-result", { values: ev, winner, points, mano: this.mano });
        this.award(winner, points);
      } else {
        const points = chain.length === 1 ? 1 : this.envidoChainValue(chain.slice(0, -1));
        this.emit("envido-declined", { caller: pending.caller, points });
        this.award(pending.caller, points);
      }
      if (!this.gameOver) this.emit("turn", { player: this.toAct });
      return true;
    }

    envidoChainValue(chain) {
      if (chain[chain.length - 1] === "falta-envido") return this.faltaValue();
      return chain.reduce((sum, c) => sum + (ENVIDO_CALL_VALUE[c] || 0), 0);
    }

    faltaValue() {
      const leaderScore = Math.max(this.scores.you, this.scores.ai);
      if (leaderScore < 15) return 30;            // both in malas: wins the game
      return 30 - leaderScore;                    // points the leader lacks
    }

    /* ---------- folding ---------- */

    irAlMazo(player) {
      const opp = other(player);
      this.emit("mazo", { player });

      if (this.pending) {
        // folding while a call is pending = no quiero
        return this.respond(player, false);
      }

      let points;
      if (this.inFirstTrick() && !this.envidoResolved && !this.envidoForeclosed &&
          (this.envidoWindowOpen(player) || this.envidoWindowOpen(opp))) {
        points = 2;                                // envido point + truco point
      } else {
        points = TRUCO_HAND_VALUE[this.trucoLevel];
      }
      this.finishHand(opp, points, "mazo");
      return true;
    }

    /* ---------- scoring ---------- */

    award(player, points) {
      this.scores[player] = Math.min(30, this.scores[player] + points);
      this.emit("score", { player, points, scores: { ...this.scores } });
      if (this.scores[player] >= 30) {
        this.gameOver = true;
        this.gameWinner = player;
        this.handOver = true;
        this.emit("game-over", { winner: player });
      }
    }

    finishHand(winner, points, reason) {
      this.handOver = true;
      this.emit("hand-end", { winner, points, reason });
      this.award(winner, points);
    }

    nextHand(fixedHands) {
      if (this.gameOver) return false;
      this.startHand(fixedHands);
      return true;
    }

    /* ---------- snapshot (reconnect / rejoin) ---------- */

    /* full mid-game state as plain JSON — the host sends this (mirrored) to a
       rival who reconnects, so they resume exactly where the table is */
    serialize() {
      return JSON.parse(JSON.stringify({
        scores: this.scores,
        dealer: this.dealer,
        flor: this.flor,
        mano: this.mano,
        hands: this.hands,
        initialHands: this.initialHands,
        tricks: this.tricks,
        current: this.current,
        leader: this.leader,
        toAct: this.toAct,
        firstCardPlayed: this.firstCardPlayed,
        trucoLevel: this.trucoLevel,
        trucoRaiser: this.trucoRaiser,
        envidoResolved: this.envidoResolved,
        envidoForeclosed: this.envidoForeclosed,
        florResolved: this.florResolved,
        pending: this.pending,
        handOver: this.handOver,
        gameOver: this.gameOver,
        gameWinner: this.gameWinner,
      }));
    }

    static restore(state) {
      const g = Object.create(Game.prototype);
      Object.assign(g, JSON.parse(JSON.stringify(state)));
      g.events = [];
      return g;
    }
  }

  /* swap a serialized state between the two seat perspectives (you<->ai).
     The host's snapshot has you=host; mirroring it yields you=guest for the
     rival's engine, matching the deal-mirroring the online protocol already uses. */
  function mirror(state) {
    const sw = (p) => (p === "you" ? "ai" : p === "ai" ? "you" : p); // null / "tie" pass through
    return {
      scores: { you: state.scores.ai, ai: state.scores.you },
      dealer: sw(state.dealer),
      flor: state.flor,
      mano: sw(state.mano),
      hands: { you: state.hands.ai, ai: state.hands.you },
      initialHands: { you: state.initialHands.ai, ai: state.initialHands.you },
      tricks: state.tricks.map((t) => ({ you: t.ai, ai: t.you, winner: sw(t.winner) })),
      current: { you: state.current.ai, ai: state.current.you },
      leader: sw(state.leader),
      toAct: sw(state.toAct),
      firstCardPlayed: { you: state.firstCardPlayed.ai, ai: state.firstCardPlayed.you },
      trucoLevel: state.trucoLevel,
      trucoRaiser: sw(state.trucoRaiser),
      envidoResolved: state.envidoResolved,
      envidoForeclosed: state.envidoForeclosed,
      florResolved: state.florResolved,
      pending: state.pending ? { ...state.pending, caller: sw(state.pending.caller) } : null,
      handOver: state.handOver,
      gameOver: state.gameOver,
      gameWinner: sw(state.gameWinner),
    };
  }

  return { Game, power, envidoValue, florValue, isFlor, freshDeal, mirror, TRUCO_NAMES, TRUCO_HAND_VALUE, other };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Truco;
