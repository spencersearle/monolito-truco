/* ============================================================
   MONOLITO · ui.js
   Presentation + game flow: drains engine events into a timed
   animation queue, renders hands/tricks, drives the AI.
   ============================================================ */

(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    splash: $("splash"), stage: $("stage"),
    btnStart: $("btn-start"), btnRules: $("btn-rules"), btnCloseRules: $("btn-close-rules"),
    rulesOverlay: $("rules-overlay"), rulesContent: $("rules-content"),
    handYou: $("hand-you"), handAi: $("hand-ai"),
    playedYou: $("played-you"), playedAi: $("played-ai"),
    trickPips: $("trick-pips"),
    bubbleYou: $("bubble-you"), bubbleAi: $("bubble-ai"),
    callflash: $("callflash"),
    dockMsg: $("dock-msg"), dockButtons: $("dock-buttons"),
    pointsYou: $("points-you"), pointsAi: $("points-ai"),
    fillYou: $("fill-you"), fillAi: $("fill-ai"),
    stakeLabel: $("stake-label"),
  };

  let game = null;
  let queue = [];
  let busy = false;
  let aiThinking = false;
  let bubbleTimers = { you: null, ai: null };

  /* ---------- animation queue ---------- */

  function enqueue(fn, delay = 0) {
    queue.push({ fn, delay });
    if (!busy) pump();
  }

  function pump() {
    if (!queue.length) {
      busy = false;
      onIdle();
      return;
    }
    busy = true;
    const { fn, delay } = queue.shift();
    fn();
    setTimeout(pump, delay);
  }

  /* ---------- rendering ---------- */

  function makeCardEl(card, facedown) {
    const div = document.createElement("div");
    div.className = "card" + (facedown ? " facedown" : "");
    const face = document.createElement("div");
    face.className = "face";
    face.innerHTML = card ? Cards.cardSVG(card.suit, card.rank) : Cards.cardBackSVG();
    const back = document.createElement("div");
    back.className = "back";
    back.innerHTML = Cards.cardBackSVG();
    div.appendChild(face);
    div.appendChild(back);
    return div;
  }

  function renderHands(deal) {
    el.handYou.innerHTML = "";
    el.handAi.innerHTML = "";
    const canPlay = !busy && game && !game.pending && !game.handOver &&
      game.toAct === "you" && game.legalActions("you").includes("play");

    game.hands.you.forEach((card, i) => {
      const c = makeCardEl(card, false);
      if (deal) { c.classList.add("dealt-in"); c.style.animationDelay = `${i * 0.12}s`; }
      if (canPlay) {
        c.classList.add("playable");
        c.addEventListener("click", () => act(() => game.playCard("you", i)));
      } else {
        c.classList.add("disabled");
      }
      el.handYou.appendChild(c);
    });

    game.hands.ai.forEach((_, i) => {
      const c = makeCardEl(null, false);
      if (deal) { c.classList.add("dealt-in"); c.style.animationDelay = `${i * 0.12}s`; }
      el.handAi.appendChild(c);
    });
  }

  function renderPips() {
    el.trickPips.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement("div");
      pip.className = "pip";
      const t = game.tricks[i];
      if (t) pip.classList.add(t.winner === "tie" ? "tie" : t.winner);
      el.trickPips.appendChild(pip);
    }
  }

  function renderScores() {
    el.pointsYou.textContent = game.scores.you;
    el.pointsAi.textContent = game.scores.ai;
    el.fillYou.style.width = `${(game.scores.you / 30) * 100}%`;
    el.fillAi.style.width = `${(game.scores.ai / 30) * 100}%`;
  }

  function renderStake() {
    const v = Truco.TRUCO_HAND_VALUE[game.trucoLevel];
    el.stakeLabel.textContent = `${v} POINT${v > 1 ? "S" : ""} ON THE TABLE`;
  }

  function renderChips() {
    el.dockButtons.innerHTML = "";
    if (busy || !game || game.handOver || game.gameOver) return;
    const legal = game.legalActions("you").filter((a) => a !== "play");
    const labels = {
      "quiero": "QUIERO", "no-quiero": "NO QUIERO", "mazo": "ME VOY AL MAZO",
      "Envido": "ENVIDO", "Real Envido": "REAL ENVIDO", "Falta Envido": "FALTA ENVIDO",
      "Truco": "¡TRUCO!", "Retruco": "¡RETRUCO!", "Vale Cuatro": "¡VALE CUATRO!",
    };
    legal.forEach((name, i) => {
      const chip = document.createElement("button");
      chip.className = "chip" +
        (name === "no-quiero" ? " chip-no" : name === "mazo" ? " chip-danger" : "");
      chip.textContent = labels[name] || name;
      chip.style.animationDelay = `${i * 0.05}s`;
      chip.addEventListener("click", () => act(() => game.call("you", name)));
      el.dockButtons.appendChild(chip);
    });
  }

  function msg(text) { el.dockMsg.textContent = text; }

  function bubble(player, text, hold = 1600) {
    const b = player === "you" ? el.bubbleYou : el.bubbleAi;
    clearTimeout(bubbleTimers[player]);
    b.textContent = text;
    b.classList.remove("hidden");
    b.style.animation = "none";
    void b.offsetWidth; // restart pop-in
    b.style.animation = "";
    bubbleTimers[player] = setTimeout(() => b.classList.add("hidden"), hold);
  }

  function flash(text) {
    el.callflash.textContent = text;
    el.callflash.classList.remove("hidden");
    el.callflash.style.animation = "none";
    void el.callflash.offsetWidth;
    el.callflash.style.animation = "";
    setTimeout(() => el.callflash.classList.add("hidden"), 1500);
  }

  function clearBattle() {
    el.playedYou.innerHTML = "";
    el.playedAi.innerHTML = "";
  }

  /* ---------- event presentation ---------- */

  const CALL_TEXT = {
    "Envido": "¡ENVIDO!", "Real Envido": "¡REAL ENVIDO!", "Falta Envido": "¡FALTA ENVIDO!",
    "Truco": "¡TRUCO!", "Retruco": "¡RETRUCO!", "Vale Cuatro": "¡VALE CUATRO!",
  };

  function present(ev) {
    switch (ev.type) {
      case "hand-start":
        enqueue(() => {
          clearBattle();
          renderPips();
          renderStake();
          renderHands(true);
          msg(ev.mano === "you" ? "New hand — you are mano, you lead" : "New hand — El Monolito is mano");
        }, 700);
        break;

      case "card-played":
        enqueue(() => {
          const row = ev.player === "you" ? el.playedYou : el.playedAi;
          const c = makeCardEl(ev.card, false);
          c.classList.add("thrown");
          row.appendChild(c);
          renderHands(false);
        }, 650);
        break;

      case "turn":
        enqueue(() => {
          msg(ev.player === "you" ? "Your move" : "El Monolito is thinking…");
        }, 80);
        break;

      case "trick-end":
        enqueue(() => {
          const t = game.tricks[ev.trickIndex];
          const yCard = el.playedYou.lastElementChild;
          const aCard = el.playedAi.lastElementChild;
          if (t.winner === "you") { yCard?.classList.add("trick-win"); aCard?.classList.add("trick-lose"); }
          else if (t.winner === "ai") { aCard?.classList.add("trick-win"); yCard?.classList.add("trick-lose"); }
          renderPips();
          msg(t.winner === "tie" ? "¡Parda! — tied trick" :
              t.winner === "you" ? "You take the trick" : "El Monolito takes the trick");
        }, 1300);
        enqueue(() => clearBattle(), 150);
        break;

      case "call":
        enqueue(() => {
          const text = CALL_TEXT[ev.name] || ev.name;
          bubble(ev.player, text);
          if (["Truco", "Retruco", "Vale Cuatro", "Falta Envido"].includes(ev.name)) flash(text);
          msg(ev.player === "you" ? "Waiting for El Monolito…" : "El Monolito calls — your answer?");
        }, ["Truco", "Retruco", "Vale Cuatro", "Falta Envido"].includes(ev.name) ? 1400 : 900);
        break;

      case "response":
        enqueue(() => {
          bubble(ev.player, ev.accepted ? "QUIERO" : "NO QUIERO");
        }, 900);
        break;

      case "envido-primero":
        enqueue(() => msg("¡El envido está primero! Truco is set aside"), 900);
        break;

      case "envido-result": {
        const mano = ev.mano, pie = Truco.other(ev.mano);
        enqueue(() => bubble(mano, `${ev.values[mano]}`), 1100);
        enqueue(() => {
          if (ev.winner === pie) bubble(pie, `${ev.values[pie]} SON MEJORES`);
          else bubble(pie, "SON BUENAS");
        }, 1300);
        enqueue(() => {
          msg(ev.winner === "you"
            ? `You win the envido — ${ev.points} point${ev.points > 1 ? "s" : ""}`
            : `El Monolito wins the envido — ${ev.points} point${ev.points > 1 ? "s" : ""}`);
        }, 1100);
        break;
      }

      case "envido-declined":
        enqueue(() => {
          msg(ev.caller === "you"
            ? `Declined — you score ${ev.points}`
            : `You declined — El Monolito scores ${ev.points}`);
        }, 1000);
        break;

      case "stake":
        enqueue(() => renderStake(), 100);
        break;

      case "mazo":
        enqueue(() => bubble(ev.player, "ME VOY AL MAZO"), 1100);
        break;

      case "score":
        enqueue(() => renderScores(), 350);
        break;

      case "hand-end":
        enqueue(() => {
          const why = ev.reason === "mazo" ? " (fold)" : ev.reason === "no-quiero" ? " (no quiero)" : "";
          msg(ev.winner === "you"
            ? `You win the hand — ${ev.points} point${ev.points > 1 ? "s" : ""}${why}`
            : `El Monolito wins the hand — ${ev.points} point${ev.points > 1 ? "s" : ""}${why}`);
        }, 1900);
        if (!game.gameOver) {
          enqueue(() => { game.nextHand(); sync(); }, 0);
        }
        break;

      case "game-over":
        enqueue(() => showEndgame(ev.winner), 300);
        break;
    }
  }

  /* ---------- flow ---------- */

  function sync() {
    for (const ev of game.drainEvents()) present(ev);
    if (!busy) onIdle();
  }

  function act(fn) {
    if (busy || !game || game.gameOver) return;
    if (fn()) sync();
  }

  function onIdle() {
    if (!game || game.gameOver) return;
    renderHands(false);
    renderChips();
    renderScores();

    // AI's move?
    const aiMustRespond = game.pending && game.pending.caller === "you";
    const aiTurn = !game.pending && !game.handOver && game.toAct === "ai";
    if ((aiMustRespond || aiTurn) && !aiThinking) {
      aiThinking = true;
      setTimeout(() => {
        aiThinking = false;
        if (busy || !game || game.gameOver || game.handOver) return;
        const decision = TrucoAI.decide(game);
        if (!decision) return;
        const ok = decision.action === "play"
          ? game.playCard("ai", decision.index)
          : game.call("ai", decision.action);
        if (ok) sync();
      }, 850 + Math.random() * 700);
    }
  }

  function showEndgame(winner) {
    const div = document.createElement("div");
    div.className = "endgame";
    div.innerHTML = `
      <div class="endgame-inner">
        <div class="endgame-title">${winner === "you" ? "YOU WIN" : "EL MONOLITO WINS"}</div>
        <div class="endgame-sub">${game.scores.you} — ${game.scores.ai}</div>
        <button class="btn btn-gold" id="btn-again">PLAY AGAIN</button>
      </div>`;
    document.body.appendChild(div);
    div.querySelector("#btn-again").addEventListener("click", () => {
      div.remove();
      newGame();
    });
  }

  function newGame() {
    game = new Truco.Game();
    queue = [];
    busy = false;
    renderScores();
    sync();
  }

  /* ---------- rules overlay ---------- */

  el.rulesContent.innerHTML = `
    <h3>The Goal</h3>
    <p>First to <strong>30 points</strong>. Each hand you get 3 cards and play up to 3 tricks — win <strong>2 of 3 tricks</strong> to take the hand.</p>
    <h3>Card Power (high → low)</h3>
    <p><strong>1 espadas</strong> · <strong>1 bastos</strong> · <strong>7 espadas</strong> · <strong>7 oros</strong> · 3s · 2s · 1 copas/oros · 12s · 11s · 10s · 7 copas/bastos · 6s · 5s · 4s</p>
    <p><em>Suit doesn't matter otherwise — equal cards tie (parda), and ties favor whoever won the earliest trick, or the mano.</em></p>
    <h3>Envido</h3>
    <p>Called in the first trick, before you play your first card. Two cards of the same suit are worth their sum <strong>+ 20</strong> (face cards count 0). Best possible: 33.</p>
    <p><strong>Envido</strong> = 2 pts · <strong>Real Envido</strong> = 3 pts · <strong>Falta Envido</strong> = enough points to finish the game. Raises stack (Envido + Envido + Real = 7). Decline and the caller scores the previous stake (minimum 1).</p>
    <h3>Truco</h3>
    <p>Raise the value of the hand at any time: <strong>Truco</strong> (2) → <strong>Retruco</strong> (3) → <strong>Vale Cuatro</strong> (4). Only the side that said "quiero" may raise next. Decline and the caller takes the previous value.</p>
    <h3>Bluffing</h3>
    <p>Lying is legal and expected. Call truco with garbage. Decline nothing. Trust no one — especially El Monolito.</p>
    <h3>Me voy al mazo</h3>
    <p>Fold your hand and concede the current stake. In the first trick before envido it costs 2 points.</p>`;

  /* ---------- boot ---------- */

  el.btnStart.addEventListener("click", () => {
    el.splash.classList.add("gone");
    el.stage.classList.remove("hidden");
    newGame();
  });

  el.btnRules.addEventListener("click", () => el.rulesOverlay.classList.remove("hidden"));
  el.btnCloseRules.addEventListener("click", () => el.rulesOverlay.classList.add("hidden"));

  // deep link straight to the table
  if (location.hash === "#play") el.btnStart.click();
})();
