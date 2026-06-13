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
    constructor(firstDealer, fixedHands) {
      this.scores = { you: 0, ai: 0 };
      this.dealer = firstDealer || (Math.random() < 0.5 ? "you" : "ai");
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
      this.pending = null;              // {kind:'truco', level} | {kind:'envido', chain:[...]} + caller
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

    /* legal actions for a player right now */
    legalActions(player) {
      if (this.gameOver || this.handOver) return [];

      // responding to a pending call
      if (this.pending && this.pending.caller !== player) {
        const acts = ["quiero", "no-quiero"];
        if (this.pending.kind === "truco") {
          if (this.pending.level < 3) acts.push(TRUCO_NAMES[this.pending.level + 1]);
          // "el envido está primero": initial Truco, trick 1, responder hasn't played.
          // The chain must open with plain Envido; raises come after.
          if (this.pending.level === 1 && this.envidoWindowOpen(player)) {
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

      if (this.pending) return []; // caller waits

      if (this.toAct !== player) return [];

      const acts = ["play"];
      // opening call is plain Envido only; Real/Falta enter as raises
      if (this.envidoWindowOpen(player)) acts.push("Envido");
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

    respond(player, accepted) {
      if (!this.pending || this.pending.caller === player) return false;
      const pending = this.pending;
      this.pending = null;

      this.emit("response", { player, accepted });

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
      pending: state.pending ? { ...state.pending, caller: sw(state.pending.caller) } : null,
      handOver: state.handOver,
      gameOver: state.gameOver,
      gameWinner: sw(state.gameWinner),
    };
  }

  return { Game, power, envidoValue, freshDeal, mirror, TRUCO_NAMES, TRUCO_HAND_VALUE, other };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Truco;
