/* ============================================================
   MONOLITO · ui.js
   Presentation + game flow: drains engine events into a timed
   animation queue, renders hands/tricks, drives the AI (solo)
   or the PeerJS link (online — see net.js). Online play is
   lockstep: every browser runs a full engine; the host deals
   and broadcasts the hands, every action is replicated.
   1v1 mirrors seats; 2v2 uses absolute seats 0-3 (teams 0&2 vs
   1&3) with host-authoritative ordering: guests send intents,
   the host validates, applies, and broadcasts. Bots run on the
   host and are replicated exactly like human moves.
   ============================================================ */

(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    splash: $("splash"), stage: $("stage"),
    btnStart: $("btn-start"), btnRules: $("btn-rules"), btnCloseRules: $("btn-close-rules"),
    rulesOverlay: $("rules-overlay"), rulesContent: $("rules-content"),
    btnExit: $("btn-exit"),
    btnOnline: $("btn-online"),
    onlineOverlay: $("online-overlay"), onlineTitle: $("online-title"),
    onlineStatus: $("online-status"), onlineLinkbox: $("online-linkbox"),
    onlineLink: $("online-link"), btnCopyLink: $("btn-copy-link"),
    btnShareLink: $("btn-share-link"), onlineHint: $("online-hint"),
    btnOnlineCancel: $("btn-online-cancel"),
    onlineCodebox: $("online-codebox"), onlineCode: $("online-code"), btnCopyCode: $("btn-copy-code"),
    onlineNamebox: $("online-namebox"), onlineName: $("online-name"),
    onlineModes: $("online-modes"), btnMode1v1: $("btn-mode-1v1"), btnMode2v2: $("btn-mode-2v2"),
    btnJoinGame: $("btn-join-game"), onlineJoinbox: $("online-joinbox"),
    joinCode: $("join-code"), btnJoinGo: $("btn-join-go"),
    lobbyRoster: $("lobby-roster"), btnStart2v2: $("btn-start-2v2"),
    btnJoin2v2: $("btn-join-2v2"), btnLobbyChat: $("btn-lobby-chat"),
    lobbyChatBadge: $("lobby-chat-badge"), btnLobbyName: $("btn-lobby-name"),
    handYou: $("hand-you"), handAi: $("hand-ai"),
    handLeft: $("hand-left"), handRight: $("hand-right"),
    plateTop: $("plate-top"), plateLeft: $("plate-left"),
    plateRight: $("plate-right"), plateYou: $("plate-you"),
    playedYou: $("played-you"), playedAi: $("played-ai"),
    playedLeft: $("played-left"), playedRight: $("played-right"),
    trickPips: $("trick-pips"),
    bubbleYou: $("bubble-you"), bubbleAi: $("bubble-ai"),
    bubbleLeft: $("bubble-left"), bubbleRight: $("bubble-right"),
    callflash: $("callflash"),
    dockMsg: $("dock-msg"), dockButtons: $("dock-buttons"),
    pointsYou: $("points-you"), pointsAi: $("points-ai"),
    fillYou: $("fill-you"), fillAi: $("fill-ai"),
    stakeLabel: $("stake-label"),
    labelYou: document.querySelector("#score-you .hud-label"),
    labelOpp: document.querySelector("#score-ai .hud-label"),
    btnChat: $("btn-chat"), chatBadge: $("chat-badge"),
    chatPanel: $("chat-panel"), chatLog: $("chat-log"),
    chatForm: $("chat-form"), chatInput: $("chat-input"),
    btnChatClose: $("btn-chat-close"),
    chatToast: $("chat-toast"), chatToastWho: $("chat-toast-who"),
    chatToastText: $("chat-toast-text"),
    btnName: $("btn-name"), namePanel: $("name-panel"),
    nameInput: $("name-input"), btnNameSave: $("btn-name-save"),
    splashStats: $("splash-stats"), hudCode: $("hud-code"),
    soloOverlay: $("solo-overlay"), btnSoloBot: $("btn-solo-bot"),
    btnSoloLocal: $("btn-solo-local"), btnSoloCancel: $("btn-solo-cancel"),
    passgate: $("passgate"), passgateTitle: $("passgate-title"), passgateGo: $("passgate-go"),
    splashTag: $("splash-tag"), langToggle: $("lang-toggle"),
    settingsToggle: $("settings-toggle"), settingsOverlay: $("settings-overlay"),
    settingsTitle: $("settings-title"), btnCloseSettings: $("btn-close-settings"),
    setSound: $("set-sound"), setSoundLabel: $("set-sound-label"),
    setTheme: $("set-theme"), setThemeLabel: $("set-theme-label"),
    setHaptics: $("set-haptics"), setHapticsLabel: $("set-haptics-label"),
    setReset: $("set-reset"), setStatsLabel: $("set-stats-label"),
    settingsPrivacy: $("settings-privacy"),
    setBlocked: $("set-blocked"), setBlockedLabel: $("set-blocked-label"),
    settingsPolicyLink: $("settings-policy-link"),
    btnFlorSolo: $("btn-flor-solo"), btnFlorOnline: $("btn-flor-online"),
    // moderation (chat report/block) + the one-time content agreement
    chatHint: $("chat-hint"),
    modOverlay: $("mod-overlay"), modTitle: $("mod-title"),
    modWho: $("mod-who"), modText: $("mod-text"), modNote: $("mod-note"),
    btnModReport: $("btn-mod-report"), btnModBlock: $("btn-mod-block"),
    btnModCancel: $("btn-mod-cancel"),
    termsOverlay: $("terms-overlay"), termsTitle: $("terms-title"),
    termsBody: $("terms-body"), termsPolicyLink: $("terms-policy-link"),
    btnTermsAccept: $("btn-terms-accept"), btnTermsDecline: $("btn-terms-decline"),
  };

  /* ---------- i18n (English / Spanish) ---------- */

  let lang = localStorage.getItem("monolito-lang") === "es" ? "es" : "en";

  /* ---------- theme (dark / light, persisted) ---------- */

  let theme = localStorage.getItem("monolito-theme") === "light" ? "light" : "dark";

  function applyTheme() {
    document.body.classList.toggle("theme-light", theme === "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f3e8cd" : "#040a1c";
  }
  applyTheme();

  const PT = (n) => (lang === "es" ? (n > 1 ? "puntos" : "punto") : (n > 1 ? "points" : "point"));

  const T = {
    en: {
      // splash + menus
      splashTag: "Envido · Truco · Vale Cuatro — first to 30",
      dealMeIn: "DEAL ME IN", playOnline: "⟡ PLAY ONLINE", joinGame: "⇥ JOIN GAME",
      howToPlay: "HOW TO PLAY", back: "BACK",
      backAgain: "Press back again to leave the table",
      soloStatus: "A quick game right here on this device.",
      playBot: "⚔  PLAY A BOT", passPlay: "👥  PASS & PLAY",
      soloHint: "Pass & play hands one device back and forth between two players.",
      passSub: "Pass the device over — your cards are hidden until you tap.",
      ready: "I'M READY",
      florToggle: (on) => `FLOR (1v1): ${on ? "ON" : "OFF"}`,
      // online chrome
      yourName: "YOUR NAME", tableCode: "TABLE CODE", copy: "COPY", copied: "COPIED ✓",
      orCopyLink: "OR COPY A LINK", share: "SHARE…", startGame: "START GAME",
      joinTable: "JOIN TABLE", cancel: "CANCEL", editName: "✎ EDIT NAME",
      tableTalkBtn: "💬 TABLE TALK", save: "SAVE", tableTalk: "TABLE TALK",
      sayThis: "Say something…", playerPH: "Player",
      codeHint: 'Share this code — your friend types it into JOIN GAME to sit down or rejoin.',
      // lobby
      teamGold: "TEAM GOLD", teamBlue: "TEAM BLUE",
      waitingPlayer: "Waiting for a player…", tagBot: "  · BOT", tagYou: "  · YOU", tagHost: "  · HOST",
      addBot: "+ ADD BOT", remove: "REMOVE", teamBtn: "↕ TEAM", swapHere: "↕ SWAP HERE", cancelSwap: "✕ CANCEL",
      startReady: "START GAME", startFill: "FILL ALL 4 SEATS TO START",
      lobbySwap: "Pick the seat to switch with — swapping changes teams.",
      lobbyFull: "Table full — deal the cards! (↕ TEAM to rearrange sides)",
      lobbyShare: "Share the code — friends take seats as they arrive. Short a player? Add a bot.",
      lobbyHostStatus: "Share the code — friends take seats as they arrive.",
      lobbyWaitStart: "Waiting for the host to start the game…",
      atTheTable: "AT THE TABLE", your2v2: "YOUR 2v2 TABLE", summoning: "Summoning a table…",
      pickTable: "Pick your table — 1v1 duel or 2v2 with partners.",
      // hud
      you: "YOU", us: "US", them: "THEM", player1: "PLAYER 1", player2: "PLAYER 2",
      pointsOnTable: (v) => `${v} ${(v > 1 ? "POINTS" : "POINT")} ON THE TABLE`,
      code: (c) => "CODE " + c,
      // dock / play-by-play (1v1 + solo + local2)
      newHandYouMano: "New hand — you are mano, you lead",
      newHandOppMano: (o) => `New hand — ${o} is mano`,
      yourMove: "Your move", oppThinking: (o) => `${o} is thinking…`,
      p1Move: "Player 1's move", p2Move: "Player 2's move",
      passDevice: "Pass the device…", yourAnswer: "Your answer?",
      yourTurnP: (p) => `${p} — YOUR TURN`,
      parda: "¡Parda! — tied trick", youTakeTrick: "You take the trick",
      oppTakesTrick: (o) => `${o} takes the trick`,
      waitingFor: (o) => `Waiting for ${o}…`, oppCalls: (o) => `${o} calls — your answer?`,
      envidoPrimero: "¡El envido está primero! Truco is set aside",
      youWinEnvido: (n) => `You win the envido — ${n} ${PT(n)}`,
      oppWinsEnvido: (o, n) => `${o} wins the envido — ${n} ${PT(n)}`,
      declinedYouScore: (n) => `Declined — you score ${n}`,
      youDeclinedOppScores: (o, n) => `You declined — ${o} scores ${n}`,
      whyFold: " (fold)", whyNoQuiero: " (no quiero)",
      youWinHand: (n, w) => `You win the hand — ${n} ${PT(n)}${w}`,
      oppWinsHand: (o, n, w) => `${o} wins the hand — ${n} ${PT(n)}${w}`,
      // flor
      oppFlor: (o) => `${o} sings flor — your answer?`,
      florAnnul: "¡La flor mata al envido! — the envido is set aside",
      youWinFlor: (n) => `You win the flor — ${n} ${PT(n)}`,
      oppWinsFlor: (o, n) => `${o} wins the flor — ${n} ${PT(n)}`,
      florDeclinedYou: (n) => `Your rival backs down — you score ${n} ${PT(n)}`,
      florDeclinedOpp: (o, n) => `You back down — ${n} ${PT(n)} to ${o}`,
      // 2v2 play-by-play
      newHandYouMano4: "New hand — you are mano, you lead",
      newHandMano4: (n) => `New hand — ${n} is mano`,
      seatThinking: (n) => `${n} is thinking…`,
      youTakeTrick4: "You take the trick", seatTakesTrick: (n) => `${n} takes the trick`,
      waitingAnswer: "Waiting for an answer…",
      seatCallsAnswer: (n) => `${n} calls — your side answers`,
      seatCalls: (n) => `${n} calls…`,
      teamWinsEnvido: (n) => `Your team wins the envido — ${n} ${PT(n)}`,
      seatTeamEnvido: (s, n) => `${s}'s team wins the envido — ${n} ${PT(n)}`,
      teamDeclined: (n) => `Declined — your team scores ${n}`,
      seatTeamDeclined: (s, n) => `Declined — ${s}'s team scores ${n}`,
      teamWinsHand: (n, w) => `Your team wins the hand — ${n} ${PT(n)}${w}`,
      theyWinHand: (n, w) => `They win the hand — ${n} ${PT(n)}${w}`,
      // endgame
      youWin: "YOU WIN", oppWins: (o) => `${o} WINS`,
      p1Wins: "PLAYER 1 WINS", p2Wins: "PLAYER 2 WINS",
      yourTeamWins: "YOUR TEAM WINS", teamWins: (m) => `${m} WIN`,
      playAgain: "PLAY AGAIN", waitingHost: "WAITING FOR HOST…",
      inARow: (n) => ` · 🔥 ${n} in a row`,
      record: (w, l, st, b) => `${w}W — ${l}L${st} · best streak ${b}`,
      soloRecord: (w, l, st, b) => `Solo record: ${w}W — ${l}L${st} · best ${b}`,
      // pass & play (seat-neutral wording)
      rival: "your rival", rivalCap: "Your rival",
      declinedScores: (p, n) => `Declined — ${p} scores ${n}`,
      // online titles + notices
      onlineTitle: "PLAY ONLINE", joinTableTitle: "JOIN A TABLE",
      joiningTitle: "JOINING TABLE", tableReady: "YOUR TABLE IS READY",
      connLost: "CONNECTION LOST", tableClosed: "TABLE CLOSED",
      rivalLeftTitle: "RIVAL LEFT", rivalDisc: "RIVAL DISCONNECTED",
      leaveTable: "LEAVE TABLE",
      connLostTable: "The connection to the table was lost.",
      connLostRival: "The connection to your rival was lost.",
      desyncTable: "The game fell out of sync with the table.",
      desyncRival: "The game fell out of sync with your rival.",
      hostClosed: "The host closed the table.",
      rivalLeftTxt: "Your rival left the table.",
      rivalDiscTxt: "Waiting for your rival to rejoin — they can re-enter this code in JOIN GAME.",
      tableNotFound: "Table not found — it may have closed. Double-check the code, or ask for a fresh one.",
      netTimeout: "Couldn't reach the table — a network may be blocking the connection. Try again or switch networks.",
      brokerFail: "Can't reach the matchmaking server — check your connection and try again.",
      tableFull: "That table is full or already in play. Double-check the code, or ask for a new one.",
      noNet: "Online play couldn't load (the PeerJS script is unreachable). Check your connection and reload the page.",
      joinPrompt: "Enter the table code your friend shared.",
      codeTooShort: "Enter the table code (6 letters and numbers) the host is showing.",
      invitedTxt: "You're invited — pick a name and sit down.",
      crossing: "Crossing the gold sea…",
      connectedSeat: "Connected — taking a seat…",
      tableReadyTxt: "Give your rival this code to join — the cards fly the moment they're in.",
      rejoinHint: (c) => `The link to the table dropped. Enter code ${c} in JOIN GAME to rejoin.`,
      reconnected: "Reconnected — the hand plays on",
      rivalBack: "Your rival is back — play on",
      atTableMove: "You're at the table — your move",
      atTablePlays: "You're at the table — the hand plays on",
      shareText: "Join my Truco table — first to 30:",
      // chat system lines
      chatJoined: (n) => `${n} joined the table`,
      chatLeft: (n) => `${n} left the table`,
      chatTakesOver: (a, b) => `${a} takes over ${b}`,
      chatLeftBot: (a, b) => `${a} left — ${b} takes over`,
      chatRenamed: (a, b) => `${a} is now ${b}`,
      chatYouAre: (n) => `You are now ${n}`,
      // settings
      settingsTitle: "SETTINGS", soundLabel: "SOUND", on: "ON", off: "OFF",
      appearance: "APPEARANCE", dark: "DARK", light: "LIGHT",
      hapticsLabel: "VIBRATION",
      soloRecordLabel: "SOLO RECORD", reset: "RESET", resetConfirm: "SURE?", resetDone: "CLEARED",
      privacyNote: "Private by design — no accounts, no ads, no tracking, nothing stored on servers. " +
        "Online play links devices directly (peer-to-peer); names and table talk exist only during the game.",
      policyLink: "Privacy Policy & Terms",
      // moderation
      blockedLabel: "BLOCKED PLAYERS", blockedNone: "NONE",
      blockedCount: (n) => `CLEAR (${n})`, blockedCleared: "CLEARED",
      chatHint: "Tap a message to report or block its sender.",
      modTitle: "MESSAGE FROM",
      modReport: "⚑ REPORT MESSAGE", modBlock: "⊘ BLOCK PLAYER",
      modUnblock: "⊙ UNBLOCK PLAYER", modCancel: "CANCEL",
      modNote: "Reporting hides this player's messages for you right away and logs the report on this device. " +
        "Blocking hides them without filing a report.",
      modReported: (n) => `Reported — ${n} is now blocked`,
      modBlocked: (n) => `${n} is blocked — you won't see their messages`,
      modUnblocked: (n) => `${n} is unblocked`,
      blockedMsg: "Message hidden — player blocked",
      // one-time content agreement
      termsTitle: "BEFORE YOU PLAY ONLINE",
      termsBody: "Online tables have a chat, so you may see messages written by other players. " +
        "There is no tolerance for abusive or objectionable content. Tap any message to report it or " +
        "block its sender — blocked players' messages disappear immediately, and strong language is " +
        "filtered automatically.",
      termsAccept: "I AGREE", termsDecline: "BACK",
    },
    es: {
      splashTag: "Envido · Truco · Vale Cuatro — primero a 30",
      dealMeIn: "A JUGAR", playOnline: "⟡ JUGAR ONLINE", joinGame: "⇥ ENTRAR A UNA MESA",
      howToPlay: "CÓMO JUGAR", back: "VOLVER",
      backAgain: "Tocá atrás de nuevo para dejar la mesa",
      soloStatus: "Una partida rápida acá mismo, en este dispositivo.",
      playBot: "⚔  JUGAR VS BOT", passPlay: "👥  PASAR Y JUGAR",
      soloHint: "Pasar y jugar: un solo dispositivo que va y viene entre dos jugadores.",
      passSub: "Pasá el dispositivo — tus cartas quedan ocultas hasta que toques.",
      ready: "LISTO",
      florToggle: (on) => `CON FLOR (1v1): ${on ? "SÍ" : "NO"}`,
      yourName: "TU NOMBRE", tableCode: "CÓDIGO DE MESA", copy: "COPIAR", copied: "COPIADO ✓",
      orCopyLink: "O COPIAR UN ENLACE", share: "COMPARTIR…", startGame: "EMPEZAR",
      joinTable: "ENTRAR", cancel: "CANCELAR", editName: "✎ CAMBIAR NOMBRE",
      tableTalkBtn: "💬 CHARLA", save: "GUARDAR", tableTalk: "CHARLA DE MESA",
      sayThis: "Decí algo…", playerPH: "Jugador",
      codeHint: "Compartí este código — tu amigo lo escribe en ENTRAR para sentarse o volver.",
      teamGold: "EQUIPO ORO", teamBlue: "EQUIPO AZUL",
      waitingPlayer: "Esperando un jugador…", tagBot: "  · BOT", tagYou: "  · VOS", tagHost: "  · ANFITRIÓN",
      addBot: "+ SUMAR BOT", remove: "QUITAR", teamBtn: "↕ EQUIPO", swapHere: "↕ CAMBIAR ACÁ", cancelSwap: "✕ CANCELAR",
      startReady: "EMPEZAR", startFill: "LLENÁ LOS 4 ASIENTOS PARA EMPEZAR",
      lobbySwap: "Elegí el asiento con quién cambiar — cambiar de lugar cambia de equipo.",
      lobbyFull: "Mesa completa — ¡a repartir! (↕ EQUIPO para reordenar los lados)",
      lobbyShare: "Compartí el código — los amigos se sientan al llegar. ¿Falta gente? Sumá un bot.",
      lobbyHostStatus: "Compartí el código — los amigos se sientan al llegar.",
      lobbyWaitStart: "Esperando que el anfitrión empiece la partida…",
      atTheTable: "EN LA MESA", your2v2: "TU MESA 2v2", summoning: "Buscando una mesa…",
      pickTable: "Elegí tu mesa — duelo 1v1 o 2v2 con compañeros.",
      you: "VOS", us: "NOSOTROS", them: "ELLOS", player1: "JUGADOR 1", player2: "JUGADOR 2",
      pointsOnTable: (v) => `${v} ${(v > 1 ? "PUNTOS" : "PUNTO")} EN LA MESA`,
      code: (c) => "CÓDIGO " + c,
      newHandYouMano: "Mano nueva — sos mano, vos abrís",
      newHandOppMano: (o) => `Mano nueva — ${o} es mano`,
      yourMove: "Tu jugada", oppThinking: (o) => `${o} está pensando…`,
      p1Move: "Juega el Jugador 1", p2Move: "Juega el Jugador 2",
      passDevice: "Pasá el dispositivo…", yourAnswer: "¿Tu respuesta?",
      yourTurnP: (p) => `${p} — TE TOCA`,
      parda: "¡Parda! — empate", youTakeTrick: "Te llevás la baza",
      oppTakesTrick: (o) => `${o} se lleva la baza`,
      waitingFor: (o) => `Esperando a ${o}…`, oppCalls: (o) => `${o} canta — ¿qué hacés?`,
      envidoPrimero: "¡El envido está primero! El truco queda en pausa",
      youWinEnvido: (n) => `Ganás el envido — ${n} ${PT(n)}`,
      oppWinsEnvido: (o, n) => `${o} gana el envido — ${n} ${PT(n)}`,
      declinedYouScore: (n) => `No quiero — sumás ${n}`,
      youDeclinedOppScores: (o, n) => `No quisiste — ${o} suma ${n}`,
      whyFold: " (al mazo)", whyNoQuiero: " (no quiero)",
      youWinHand: (n, w) => `Ganás la mano — ${n} ${PT(n)}${w}`,
      oppWinsHand: (o, n, w) => `${o} gana la mano — ${n} ${PT(n)}${w}`,
      oppFlor: (o) => `${o} canta flor — ¿qué hacés?`,
      florAnnul: "¡La flor mata al envido! — el envido queda anulado",
      youWinFlor: (n) => `Ganás la flor — ${n} ${PT(n)}`,
      oppWinsFlor: (o, n) => `${o} gana la flor — ${n} ${PT(n)}`,
      florDeclinedYou: (n) => `Tu rival se achica — sumás ${n} ${PT(n)}`,
      florDeclinedOpp: (o, n) => `Te achicás — ${n} ${PT(n)} para ${o}`,
      newHandYouMano4: "Mano nueva — sos mano, vos abrís",
      newHandMano4: (n) => `Mano nueva — ${n} es mano`,
      seatThinking: (n) => `${n} está pensando…`,
      youTakeTrick4: "Te llevás la baza", seatTakesTrick: (n) => `${n} se lleva la baza`,
      waitingAnswer: "Esperando respuesta…",
      seatCallsAnswer: (n) => `${n} canta — responde tu equipo`,
      seatCalls: (n) => `${n} canta…`,
      teamWinsEnvido: (n) => `Tu equipo gana el envido — ${n} ${PT(n)}`,
      seatTeamEnvido: (s, n) => `El equipo de ${s} gana el envido — ${n} ${PT(n)}`,
      teamDeclined: (n) => `No quiero — tu equipo suma ${n}`,
      seatTeamDeclined: (s, n) => `No quiero — el equipo de ${s} suma ${n}`,
      teamWinsHand: (n, w) => `Tu equipo gana la mano — ${n} ${PT(n)}${w}`,
      theyWinHand: (n, w) => `Ellos ganan la mano — ${n} ${PT(n)}${w}`,
      youWin: "GANASTE", oppWins: (o) => `GANA ${o}`,
      p1Wins: "GANA EL JUGADOR 1", p2Wins: "GANA EL JUGADOR 2",
      yourTeamWins: "GANA TU EQUIPO", teamWins: (m) => `GANAN ${m}`,
      playAgain: "OTRA MANO", waitingHost: "ESPERANDO AL ANFITRIÓN…",
      inARow: (n) => ` · 🔥 ${n} seguidas`,
      record: (w, l, st, b) => `${w}G — ${l}P${st} · mejor racha ${b}`,
      soloRecord: (w, l, st, b) => `Récord solo: ${w}G — ${l}P${st} · mejor ${b}`,
      rival: "tu rival", rivalCap: "Tu rival",
      declinedScores: (p, n) => `No quiero — ${p} suma ${n}`,
      onlineTitle: "JUGAR ONLINE", joinTableTitle: "ENTRAR A UNA MESA",
      joiningTitle: "ENTRANDO A LA MESA", tableReady: "TU MESA ESTÁ LISTA",
      connLost: "SE CORTÓ LA CONEXIÓN", tableClosed: "MESA CERRADA",
      rivalLeftTitle: "TU RIVAL SE FUE", rivalDisc: "RIVAL DESCONECTADO",
      leaveTable: "DEJAR LA MESA",
      connLostTable: "Se perdió la conexión con la mesa.",
      connLostRival: "Se perdió la conexión con tu rival.",
      desyncTable: "La partida se desincronizó de la mesa.",
      desyncRival: "La partida se desincronizó de tu rival.",
      hostClosed: "El anfitrión cerró la mesa.",
      rivalLeftTxt: "Tu rival dejó la mesa.",
      rivalDiscTxt: "Esperando que tu rival vuelva — puede reingresar este código en ENTRAR A UNA MESA.",
      tableNotFound: "No se encontró la mesa — puede que haya cerrado. Revisá el código o pedí uno nuevo.",
      netTimeout: "No se pudo llegar a la mesa — alguna red puede estar bloqueando la conexión. Probá de nuevo o cambiá de red.",
      brokerFail: "No se pudo contactar el servidor de mesas — revisá tu conexión y probá de nuevo.",
      tableFull: "Esa mesa está llena o ya en juego. Revisá el código o pedí uno nuevo.",
      noNet: "No se pudo cargar el juego online (el script de PeerJS no responde). Revisá tu conexión y recargá la página.",
      joinPrompt: "Escribí el código de mesa que te compartieron.",
      codeTooShort: "Escribí el código de mesa (6 letras y números) que muestra el anfitrión.",
      invitedTxt: "Estás invitado — elegí un nombre y sentate.",
      crossing: "Cruzando el mar dorado…",
      connectedSeat: "Conectado — tomando asiento…",
      tableReadyTxt: "Pasale este código a tu rival — las cartas vuelan apenas entra.",
      rejoinHint: (c) => `Se cortó el enlace con la mesa. Ingresá el código ${c} en ENTRAR A UNA MESA para volver.`,
      reconnected: "Reconectado — la mano sigue",
      rivalBack: "Tu rival volvió — se sigue jugando",
      atTableMove: "Estás en la mesa — tu jugada",
      atTablePlays: "Estás en la mesa — la mano sigue",
      shareText: "Sumate a mi mesa de Truco — primero a 30:",
      chatJoined: (n) => `${n} se sentó a la mesa`,
      chatLeft: (n) => `${n} dejó la mesa`,
      chatTakesOver: (a, b) => `${a} reemplaza a ${b}`,
      chatLeftBot: (a, b) => `${a} se fue — lo reemplaza ${b}`,
      chatRenamed: (a, b) => `${a} ahora es ${b}`,
      chatYouAre: (n) => `Ahora sos ${n}`,
      settingsTitle: "AJUSTES", soundLabel: "SONIDO", on: "SÍ", off: "NO",
      appearance: "APARIENCIA", dark: "OSCURO", light: "CLARO",
      hapticsLabel: "VIBRACIÓN",
      soloRecordLabel: "RÉCORD SOLO", reset: "BORRAR", resetConfirm: "¿SEGURO?", resetDone: "BORRADO",
      privacyNote: "Privado por diseño — sin cuentas, sin publicidad, sin rastreo, nada guardado en servidores. " +
        "El juego online conecta los dispositivos directamente (peer-to-peer); los nombres y la charla existen solo durante la partida.",
      policyLink: "Política de Privacidad y Términos",
      // moderación
      blockedLabel: "JUGADORES BLOQUEADOS", blockedNone: "NINGUNO",
      blockedCount: (n) => `BORRAR (${n})`, blockedCleared: "BORRADO",
      chatHint: "Tocá un mensaje para denunciarlo o bloquear a quien lo mandó.",
      modTitle: "MENSAJE DE",
      modReport: "⚑ DENUNCIAR MENSAJE", modBlock: "⊘ BLOQUEAR JUGADOR",
      modUnblock: "⊙ DESBLOQUEAR JUGADOR", modCancel: "CANCELAR",
      modNote: "Denunciar oculta los mensajes de este jugador al instante y guarda la denuncia en este dispositivo. " +
        "Bloquear lo oculta sin presentar denuncia.",
      modReported: (n) => `Denunciado — ${n} quedó bloqueado`,
      modBlocked: (n) => `${n} está bloqueado — no vas a ver sus mensajes`,
      modUnblocked: (n) => `${n} está desbloqueado`,
      blockedMsg: "Mensaje oculto — jugador bloqueado",
      // acuerdo de contenido, una sola vez
      termsTitle: "ANTES DE JUGAR ONLINE",
      termsBody: "Las mesas online tienen chat, así que podés ver mensajes escritos por otros jugadores. " +
        "No se tolera el contenido abusivo ni ofensivo. Tocá cualquier mensaje para denunciarlo o bloquear " +
        "a quien lo mandó — los mensajes de los bloqueados desaparecen al instante, y las malas palabras se " +
        "filtran automáticamente.",
      termsAccept: "ACEPTO", termsDecline: "VOLVER",
    },
  };

  function t(key, ...args) {
    const v = (T[lang] && T[lang][key] != null) ? T[lang][key] : T.en[key];
    if (v == null) return key;
    return typeof v === "function" ? v(...args) : v;
  }

  /* the table code for the game in progress (online only), so players can
     share it or rejoin without leaving the table */
  function activeCode() {
    if (net) return net.role === "host" ? myTableCode : joinCode;
    if (room) return room.role === "host" ? myTableCode : room.code;
    return null;
  }

  function renderHudCode() {
    const code = activeCode();
    if (code) {
      el.hudCode.textContent = t("code", code.toUpperCase());
      el.hudCode.classList.remove("hidden");
    } else {
      el.hudCode.classList.add("hidden");
    }
  }

  /* ---------- state ---------- */

  let game = null;             // 1v1 / solo engine
  let net = null;              // null = solo vs AI; { role: 'host'|'guest' } = online 1v1
  let local2 = false;          // solo: pass-and-play (two humans hot-seat on one device)
  let controller = "you";      // local2: which seat's cards are revealed/playable right now
  let botName = "El Monolito"; // solo vs bot: the AI opponent's name this game
  let florOn = localStorage.getItem("monolito-flor") !== "0"; // "con flor" variant (1v1/solo), on unless turned off
  let rivalName = null;        // 1v1 online rival's name
  let pendingDeal = null;      // 1v1 guest: next hand received mid-animation
  let rivalGone = false;       // 1v1 host: rival dropped, paused waiting for rejoin
  let myTableCode = null;      // the code others type in to join/rejoin my table
  let joinCode = null;         // code I'm joining with (mode auto-detected from msgs)

  let game4 = null;            // 2v2 engine (absolute seats 0-3)
  let room = null;             // 2v2: { role, code, seats:[{kind,name,connId}], mySeat, started }
  let pendingDeal4 = null;     // 2v2 guest: next hand received mid-animation
  let awaitingEcho = false;    // 2v2 guest: sent an intent, waiting for host's broadcast
  let echoTimer = null;
  let botTimer = null;
  let swapPick = null;         // 2v2 host lobby: first seat picked for a team swap

  let queue = [];
  let busy = false;
  let aiThinking = false;
  let bubbleTimers = { you: null, top: null, left: null, right: null };
  let unreadChat = 0;
  let toastTimer = null;

  // heartbeat: detect a silently dropped peer (abrupt close / lost wifi) fast,
  // so rejoin kicks in within seconds rather than waiting on an ICE timeout
  let hbTimer = null;
  let rivalSeen = 0;                 // 1v1 / 2v2-guest: last message from the table
  const peerSeen = new Map();        // 2v2-host: connId -> last message timestamp
  const HB_INTERVAL = 2500;
  const HB_TIMEOUT = 8000;

  const BOT_NAMES = ["MONOBOT", "ORO-9", "AZUR", "VALE-4"];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const cleanName = (s) =>
    String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 14) || "Player";

  function myName() {
    return cleanName(el.onlineName.value || localStorage.getItem("monolito-name") || "Player");
  }

  // Argentine names/nicknames the local bot can wear (El Monolito stays in the mix)
  const BOT_OPPONENTS = ["El Monolito", "El Pampa", "Don Roberto", "Beto", "Tincho",
    "La Mona", "El Tano", "Diego", "Lucho", "El Colo"];

  const OPP_NAME = () =>
    net ? (rivalName || t("rival")) : local2 ? t("player2") : botName;
  const OPP_CAP = () =>
    net ? (rivalName || t("rivalCap")) : local2 ? t("player2") : botName;

  /* pass-and-play: seat-neutral label ("Player 1"/"Player 2", translated) */
  const seatLabel1 = (seat) => (seat === "you" ? t("player1") : t("player2"));

  /* ---------- match stats (solo vs El Monolito, persisted) ---------- */

  const Stats = (() => {
    const KEY = "monolito-stats";
    function get() {
      let s = {};
      try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
      return { wins: s.wins || 0, losses: s.losses || 0, streak: s.streak || 0, best: s.best || 0 };
    }
    function record(won) {
      const s = get();
      if (won) { s.wins++; s.streak++; if (s.streak > s.best) s.best = s.streak; }
      else { s.losses++; s.streak = 0; }
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    function reset() { localStorage.removeItem(KEY); }
    return { get, record, reset };
  })();

  /* ---------- El Monolito's voice (solo only — taunts in his bubble) ---------- */

  const TAUNTS = {
    truco:    ["¿Tenés con qué?", "No parpadeo, eh.", "Subo. Temblá.", "A ver esas cartas…", "¿Vas a querer?"],
    envido:   ["Mis números cantan solos.", "El envido es mío.", "Contá… igual perdés.", "Treinta y tres, casi siempre."],
    winHand:  ["Otra a la bolsa.", "Así se juega al truco.", "¿Aprendiste algo?", "No perdono.", "Previsible."],
    youFold:  ["Sabia decisión.", "Al mazo, como debe ser.", "Siempre gano.", "Huir también es jugar."],
    winGame:  ["Acá sigo, intacto.", "Treinta. No me muevo.", "No me rompés.", "¿Otra derrota?"],
    loseGame: ["Hoy cedo… por hoy.", "Disfrutá. No se repetirá.", "Hmph. Suerte de principiante.", "Volveré."],
  };
  const pickTaunt = (kind) => {
    const pool = TAUNTS[kind];
    return pool ? pool[Math.floor(Math.random() * pool.length)] : "";
  };
  // show a taunt in El Monolito's bubble; solo play only, with a chance to stay quiet.
  // queued after the triggering event, which supplies the pause before he speaks.
  function taunt(kind, chance = 0.5, hold = 2200) {
    if (net || local2) return;             // only the solo bot talks trash
    if (Math.random() > chance) return;
    const line = pickTaunt(kind);
    if (line) enqueue(() => bubbleAt("top", line, hold), 350);
  }

  /* 2v2 helpers: absolute seat -> table position relative to my seat */
  const seatPos = (seat) => ["you", "left", "top", "right"][(seat - room.mySeat + 4) % 4];
  const myTeam = () => room.mySeat % 2;
  const seatName = (seat) => (seat === room.mySeat ? "You" : room.seats[seat].name);
  const seatIsHuman = (seat) => room.seats[seat].kind !== "bot";

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

  function onIdle() {
    if (game4) onIdle4();
    else onIdle1();
  }

  /* ---------- heartbeat (drop detection) ---------- */

  function startHeartbeat() {
    stopHeartbeat();
    rivalSeen = Date.now();
    peerSeen.clear();
    hbTimer = setInterval(heartbeatTick, HB_INTERVAL);
  }

  function stopHeartbeat() {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    peerSeen.clear();
  }

  function markRivalSeen() { rivalSeen = Date.now(); }
  function markPeerSeen(id) { peerSeen.set(id, Date.now()); }

  function heartbeatTick() {
    const now = Date.now();
    if (net) {                                   // 1v1 (host or guest)
      Net.send({ t: "hb" });
      if (now - rivalSeen > HB_TIMEOUT) {
        if (net.role === "host") hostRival1Dropped();
        else guestConnLost();
      }
      return;
    }
    if (room && room.role === "host") {          // 2v2 host watches each guest
      Net.broadcast({ t: "hb" });
      for (const [seat, s] of room.seats.entries()) {
        if (s.connId == null) continue;
        if (now - (peerSeen.get(s.connId) || now) > HB_TIMEOUT) {
          peerSeen.delete(s.connId);
          Net.closePeer(s.connId);
          hostSeatLost(seat);                    // lobby: free seat · in-game: bot takes over
        }
      }
      return;
    }
    if (room && room.role === "guest") {         // 2v2 guest watches the host
      Net.send({ t: "hb" });
      if (now - rivalSeen > HB_TIMEOUT)
        netEnded4(t("connLost"), t("connLostTable"));
    }
  }

  /* ---------- rendering (shared) ---------- */

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

  function msg(text) { el.dockMsg.textContent = text; }

  const BUBBLES = { you: () => el.bubbleYou, top: () => el.bubbleAi, left: () => el.bubbleLeft, right: () => el.bubbleRight };

  function bubbleAt(pos, text, hold = 1600) {
    const b = BUBBLES[pos]();
    clearTimeout(bubbleTimers[pos]);
    b.textContent = text;
    b.classList.remove("hidden");
    b.style.animation = "none";
    void b.offsetWidth; // restart pop-in
    b.style.animation = "";
    bubbleTimers[pos] = setTimeout(() => b.classList.add("hidden"), hold);
  }

  function bubble(player, text, hold) { bubbleAt(player === "you" ? "you" : "top", text, hold); }

  function flash(text) {
    Sound.play("call");
    Haptics.call();
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
    el.playedLeft.innerHTML = "";
    el.playedRight.innerHTML = "";
  }

  const CALL_TEXT = {
    "Envido": "¡ENVIDO!", "Real Envido": "¡REAL ENVIDO!", "Falta Envido": "¡FALTA ENVIDO!",
    "Truco": "¡TRUCO!", "Retruco": "¡RETRUCO!", "Vale Cuatro": "¡VALE CUATRO!",
    "Flor": "¡FLOR!", "Contraflor": "¡CONTRAFLOR!", "Contraflor al Resto": "¡CONTRAFLOR AL RESTO!",
  };

  const CHIP_LABELS = {
    "quiero": "QUIERO", "no-quiero": "NO QUIERO", "mazo": "ME VOY AL MAZO",
    "Envido": "ENVIDO", "Real Envido": "REAL ENVIDO", "Falta Envido": "FALTA ENVIDO",
    "Truco": "¡TRUCO!", "Retruco": "¡RETRUCO!", "Vale Cuatro": "¡VALE CUATRO!",
    "Flor": "¡FLOR!", "Contraflor": "CONTRAFLOR", "Contraflor al Resto": "CONTRAFLOR AL RESTO",
  };

  // calls that get the big flash + a louder treatment
  const BIG_CALLS = ["Truco", "Retruco", "Vale Cuatro", "Falta Envido",
    "Flor", "Contraflor", "Contraflor al Resto"];

  function renderChipButtons(legal, onPick) {
    el.dockButtons.innerHTML = "";
    legal.forEach((name, i) => {
      const chip = document.createElement("button");
      chip.className = "chip" +
        (name === "no-quiero" ? " chip-no" : name === "mazo" ? " chip-danger" : "");
      chip.textContent = CHIP_LABELS[name] || name;
      chip.style.animationDelay = `${i * 0.05}s`;
      chip.addEventListener("click", () => onPick(name));
      el.dockButtons.appendChild(chip);
    });
  }

  /* ---------- rendering (1v1 / solo) ---------- */

  function renderHands(deal) {
    el.handYou.innerHTML = "";
    el.handAi.innerHTML = "";
    renderSeatHand("you", el.handYou, deal);
    renderSeatHand("ai", el.handAi, deal);
  }

  /* render one seat's hand. Face-up only for the seat that should see it:
     in solo/online that's always "you"; in pass-and-play it's the seat
     currently holding the device (controller). */
  function renderSeatHand(seat, holder, deal) {
    const faceUp = local2 ? seat === controller : seat === "you";
    const canPlay = faceUp && !busy && game && !game.pending && !game.handOver &&
      game.toAct === seat && game.legalActions(seat).includes("play");
    game.hands[seat].forEach((card, i) => {
      const c = makeCardEl(faceUp ? card : null, false);
      if (deal) { c.classList.add("dealt-in"); c.style.animationDelay = `${i * 0.12}s`; }
      if (canPlay) {
        c.classList.add("playable");
        c.addEventListener("click", () => localPlay(i, seat));
      } else {
        c.classList.add("disabled");
      }
      holder.appendChild(c);
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
    el.stakeLabel.textContent = t("pointsOnTable", v);
  }

  function renderChips() {
    el.dockButtons.innerHTML = "";
    if (busy || !game || game.handOver || game.gameOver) return;
    const seat = local2 ? controller : "you";
    const legal = game.legalActions(seat).filter((a) => a !== "play");
    renderChipButtons(legal, (name) => localCall(name, seat));
  }

  /* ---------- event presentation (1v1 / solo) ---------- */

  function present(ev) {
    switch (ev.type) {
      case "hand-start":
        enqueue(() => {
          clearBattle();
          renderPips();
          renderStake();
          Sound.play("deal");
          renderHands(true);
          msg(local2 ? t("newHandOppMano", seatLabel1(ev.mano))
            : ev.mano === "you" ? t("newHandYouMano") : t("newHandOppMano", OPP_NAME()));
        }, 700);
        break;

      case "card-played":
        enqueue(() => {
          const row = ev.player === "you" ? el.playedYou : el.playedAi;
          const c = makeCardEl(ev.card, false);
          Sound.play("card");
          if (ev.player === "you") Haptics.tap();
          c.classList.add("thrown");
          row.appendChild(c);
          renderHands(false);
        }, 650);
        break;

      case "turn":
        enqueue(() => {
          if (local2) msg(ev.player === "you" ? t("p1Move") : t("p2Move"));
          else msg(ev.player === "you" ? t("yourMove") : t("oppThinking", OPP_CAP()));
        }, 80);
        break;

      case "trick-end":
        enqueue(() => {
          const tr = game.tricks[ev.trickIndex];
          const yCard = el.playedYou.lastElementChild;
          const aCard = el.playedAi.lastElementChild;
          if (tr.winner === "you") { yCard?.classList.add("trick-win"); aCard?.classList.add("trick-lose"); }
          else if (tr.winner === "ai") { aCard?.classList.add("trick-win"); yCard?.classList.add("trick-lose"); }
          if (tr.winner !== "tie") Sound.play("trick");
          if (tr.winner === "you") Haptics.trick();
          renderPips();
          msg(tr.winner === "tie" ? t("parda") :
              local2 ? t("oppTakesTrick", seatLabel1(tr.winner)) :
              tr.winner === "you" ? t("youTakeTrick") : t("oppTakesTrick", OPP_CAP()));
        }, 1300);
        enqueue(() => clearBattle(), 150);
        break;

      case "call": {
        const big = BIG_CALLS.includes(ev.name);
        const isFlorCall = ["Flor", "Contraflor", "Contraflor al Resto"].includes(ev.name);
        enqueue(() => {
          const text = CALL_TEXT[ev.name] || ev.name;
          bubble(ev.player, text);
          if (big) flash(text);
          msg(local2 ? t("seatCalls", seatLabel1(ev.player))
            : ev.player === "you" ? t("waitingFor", OPP_NAME())
            : isFlorCall ? t("oppFlor", OPP_CAP()) : t("oppCalls", OPP_CAP()));
        }, big ? 1400 : 900);
        if (ev.player === "ai") {
          if (["Truco", "Retruco", "Vale Cuatro"].includes(ev.name)) taunt("truco", 0.5);
          else if (["Envido", "Real Envido", "Falta Envido"].includes(ev.name)) taunt("envido", 0.4);
        }
        break;
      }

      case "response":
        enqueue(() => {
          bubble(ev.player, ev.accepted ? "QUIERO" : "NO QUIERO");
        }, 900);
        break;

      case "envido-primero":
        enqueue(() => msg(t("envidoPrimero")), 900);
        break;

      case "envido-result": {
        const mano = ev.mano, pie = Truco.other(ev.mano);
        enqueue(() => bubble(mano, `${ev.values[mano]}`), 1100);
        enqueue(() => {
          if (ev.winner === pie) bubble(pie, `${ev.values[pie]} SON MEJORES`);
          else bubble(pie, "SON BUENAS");
        }, 1300);
        enqueue(() => {
          msg(local2 ? t("oppWinsEnvido", seatLabel1(ev.winner), ev.points)
            : ev.winner === "you"
            ? t("youWinEnvido", ev.points)
            : t("oppWinsEnvido", OPP_CAP(), ev.points));
        }, 1100);
        break;
      }

      case "envido-declined":
        enqueue(() => {
          msg(local2 ? t("declinedScores", seatLabel1(ev.caller), ev.points)
            : ev.caller === "you"
            ? t("declinedYouScore", ev.points)
            : t("youDeclinedOppScores", OPP_NAME(), ev.points));
        }, 1000);
        break;

      case "flor-annul":
        enqueue(() => msg(t("florAnnul")), 800);
        break;

      case "flor-result": {
        const mano = ev.mano, pie = Truco.other(ev.mano);
        if (ev.contested) {
          enqueue(() => bubble(mano, `FLOR ${ev.values[mano]}`), 1100);
          enqueue(() => bubble(pie, `FLOR ${ev.values[pie]}`), 1300);
        }
        enqueue(() => {
          msg(local2 ? t("oppWinsFlor", seatLabel1(ev.winner), ev.points)
            : ev.winner === "you" ? t("youWinFlor", ev.points) : t("oppWinsFlor", OPP_CAP(), ev.points));
        }, 1100);
        break;
      }

      case "flor-declined":
        enqueue(() => {
          msg(local2 ? t("declinedScores", seatLabel1(ev.caller), ev.points)
            : ev.caller === "you"
            ? t("florDeclinedYou", ev.points)
            : t("florDeclinedOpp", OPP_NAME(), ev.points));
        }, 1000);
        break;

      case "stake":
        enqueue(() => renderStake(), 100);
        break;

      case "mazo":
        enqueue(() => bubble(ev.player, "ME VOY AL MAZO"), 1100);
        if (ev.player === "you") taunt("youFold", 0.5);
        break;

      case "score":
        enqueue(() => renderScores(), 350);
        break;

      case "hand-end":
        enqueue(() => {
          const why = ev.reason === "mazo" ? t("whyFold") : ev.reason === "no-quiero" ? t("whyNoQuiero") : "";
          msg(local2 ? t("oppWinsHand", seatLabel1(ev.winner), ev.points, why)
            : ev.winner === "you"
            ? t("youWinHand", ev.points, why)
            : t("oppWinsHand", OPP_CAP(), ev.points, why));
        }, 1900);
        if (ev.winner === "ai" && !game.gameOver) taunt("winHand", 0.4);
        if (!game.gameOver) {
          if (!net) {
            // clear the old hand so the fresh deal is unmistakable (esp. after
            // an immediate fold/no-quiero, where no cards were played)
            enqueue(() => { el.handYou.innerHTML = ""; el.handAi.innerHTML = ""; }, 200);
            enqueue(() => { game.nextHand(); sync(); }, 0);
          } else if (net.role === "host") {
            // host deals the next hand and broadcasts it; guest waits for it
            enqueue(() => {
              if (!net || !game || game.gameOver) return;
              const fixed = Truco.freshDeal();
              game.nextHand(fixed);
              Net.send({ t: "deal", hands: { host: fixed.you, guest: fixed.ai } });
              sync();
            }, 0);
          }
        }
        break;

      case "game-over":
        enqueue(() => showEndgame(ev.winner), 300);
        break;
    }
  }

  /* ---------- flow (1v1 / solo) ---------- */

  function sync() {
    for (const ev of game.drainEvents()) present(ev);
    if (!busy) onIdle();
  }

  function localPlay(index, seat = "you") {
    if (busy || !game || game.gameOver) return;
    if (local2) { if (game.playCard(seat, index)) sync(); return; }
    if (game.playCard("you", index)) {
      if (net) Net.send({ t: "act", a: { kind: "play", index } });
      sync();
    }
  }

  function localCall(name, seat = "you") {
    if (busy || !game || game.gameOver) return;
    if (local2) { if (game.call(seat, name)) sync(); return; }
    if (game.call("you", name)) {
      if (net) Net.send({ t: "act", a: { kind: "call", name } });
      sync();
    }
  }

  function onIdle1() {
    if (!game || game.gameOver) return;

    // guest: a new hand arrived while the last one was still animating
    if (net && pendingDeal) {
      const hands = pendingDeal;
      pendingDeal = null;
      applyDeal(hands);
      return;
    }

    if (local2) { idleLocal2(); return; }   // pass-and-play hot-seat

    renderHands(false);
    renderChips();
    renderScores();

    if (net) return; // online: the rival acts over the wire, not here

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

  /* ---------- pass-and-play (two humans, one device) ---------- */

  /* the seat that must act now: the responder to a pending call, else toAct */
  function activeSeat1() {
    if (game.pending) return Truco.other(game.pending.caller);
    return game.toAct;
  }

  function idleLocal2() {
    renderScores();
    if (game.handOver) { renderHands(false); el.dockButtons.innerHTML = ""; return; }
    const active = activeSeat1();
    if (controller !== active) {
      showPassGate(active);                 // hand the device to the next player
    } else {
      el.passgate.classList.add("hidden");
      renderHands(false);
      renderChips();
    }
  }

  /* cover the table so the incoming player can't see the outgoing hand */
  function showPassGate(seat) {
    el.dockButtons.innerHTML = "";
    el.passgateTitle.textContent = t("yourTurnP", seat === "you" ? t("player1") : t("player2"));
    el.passgate.classList.remove("hidden");
    msg(t("passDevice"));
  }

  function passGateReady() {
    if (!local2 || !game) return;
    controller = activeSeat1();
    el.passgate.classList.add("hidden");
    renderHands(false);
    renderChips();
    msg(controller === game.toAct && !game.pending ? t("yourMove") : t("yourAnswer"));
  }

  function showEndgame(winner) {
    el.passgate.classList.add("hidden");
    const div = document.createElement("div");
    div.className = "endgame";
    const won = winner === "you";
    Sound.play(local2 || won ? "win" : "lose");
    if (local2 || won) Haptics.win(); else Haptics.lose();
    const title = won
      ? (local2 ? t("p1Wins") : t("youWin"))
      : net ? t("oppWins", esc((rivalName || "YOUR RIVAL").toUpperCase()))
      : local2 ? t("p2Wins") : t("oppWins", esc(botName.toUpperCase()));
    // solo vs the bot: record the result and let it have the last word
    let extra = "";
    if (!net && !local2) {
      const s = Stats.record(won);
      const streakTxt = s.streak > 1 ? t("inARow", s.streak) : "";
      extra = `<div class="endgame-taunt">“${esc(pickTaunt(won ? "loseGame" : "winGame"))}”</div>
        <div class="endgame-stats">${t("record", s.wins, s.losses, streakTxt, s.best)}</div>`;
    }
    div.innerHTML = `
      <div class="endgame-inner">
        <div class="endgame-title">${title}</div>
        <div class="endgame-sub">${game.scores.you} — ${game.scores.ai}</div>
        ${extra}
        <button class="btn btn-gold" id="btn-again">${t("playAgain")}</button>
      </div>`;
    document.body.appendChild(div);
    const btn = div.querySelector("#btn-again");
    btn.addEventListener("click", () => {
      if (!net) { div.remove(); local2 ? newLocalGame() : newGame(); return; }
      if (net.role === "host") { div.remove(); hostBegin(); }
      else {
        Net.send({ t: "again" });
        btn.disabled = true;
        btn.textContent = t("waitingHost");
      }
    });
  }

  /* ---------- rendering (2v2) ---------- */

  const HAND_ELS = { you: () => el.handYou, top: () => el.handAi, left: () => el.handLeft, right: () => el.handRight };
  const PLAYED_ELS = { you: () => el.playedYou, top: () => el.playedAi, left: () => el.playedLeft, right: () => el.playedRight };
  const PLATE_ELS = { you: () => el.plateYou, top: () => el.plateTop, left: () => el.plateLeft, right: () => el.plateRight };

  function renderHands4(deal) {
    const canPlay = !busy && game4 && !awaitingEcho && !game4.pending && !game4.handOver &&
      game4.toAct === room.mySeat && game4.legalActions(room.mySeat).includes("play");

    for (let seat = 0; seat < 4; seat++) {
      const pos = seatPos(seat);
      const holder = HAND_ELS[pos]();
      holder.innerHTML = "";
      game4.hands[seat].forEach((card, i) => {
        const mine = seat === room.mySeat;
        const c = makeCardEl(mine ? card : null, false);
        if (deal) { c.classList.add("dealt-in"); c.style.animationDelay = `${i * 0.12}s`; }
        if (mine) {
          if (canPlay) {
            c.classList.add("playable");
            c.addEventListener("click", () => localPlay4(i));
          } else {
            c.classList.add("disabled");
          }
        }
        holder.appendChild(c);
      });
    }
  }

  function renderPips4() {
    el.trickPips.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement("div");
      pip.className = "pip";
      const t = game4.tricks[i];
      if (t) pip.classList.add(t.winner === "tie" ? "tie" : t.winner === myTeam() ? "you" : "ai");
      el.trickPips.appendChild(pip);
    }
  }

  function renderScores4() {
    const us = game4.scores[myTeam()], them = game4.scores[1 - myTeam()];
    el.pointsYou.textContent = us;
    el.pointsAi.textContent = them;
    el.fillYou.style.width = `${(us / 30) * 100}%`;
    el.fillAi.style.width = `${(them / 30) * 100}%`;
  }

  function renderStake4() {
    const v = Truco4.TRUCO_HAND_VALUE[game4.trucoLevel];
    el.stakeLabel.textContent = t("pointsOnTable", v);
  }

  function renderPlates4() {
    for (let seat = 0; seat < 4; seat++) {
      const plate = PLATE_ELS[seatPos(seat)]();
      plate.textContent = seatName(seat).toUpperCase();
      plate.className = `plate plate-${seatPos(seat)} team-${seat % 2 === myTeam() ? 0 : 1}`;
      const active = game4 && !game4.handOver && !game4.gameOver &&
        (game4.pending ? game4.legalActions(seat).length > 0 : game4.toAct === seat);
      plate.classList.toggle("turn", !!active);
    }
  }

  function renderChips4() {
    el.dockButtons.innerHTML = "";
    if (busy || !game4 || game4.handOver || game4.gameOver || awaitingEcho) return;
    const legal = game4.legalActions(room.mySeat).filter((a) => a !== "play");
    renderChipButtons(legal, localCall4);
  }

  /* ---------- event presentation (2v2) ---------- */

  function present4(ev) {
    switch (ev.type) {
      case "hand-start":
        enqueue(() => {
          clearBattle();
          renderPips4();
          renderStake4();
          Sound.play("deal");
          renderHands4(true);
          renderPlates4();
          msg(ev.mano === room.mySeat ? t("newHandYouMano4") : t("newHandMano4", seatName(ev.mano)));
        }, 700);
        break;

      case "card-played":
        enqueue(() => {
          const slot = PLAYED_ELS[seatPos(ev.seat)]();
          const c = makeCardEl(ev.card, false);
          Sound.play("card");
          if (room && ev.seat === room.mySeat) Haptics.tap();
          c.classList.add("thrown");
          slot.appendChild(c);
          renderHands4(false);
          renderPlates4();
        }, 650);
        break;

      case "turn":
        enqueue(() => {
          renderPlates4();
          msg(ev.seat === room.mySeat ? t("yourMove") : t("seatThinking", seatName(ev.seat)));
        }, 80);
        break;

      case "trick-end":
        enqueue(() => {
          for (let seat = 0; seat < 4; seat++) {
            const card = PLAYED_ELS[seatPos(seat)]().lastElementChild;
            if (!card) continue;
            if (ev.winnerSeat === null) continue;            // parda: no highlight
            card.classList.add(seat === ev.winnerSeat ? "trick-win" : "trick-lose");
          }
          if (ev.winner !== "tie") Sound.play("trick");
          if (room && ev.winnerSeat !== null && ev.winnerSeat % 2 === myTeam()) Haptics.trick();
          renderPips4();
          msg(ev.winner === "tie" ? t("parda") :
              ev.winnerSeat === room.mySeat ? t("youTakeTrick4") :
              t("seatTakesTrick", seatName(ev.winnerSeat)));
        }, 1300);
        enqueue(() => clearBattle(), 150);
        break;

      case "call":
        enqueue(() => {
          const text = CALL_TEXT[ev.name] || ev.name;
          bubbleAt(seatPos(ev.seat), text);
          if (["Truco", "Retruco", "Vale Cuatro", "Falta Envido"].includes(ev.name)) flash(text);
          const mustAnswer = game4.pending && game4.legalActions(room.mySeat).length;
          msg(ev.seat === room.mySeat ? t("waitingAnswer") :
              mustAnswer ? t("seatCallsAnswer", seatName(ev.seat)) :
              t("seatCalls", seatName(ev.seat)));
          renderPlates4();
        }, ["Truco", "Retruco", "Vale Cuatro", "Falta Envido"].includes(ev.name) ? 1400 : 900);
        break;

      case "response":
        enqueue(() => {
          bubbleAt(seatPos(ev.seat), ev.accepted ? "QUIERO" : "NO QUIERO");
          renderPlates4();
        }, 900);
        break;

      case "envido-primero":
        enqueue(() => msg("¡El envido está primero! Truco is set aside"), 900);
        break;

      case "envido-result": {
        // declarations run from the mano; a seat only states its value if it
        // beats the best so far, otherwise "son buenas"
        let best = -1;
        for (let i = 0; i < 4; i++) {
          const seat = (ev.mano + i) % 4;
          const v = ev.values[seat];
          if (v > best) {
            best = v;
            enqueue(() => bubbleAt(seatPos(seat), `${v}`), 1000);
          } else {
            enqueue(() => bubbleAt(seatPos(seat), "SON BUENAS"), 800);
          }
        }
        enqueue(() => {
          msg(ev.winnerTeam === myTeam()
            ? t("teamWinsEnvido", ev.points)
            : t("seatTeamEnvido", seatName(ev.winnerSeat), ev.points));
        }, 1100);
        break;
      }

      case "envido-declined":
        enqueue(() => {
          msg(ev.callerTeam === myTeam()
            ? t("teamDeclined", ev.points)
            : t("seatTeamDeclined", seatName(ev.callerSeat), ev.points));
        }, 1000);
        break;

      case "stake":
        enqueue(() => renderStake4(), 100);
        break;

      case "mazo":
        enqueue(() => bubbleAt(seatPos(ev.seat), "ME VOY AL MAZO"), 1100);
        break;

      case "score":
        enqueue(() => renderScores4(), 350);
        break;

      case "hand-end":
        enqueue(() => {
          const why = ev.reason === "mazo" ? t("whyFold") : ev.reason === "no-quiero" ? t("whyNoQuiero") : "";
          msg(ev.winner === myTeam()
            ? t("teamWinsHand", ev.points, why)
            : t("theyWinHand", ev.points, why));
        }, 1900);
        if (!game4.gameOver && room.role === "host") {
          // host deals the next hand and broadcasts it; guests wait for it
          enqueue(() => {
            if (!room || !game4 || game4.gameOver) return;
            const fixed = Truco4.freshDeal4();
            game4.nextHand(fixed);
            Net.broadcast({ t: "deal4", hands: fixed });
            sync4();
          }, 0);
        }
        break;

      case "game-over":
        enqueue(() => showEndgame4(ev.winner), 300);
        break;
    }
  }

  /* ---------- flow (2v2) ---------- */

  function sync4() {
    for (const ev of game4.drainEvents()) present4(ev);
    if (!busy) onIdle();
  }

  function clearEcho() {
    awaitingEcho = false;
    clearTimeout(echoTimer);
  }

  function sendIntent(a) {
    awaitingEcho = true;
    clearTimeout(echoTimer);
    echoTimer = setTimeout(() => { awaitingEcho = false; if (!busy) onIdle(); }, 4000);
    Net.send({ t: "i", a });
  }

  function localPlay4(index) {
    if (busy || !game4 || game4.gameOver || awaitingEcho) return;
    if (room.role === "host") {
      if (game4.playCard(room.mySeat, index)) {
        Net.broadcast({ t: "a4", seat: room.mySeat, a: { kind: "play", index } });
        sync4();
      }
    } else if (game4.legalActions(room.mySeat).includes("play")) {
      sendIntent({ kind: "play", index });
      renderHands4(false); // lock the hand until the echo lands
    }
  }

  function localCall4(name) {
    if (busy || !game4 || game4.gameOver || awaitingEcho) return;
    if (room.role === "host") {
      if (game4.call(room.mySeat, name)) {
        Net.broadcast({ t: "a4", seat: room.mySeat, a: { kind: "call", name } });
        sync4();
      }
    } else if (game4.legalActions(room.mySeat).includes(name)) {
      sendIntent({ kind: "call", name });
      renderChips4();
    }
  }

  /* host: apply an action for a seat (own, guest intent, or bot) + replicate */
  function hostApply(seat, a) {
    if (!game4 || game4.gameOver) return false;
    const ok = a.kind === "play" ? game4.playCard(seat, a.index) : game4.call(seat, a.name);
    if (ok) {
      Net.broadcast({ t: "a4", seat, a });
      sync4();
    }
    return ok; // a stale/raced intent simply loses — state already moved on
  }

  /* guest: apply the host's authoritative broadcast */
  function applyAct4(seat, a) {
    if (!game4 || game4.gameOver) return;
    clearEcho();
    const ok = a.kind === "play" ? game4.playCard(seat, a.index) : game4.call(seat, a.name);
    if (!ok) {
      netEnded4(t("connLost"), t("desyncTable"));
      return;
    }
    sync4();
  }

  function applyDeal4(hands) {
    clearEcho();
    game4.nextHand(hands);
    sync4();
  }

  function onIdle4() {
    if (!game4 || game4.gameOver) return;

    if (room.role !== "host" && pendingDeal4) {
      const hands = pendingDeal4;
      pendingDeal4 = null;
      applyDeal4(hands);
      return;
    }

    renderHands4(false);
    renderChips4();
    renderScores4();
    renderPlates4();

    if (room.role !== "host") return; // guests act through the host

    // drive bot seats (one decision at a time)
    const seat = botToAct();
    if (seat !== null && !aiThinking) {
      aiThinking = true;
      botTimer = setTimeout(() => {
        aiThinking = false;
        if (busy || !game4 || game4.gameOver || game4.handOver) return;
        const s = botToAct();
        if (s === null) return;
        const d = TrucoAI4.decide(game4, s);
        if (!d) return;
        hostApply(s, d.action === "play" ? { kind: "play", index: d.index } : { kind: "call", name: d.action });
      }, 850 + Math.random() * 700);
    }
  }

  /* which bot seat should act now? humans answer calls when they can */
  function botToAct() {
    if (game4.handOver || game4.gameOver) return null;
    if (game4.pending) {
      const t = 1 - game4.pending.callerTeam;
      const seats = [t, t + 2];
      if (seats.some(seatIsHuman)) return null;  // a human teammate will answer
      // both responders are bots: the one farther from mano (the pie) speaks
      const byDepth = seats.sort((a, b) => ((b - game4.mano + 4) % 4) - ((a - game4.mano + 4) % 4));
      return byDepth[0];
    }
    return seatIsHuman(game4.toAct) ? null : game4.toAct;
  }

  function showEndgame4(winnerTeam) {
    const div = document.createElement("div");
    div.className = "endgame";
    Sound.play(winnerTeam === myTeam() ? "win" : "lose");
    if (winnerTeam === myTeam()) Haptics.win(); else Haptics.lose();
    const mates = [winnerTeam, winnerTeam + 2]
      .map((s) => (s === room.mySeat ? t("you") : esc(room.seats[s].name.toUpperCase())));
    const title = winnerTeam === myTeam() ? t("yourTeamWins") : t("teamWins", mates.join(" & "));
    div.innerHTML = `
      <div class="endgame-inner">
        <div class="endgame-title">${title}</div>
        <div class="endgame-sub">${game4.scores[myTeam()]} — ${game4.scores[1 - myTeam()]}</div>
        <button class="btn btn-gold" id="btn-again">${t("playAgain")}</button>
      </div>`;
    document.body.appendChild(div);
    const btn = div.querySelector("#btn-again");
    btn.addEventListener("click", () => {
      if (room.role === "host") { div.remove(); hostBegin4(); }
      else {
        Net.send({ t: "again" });
        btn.disabled = true;
        btn.textContent = t("waitingHost");
      }
    });
  }

  /* ---------- 2v2 room lifecycle ---------- */

  function publicSeats() {
    return room.seats.map((s) => ({ kind: s.kind, name: s.name }));
  }

  function openTable4() {
    swapPick = null;
    room = {
      role: "host", code: null, mySeat: 0, started: false,
      seats: [
        { kind: "human", name: myName(), connId: null },
        { kind: "open", name: "", connId: null },
        { kind: "open", name: "", connId: null },
        { kind: "open", name: "", connId: null },
      ],
    };
    showOverlay(t("your2v2"), t("summoning"));
    Net.hostRoom({
      onReady: (code) => {
        room.code = code;
        myTableCode = code;
        const url = location.origin + location.pathname + "#join4=" + code;
        showLobbyHost(url, code);
      },
      onPeerJoin: (id) => markPeerSeen(id),
      onPeerMessage: hostPeerMsg,
      onPeerLeave: (id) => hostPeerLeft(id),
      onError: netError4,
    });
    startHeartbeat();
  }

  function hostPeerMsg(id, m) {
    if (!m || typeof m !== "object" || !room) return;
    markPeerSeen(id);
    if (m.t === "hb") return;
    const seat = room.seats.findIndex((s) => s.connId === id);
    switch (m.t) {
      case "hello": {
        if (seat !== -1) return;                       // already seated
        if (room.started) {
          // mid-game: a newcomer (or returning player) may take over a bot seat
          const botSeat = room.seats.findIndex((s) => s.kind === "bot");
          if (botSeat === -1 || !game4 || game4.gameOver) {
            Net.sendToPeer(id, { t: "full" });
            setTimeout(() => Net.closePeer(id), 400);
            return;
          }
          const botName = room.seats[botSeat].name;
          room.seats[botSeat] = { kind: "human", name: cleanName(m.name), connId: id };
          Net.sendToPeer(id, {
            t: "resume4", state: game4.serialize(),
            seats: publicSeats(), yourSeat: botSeat,
          });
          Net.broadcast({ t: "seathuman", seat: botSeat, name: room.seats[botSeat].name }, id);
          chatSys(t("chatTakesOver", room.seats[botSeat].name, botName));
          renderPlates4();
          if (!busy) onIdle();
          return;
        }
        const free = room.seats.findIndex((s) => s.kind === "open");
        if (free === -1) {
          Net.sendToPeer(id, { t: "full" });
          setTimeout(() => Net.closePeer(id), 400);
          return;
        }
        room.seats[free] = { kind: "human", name: cleanName(m.name), connId: id };
        swapPick = null;
        broadcastRoster();
        renderLobbyHost();
        chatSys(t("chatJoined", room.seats[free].name));
        break;
      }
      case "i":
        if (seat !== -1 && room.started) hostApply(seat, m.a);
        break;
      case "rename":
        if (seat !== -1) hostRename(seat, cleanName(m.name));
        break;
      case "chat":
        if (seat !== -1) {
          const name = room.seats[seat].name;
          const text = String(m.text || "").slice(0, 160);
          addChat(name, text, false);
          Net.broadcast({ t: "chat", name, text }, id);
        }
        break;
      case "again":
        if (seat !== -1 && game4 && game4.gameOver) {
          document.querySelector(".endgame")?.remove();
          hostBegin4();
        }
        break;
      case "bye":
        Net.closePeer(seat !== -1 ? room.seats[seat].connId : id);
        if (seat !== -1) hostSeatLost(seat);
        break;
    }
  }

  function hostPeerLeft(id) {
    if (!room) return;
    const seat = room.seats.findIndex((s) => s.connId === id);
    if (seat !== -1) hostSeatLost(seat);
  }

  function hostSeatLost(seat) {
    const name = room.seats[seat].name;
    swapPick = null;                    // membership changed — drop any pending swap
    if (!room.started) {
      room.seats[seat] = { kind: "open", name: "", connId: null };
      broadcastRoster();
      renderLobbyHost();
      chatSys(t("chatLeft", name));
      return;
    }
    // mid-game: a bot takes over the seat so the table plays on
    room.seats[seat] = { kind: "bot", name: pickBotName(), connId: null };
    Net.broadcast({ t: "seatbot", seat, name: room.seats[seat].name });
    chatSys(t("chatLeftBot", name, room.seats[seat].name));
    renderPlates4();
    if (!busy) onIdle();
  }

  function pickBotName() {
    const used = room.seats.map((s) => s.name);
    return BOT_NAMES.find((n) => !used.includes(n)) || "BOT";
  }

  function broadcastRoster() {
    for (const [seat, s] of room.seats.entries()) {
      if (s.connId !== null) {
        Net.sendToPeer(s.connId, { t: "roster", seats: publicSeats(), yourSeat: seat });
      }
    }
  }

  function hostBegin4() {
    swapPick = null;
    room.started = true;
    const fixed = Truco4.freshDeal4();
    const mano = Math.floor(Math.random() * 4);
    for (const [seat, s] of room.seats.entries()) {
      if (s.connId !== null) {
        Net.sendToPeer(s.connId, { t: "start4", mano, hands: fixed, seats: publicSeats(), yourSeat: seat });
      }
    }
    beginNet4(mano, fixed);
  }

  function setupNet4(makeGame) {
    document.querySelector(".endgame")?.remove();
    game = null;
    net = null;
    pendingDeal4 = null;
    clearEcho();
    game4 = makeGame();
    queue = [];
    busy = false;
    aiThinking = false;
    enterStage();
    el.stage.classList.add("mode-2v2");
    el.handLeft.classList.remove("hidden");
    el.handRight.classList.remove("hidden");
    el.playedLeft.classList.remove("hidden");
    el.playedRight.classList.remove("hidden");
    for (const p of [el.plateTop, el.plateLeft, el.plateRight, el.plateYou]) p.classList.remove("hidden");
    el.labelYou.textContent = t("us");
    el.labelOpp.textContent = t("them");
    el.btnChat.classList.remove("hidden");
    el.btnName.classList.remove("hidden");
    renderScores4();
    renderPlates4();
    startHeartbeat();
  }

  function beginNet4(mano, hands) {
    setupNet4(() => new Truco4.Game4(mano, hands));
    sync4();
  }

  /* take a seat in a game already underway: restore the host's snapshot
     and repaint the table mid-hand (no deal animation) */
  function resumeNet4(state) {
    setupNet4(() => Truco4.Game4.restore(state));
    clearBattle();
    for (let seat = 0; seat < 4; seat++) {
      const card = game4.current[seat];
      if (card) PLAYED_ELS[seatPos(seat)]().appendChild(makeCardEl(card, false));
    }
    renderPips4();
    renderStake4();
    renderHands4(false);
    renderChips4();
    msg(game4.toAct === room.mySeat && !game4.pending
      ? t("atTableMove")
      : t("atTablePlays"));
    if (!busy) onIdle();
  }

  /* guest side */

  function guestMsg4(m) {
    if (!m || typeof m !== "object" || !room) return;
    markRivalSeen();
    if (m.t === "hb") return;
    switch (m.t) {
      case "roster":
        room.seats = m.seats.map((s) => ({ ...s, connId: null }));
        room.mySeat = m.yourSeat;
        if (!game4) renderLobbyGuest();
        break;
      case "start4":
        room.seats = m.seats.map((s) => ({ ...s, connId: null }));
        room.mySeat = m.yourSeat;
        room.started = true;
        beginNet4(m.mano, m.hands);
        break;
      case "resume4": // joining a game already underway (taking over a bot seat)
        room.seats = m.seats.map((s) => ({ ...s, connId: null }));
        room.mySeat = m.yourSeat;
        room.started = true;
        resumeNet4(m.state);
        break;
      case "deal4":
        if (!game4) return;
        if (busy || queue.length) pendingDeal4 = m.hands;
        else applyDeal4(m.hands);
        break;
      case "a4":
        applyAct4(m.seat, m.a);
        break;
      case "seatbot":
        if (room.seats) {
          const old = room.seats[m.seat].name;
          room.seats[m.seat] = { kind: "bot", name: cleanName(m.name), connId: null };
          chatSys(t("chatLeftBot", old, room.seats[m.seat].name));
          if (game4) renderPlates4();
          else renderLobbyGuest();
        }
        break;
      case "seathuman": // a player took over a bot seat mid-game
        if (room.seats) {
          const bot = room.seats[m.seat].name;
          room.seats[m.seat] = { kind: "human", name: cleanName(m.name), connId: null };
          chatSys(t("chatTakesOver", room.seats[m.seat].name, bot));
          if (game4) renderPlates4();
        }
        break;
      case "seatname": // someone renamed themselves mid-game
        if (room.seats) {
          const old = room.seats[m.seat].name;
          room.seats[m.seat].name = cleanName(m.name);
          chatSys(m.seat === room.mySeat
            ? t("chatYouAre", room.seats[m.seat].name)
            : t("chatRenamed", old, room.seats[m.seat].name));
          if (game4) renderPlates4();
        }
        break;
      case "chat":
        addChat(cleanName(m.name), String(m.text || "").slice(0, 160), false);
        break;
      case "full":
        room = null;
        lobbyFailed(t("tableFull"));
        break;
      case "bye":
        netEnded4(t("tableClosed"), t("hostClosed"));
        break;
    }
  }

  /* leaving / errors (2v2) */

  function leaveNet4() {
    if (!room) return;
    if (room.role === "host") Net.broadcast({ t: "bye" });
    else Net.send({ t: "bye" });
    room = null;
    game4 = null;
    stopHeartbeat();
    clearTimeout(botTimer);
    clearEcho();
    Net.destroy();
  }

  function netEnded4(title, text) {
    if (!room) return;
    room = null;
    game4 = null;
    clearTimeout(botTimer);
    clearEcho();
    Net.destroy();
    exitToSplash();
    showNotice(title, text);
  }

  function netError4(e) {
    const kind = e && e.type;
    if (kind === "peer-unavailable") {
      room = null;
      lobbyFailed(t("tableNotFound"));
    } else if (kind === "timeout") {
      room = null;
      lobbyFailed(t("netTimeout"));
    } else if (room && (game4 || room.started)) {
      netEnded4(t("connLost"), t("connLostTable"));
    } else if (room && room.role === "host" && Net.roomSize() > 0) {
      /* broker hiccup after guests connected — ignore, WebRTC links live on */
    } else {
      room = null;
      lobbyFailed(t("brokerFail"));
    }
  }

  /* ---------- lobby rendering ---------- */

  function lobbySeatRow(seat, s, isHost) {
    const row = document.createElement("div");
    row.className = "lobby-seat " + (s.kind === "open" ? "empty" : "filled");
    const team = document.createElement("span");
    team.className = `lobby-team team-${seat % 2}`;
    team.textContent = seat % 2 === 0 ? t("teamGold") : t("teamBlue");
    const name = document.createElement("span");
    name.className = "lobby-name";
    if (s.kind === "open") {
      name.textContent = t("waitingPlayer");
    } else {
      name.textContent = s.name;
      const tag = document.createElement("span");
      tag.className = "lobby-tag";
      tag.textContent =
        s.kind === "bot" ? t("tagBot") :
        (room && seat === room.mySeat) ? t("tagYou") :
        (isHost && seat === 0) ? t("tagHost") : "";
      if (!isHost && seat === 0) tag.textContent = t("tagHost");
      name.appendChild(tag);
    }
    row.appendChild(team);
    row.appendChild(name);
    if (seat === swapPick) row.classList.add("swap-pick");
    if (isHost && swapPick !== null) {
      // swap mode: every seat is either the picked one (cancel) or a target
      const sw = document.createElement("button");
      sw.className = "lobby-btn lobby-btn-swap";
      if (seat === swapPick) {
        sw.textContent = t("cancelSwap");
        sw.addEventListener("click", () => { swapPick = null; renderLobbyHost(); });
      } else {
        sw.textContent = t("swapHere");
        sw.addEventListener("click", () => {
          const a = swapPick; swapPick = null; swapSeats(a, seat);
        });
      }
      row.appendChild(sw);
    } else if (isHost) {
      if (s.kind === "open") {
        const add = document.createElement("button");
        add.className = "lobby-btn";
        add.textContent = t("addBot");
        add.addEventListener("click", () => {
          room.seats[seat] = { kind: "bot", name: pickBotName(), connId: null };
          broadcastRoster();
          renderLobbyHost();
        });
        row.appendChild(add);
      }
      if (s.kind === "bot") {
        const rm = document.createElement("button");
        rm.className = "lobby-btn lobby-btn-remove";
        rm.textContent = t("remove");
        rm.addEventListener("click", () => {
          room.seats[seat] = { kind: "open", name: "", connId: null };
          broadcastRoster();
          renderLobbyHost();
        });
        row.appendChild(rm);
      }
      // any occupied seat can start a team swap (swapping changes team, since
      // teams alternate by seat: 0&2 vs 1&3)
      if (s.kind !== "open") {
        const sw = document.createElement("button");
        sw.className = "lobby-btn lobby-btn-swap";
        sw.textContent = t("teamBtn");
        sw.addEventListener("click", () => { swapPick = seat; renderLobbyHost(); });
        row.appendChild(sw);
      }
    }
    return row;
  }

  /* host: swap two lobby seats — moves players (and their team) and keeps
     every screen's seat index in sync */
  function swapSeats(a, b) {
    if (a === b || !room || room.role !== "host" || room.started) return;
    [room.seats[a], room.seats[b]] = [room.seats[b], room.seats[a]];
    if (room.mySeat === a) room.mySeat = b;
    else if (room.mySeat === b) room.mySeat = a;
    broadcastRoster();
    renderLobbyHost();
  }

  function renderRoster(isHost) {
    el.lobbyRoster.innerHTML = "";
    for (const [seat, s] of room.seats.entries()) {
      el.lobbyRoster.appendChild(lobbySeatRow(seat, s, isHost));
    }
    el.lobbyRoster.classList.remove("hidden");
  }

  function showLobbyHost(url, code) {
    showOverlay(t("your2v2"), t("lobbyHostStatus"), { code: code || room.code, link: url });
    renderLobbyHost();
  }

  function renderLobbyHost() {
    if (!room || room.role !== "host" || room.started) return;
    renderRoster(true);
    const ready = room.seats.every((s) => s.kind !== "open");
    el.btnStart2v2.classList.remove("hidden");
    el.btnStart2v2.disabled = !ready;
    el.btnStart2v2.textContent = ready ? t("startReady") : t("startFill");
    el.btnLobbyChat.classList.toggle("hidden", Net.roomSize() === 0);
    el.btnLobbyName.classList.remove("hidden");
    el.onlineStatus.textContent =
      swapPick !== null ? t("lobbySwap") :
      ready ? t("lobbyFull") : t("lobbyShare");
  }

  function renderLobbyGuest() {
    showOverlay(t("atTheTable"), t("lobbyWaitStart"));
    renderRoster(false);
    el.btnLobbyChat.classList.remove("hidden");
    el.btnLobbyName.classList.remove("hidden");
  }

  /* ---------- chat ---------- */

  function chatAvailable() { return !!(net || room); }

  function addChat(who, text, mine, sys = false) {
    /* Guideline 1.2, in order: a blocked player's message never renders,
       and anything that does render is filtered first. Own messages are
       filtered on the way out (sendChat), so they arrive clean. */
    const blocked = !sys && !mine && Moderation.isBlocked(who);
    if (blocked) return;
    if (!sys) text = Moderation.filterText(text);

    const div = document.createElement("div");
    div.className = "chat-msg" + (mine ? " chat-mine" : "") + (sys ? " chat-sys" : "");
    if (!sys) {
      const w = document.createElement("span");
      w.className = "chat-who";
      w.textContent = who;
      div.appendChild(w);
    }
    div.appendChild(document.createTextNode(text));

    // Someone else's message opens the report/block sheet on tap.
    if (!sys && !mine) {
      div.classList.add("chat-actionable");
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.addEventListener("click", () => openModMenu(who, text));
      div.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModMenu(who, text); }
      });
    }

    el.chatLog.appendChild(div);
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
    while (el.chatLog.children.length > 120) el.chatLog.firstChild.remove();
    if (el.chatPanel.classList.contains("hidden") && !mine) {
      unreadChat++;
      renderChatBadges();
      chatToast(who, text, sys);
      if (!sys) Sound.play("chat");
    }
  }

  /* Drop every message already on screen from a player who was just
     blocked — blocking has to clear the backlog, not only the future. */
  function purgeBlocked() {
    for (const div of [...el.chatLog.children]) {
      if (div.classList.contains("chat-sys") || div.classList.contains("chat-mine")) continue;
      const who = div.querySelector(".chat-who");
      if (who && Moderation.isBlocked(who.textContent)) div.remove();
    }
  }

  function chatSys(text) { addChat(null, text, false, true); }

  /* unread counter on the in-game icon and the lobby TABLE TALK button */
  function renderChatBadges() {
    const label = unreadChat > 9 ? "9+" : String(unreadChat);
    for (const badge of [el.chatBadge, el.lobbyChatBadge]) {
      badge.textContent = label;
      badge.classList.toggle("hidden", unreadChat === 0);
    }
  }

  /* pop the incoming message (with the sender's name) while the panel is closed */
  function chatToast(who, text, sys) {
    el.chatToastWho.textContent = sys ? "" : who;
    el.chatToastText.textContent = text;
    el.chatToast.classList.toggle("chat-toast-sys", sys);
    el.chatToast.classList.remove("hidden");
    el.chatToast.style.animation = "none";
    void el.chatToast.offsetWidth; // restart pop-in
    el.chatToast.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3500);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    el.chatToast.classList.add("hidden");
  }

  function openChat() {
    el.chatPanel.classList.remove("hidden");
    unreadChat = 0;
    renderChatBadges();
    hideToast();
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  function closeChat() { el.chatPanel.classList.add("hidden"); }

  /* ---------- report / block sheet ---------- */

  let modTarget = null;   // { who, text } of the tapped message

  function openModMenu(who, text) {
    modTarget = { who, text };
    el.modWho.textContent = who;
    el.modText.textContent = text;
    el.btnModBlock.textContent = Moderation.isBlocked(who) ? t("modUnblock") : t("modBlock");
    el.modOverlay.classList.remove("hidden");
    Haptics.tap();
  }

  function closeModMenu() {
    el.modOverlay.classList.add("hidden");
    modTarget = null;
  }

  function doReport() {
    if (!modTarget) return;
    const { who, text } = modTarget;
    Moderation.report(who, text);   // records it and blocks in one step
    closeModMenu();
    purgeBlocked();
    chatSys(t("modReported", who));
    renderSettings();
  }

  function doBlockToggle() {
    if (!modTarget) return;
    const { who } = modTarget;
    if (Moderation.isBlocked(who)) {
      Moderation.unblock(who);
      closeModMenu();
      chatSys(t("modUnblocked", who));
    } else {
      Moderation.block(who);
      closeModMenu();
      purgeBlocked();
      chatSys(t("modBlocked", who));
    }
    renderSettings();
  }

  function sendChat(text) {
    text = Moderation.filterText(text.trim().slice(0, 160));
    if (!text || !chatAvailable()) return;
    addChat(myName(), text, true);
    if (room && room.role === "host") Net.broadcast({ t: "chat", name: room.seats[0].name, text });
    else Net.send({ t: "chat", name: myName(), text });
  }

  function resetChat() {
    el.chatLog.innerHTML = "";
    unreadChat = 0;
    renderChatBadges();
    hideToast();
    closeChat();
    el.btnChat.classList.add("hidden");
  }

  /* ---------- edit name (lobby + in-game) ---------- */

  function openNamePanel() {
    el.nameInput.value = localStorage.getItem("monolito-name") || myName();
    el.namePanel.classList.remove("hidden");
    el.nameInput.focus();
    el.nameInput.select();
  }

  function closeNamePanel() { el.namePanel.classList.add("hidden"); }

  function applyRename() {
    const name = cleanName(el.nameInput.value);
    closeNamePanel();
    localStorage.setItem("monolito-name", name);
    el.onlineName.value = name;
    if (net) {
      Net.send({ t: "hello", name });            // 1v1: rival relabels on hello
    } else if (room) {
      if (room.role === "host") hostRename(room.mySeat, name);
      else Net.send({ t: "rename", name });
    }
  }

  /* host: apply a rename for a seat and replicate it to every screen */
  function hostRename(seat, name) {
    const old = room.seats[seat].name;
    if (old === name) return;
    room.seats[seat].name = name;
    if (room.started) {
      Net.broadcast({ t: "seatname", seat, name });
      renderPlates4();
    } else {
      broadcastRoster();
      renderLobbyHost();
    }
    chatSys(t("chatRenamed", old, name));
  }

  /* ---------- stage transitions ---------- */

  function enterStage() {
    el.onlineOverlay.classList.add("hidden");
    el.splash.classList.add("gone");
    el.stage.classList.remove("hidden");
    el.langToggle.classList.add("hidden");      // language switch lives on the main screen
    el.settingsToggle.classList.add("hidden");  // settings too
    if (!game4) {
      el.labelYou.textContent = local2 ? t("player1") : t("you");
      el.labelOpp.textContent = net ? (rivalName || "RIVAL").toUpperCase()
        : local2 ? t("player2") : botName.toUpperCase();
      el.btnChat.classList.toggle("hidden", !net);
      el.btnName.classList.toggle("hidden", !net);
    }
    if (location.hash.startsWith("#join")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    renderHudCode();
  }

  function newGame() {
    leaveNet();
    leaveNet4();
    resetChat();
    local2 = false;
    game = new Truco.Game(undefined, undefined, florOn);
    queue = [];
    busy = false;
    renderScores();
    sync();
  }

  /* pass-and-play: two humans share one device, hands hidden behind a gate */
  function newLocalGame() {
    leaveNet();
    leaveNet4();
    resetChat();
    local2 = true;
    controller = null;            // force a pass-gate before the first turn
    game = new Truco.Game(undefined, undefined, florOn);
    queue = [];
    busy = false;
    el.labelYou.textContent = t("player1");
    el.labelOpp.textContent = t("player2");
    renderScores();
    sync();
  }

  function exitToSplash() {
    game = null;
    game4 = null;
    queue = [];
    busy = false;
    aiThinking = false;
    local2 = false;
    pendingDeal = null;
    pendingDeal4 = null;
    rivalGone = false;
    myTableCode = null;
    el.passgate.classList.add("hidden");
    stopHeartbeat();
    clearEcho();
    clearTimeout(botTimer);
    for (const k of Object.keys(bubbleTimers)) clearTimeout(bubbleTimers[k]);
    for (const b of [el.bubbleYou, el.bubbleAi, el.bubbleLeft, el.bubbleRight]) b.classList.add("hidden");
    el.callflash.classList.add("hidden");
    clearBattle();
    el.handYou.innerHTML = "";
    el.handAi.innerHTML = "";
    el.handLeft.innerHTML = "";
    el.handRight.innerHTML = "";
    el.dockButtons.innerHTML = "";
    msg(" ");
    document.querySelector(".endgame")?.remove();
    el.stage.classList.add("hidden");
    el.stage.classList.remove("mode-2v2");
    el.handLeft.classList.add("hidden");
    el.handRight.classList.add("hidden");
    el.playedLeft.classList.add("hidden");
    el.playedRight.classList.add("hidden");
    for (const p of [el.plateTop, el.plateLeft, el.plateRight, el.plateYou]) p.classList.add("hidden");
    el.btnName.classList.add("hidden");
    el.hudCode.classList.add("hidden");
    closeNamePanel();
    resetChat();
    renderSplashStats();
    el.langToggle.classList.remove("hidden");
    el.settingsToggle.classList.remove("hidden");
    el.splash.classList.remove("gone");
  }

  /* ---------- online play (1v1) ---------- */

  function beginNet(role, manoSeat, hands, flor) {
    net = { role };
    game4 = null;
    pendingDeal = null;
    game = new Truco.Game(manoSeat, hands, flor);
    queue = [];
    busy = false;
    aiThinking = false;
    enterStage();
    renderScores();
    startHeartbeat();
    sync();
  }

  /* repaint the 1v1 board straight from engine state (no deal animation) —
     used when a dropped player reconnects mid-hand */
  function repaintStage1(message) {
    clearBattle();
    if (game.current.you) {
      const c = makeCardEl(game.current.you, false); c.classList.add("thrown"); el.playedYou.appendChild(c);
    }
    if (game.current.ai) {
      const c = makeCardEl(game.current.ai, false); c.classList.add("thrown"); el.playedAi.appendChild(c);
    }
    renderPips();
    renderStake();
    renderHands(false);
    renderChips();
    renderScores();
    if (message) msg(message);
    if (game.gameOver && !document.querySelector(".endgame")) showEndgame(game.gameWinner);
  }

  /* guest: take over an in-progress 1v1 table from the host's snapshot */
  function resumeNet1(state) {
    net = { role: "guest" };
    game4 = null;
    room = null;
    pendingDeal = null;
    game = Truco.Game.restore(state);
    queue = [];
    busy = false;
    aiThinking = false;
    enterStage();
    startHeartbeat();
    repaintStage1(t("reconnected"));
    if (!busy && !game.gameOver) onIdle();
  }

  function hostBegin() {
    const fixed = Truco.freshDeal();
    const mano = Math.random() < 0.5 ? "you" : "ai";
    Net.send({
      t: "start",
      mano: mano === "you" ? "host" : "guest",
      hands: { host: fixed.you, guest: fixed.ai },
      flor: florOn,
    });
    beginNet("host", mano, fixed, florOn);
  }

  function applyDeal(hands) {
    game.nextHand({ you: hands.guest, ai: hands.host });
    sync();
  }

  function applyRemote(a) {
    if (!game || game.gameOver) return;
    const ok = a.kind === "play"
      ? game.playCard("ai", a.index)
      : game.call("ai", a.name);
    if (!ok) {
      netEnded(t("connLost"), t("desyncRival"));
      return;
    }
    sync();
  }

  function netMsg(m) {
    if (!m || typeof m !== "object") return;
    markRivalSeen();
    if (m.t === "hb") return;
    switch (m.t) {
      case "hello": {
        const name = cleanName(m.name);
        if (net && rivalName && name !== rivalName) chatSys(t("chatRenamed", rivalName, name));
        rivalName = name;
        if (net) el.labelOpp.textContent = rivalName.toUpperCase();
        break;
      }
      case "start": // first game, or a host-initiated rematch
        document.querySelector(".endgame")?.remove();
        beginNet("guest", m.mano === "guest" ? "you" : "ai",
          { you: m.hands.guest, ai: m.hands.host }, !!m.flor);
        break;
      case "resume": // joining a 1v1 table already in play (rejoin / substitute)
        document.querySelector(".endgame")?.remove();
        resumeNet1(m.state);
        break;
      case "deal":
        if (!net || !game) return;
        if (busy || queue.length) pendingDeal = m.hands;
        else applyDeal(m.hands);
        break;
      case "act":
        if (net && game) applyRemote(m.a);
        break;
      case "chat":
        addChat(cleanName(m.name), String(m.text || "").slice(0, 160), false);
        break;
      case "again":
        if (net && net.role === "host" && game && game.gameOver) {
          document.querySelector(".endgame")?.remove();
          hostBegin();
        }
        break;
      case "bye":
        // guest left → host keeps the table so they can rejoin with the code;
        // host left → the table is gone (host owns the peer)
        if (net && net.role === "host") hostRival1Dropped();
        else netEnded(t("tableClosed"), t("hostClosed"));
        break;
    }
  }

  /* leave intentionally: tell the rival, then tear down */
  function leaveNet() {
    if (!net) return;
    Net.send({ t: "bye" });
    net = null;
    rivalName = null;
    stopHeartbeat();
    Net.destroy();
  }

  /* the table ended on us: rival left, connection dropped, desync */
  function netEnded(title, text) {
    if (!net) return;
    net = null;
    rivalName = null;
    Net.destroy();
    exitToSplash();
    showNotice(title, text);
  }

  /* ---------- online overlay ---------- */

  function showOverlay(title, status, { link = null, code = null, hint = false, cancelLabel = null } = {}) {
    el.onlineTitle.textContent = title;
    el.onlineStatus.textContent = status;
    el.onlineNamebox.classList.add("hidden");
    el.onlineModes.classList.add("hidden");
    el.onlineJoinbox.classList.add("hidden");
    el.btnJoinGo.classList.add("hidden");
    el.lobbyRoster.classList.add("hidden");
    el.btnStart2v2.classList.add("hidden");
    el.btnJoin2v2.classList.add("hidden");
    el.btnLobbyChat.classList.add("hidden");
    el.btnLobbyName.classList.add("hidden");
    el.onlineCodebox.classList.toggle("hidden", !code);
    el.onlineLinkbox.classList.toggle("hidden", !link);
    el.onlineHint.classList.toggle("hidden", !hint);
    el.btnOnlineCancel.textContent = cancelLabel || t("cancel");
    el.btnCopyLink.textContent = t("orCopyLink");
    el.btnCopyCode.textContent = t("copy");
    if (code) el.onlineCode.textContent = code.toUpperCase();
    if (link) {
      el.onlineLink.value = link;
      el.btnShareLink.classList.toggle("hidden", !navigator.share);
    }
    el.onlineOverlay.classList.remove("hidden");
  }

  function showNotice(title, text) {
    showOverlay(title, text, { cancelLabel: t("back") });
  }

  function closeOverlay() {
    // 1v1 host paused on a dropped rival: CANCEL means leave the table for good
    if (rivalGone) {
      rivalGone = false;
      leaveNet();
      exitToSplash();
      return;
    }
    el.onlineOverlay.classList.add("hidden");
    if (!net && !game4) {
      if (room) { leaveNet4(); }      // abandon a half-open 2v2 lobby
      Net.destroy();                  // abandon a half-open 1v1 lobby
      resetChat();
    }
    if (location.hash.startsWith("#join")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function lobbyFailed(text) {
    Net.destroy();
    showOverlay(t("onlineTitle"), text, { cancelLabel: t("back") });
  }

  function netError(e) {
    const kind = e && e.type;
    if (kind === "peer-unavailable") {
      // host is gone (guest can't reach the table) — couldn't (re)join
      if (net || game) { net = null; game = null; }
      lobbyFailed(t("tableNotFound"));
    } else if (kind === "timeout") {
      lobbyFailed(t("netTimeout"));
    } else if (net && net.role === "host" && game) {
      // broker/link hiccup on the host: the WebRTC data link survives, and a real
      // rival drop is caught by the connection's close event — so ignore this
    } else if (net) {
      netEnded(t("connLost"), t("connLostRival"));
    } else {
      lobbyFailed(t("brokerFail"));
    }
  }

  /* the online menu: name + mode choice */
  /* Guideline 1.2 wants players to have agreed there's no tolerance for
     objectionable content before they can reach user-generated content.
     Shown once, then remembered; `after` runs on accept. */
  let termsNext = null;

  /* Returns true when the caller may proceed. When it returns false the
     gate is on screen and `after` is what runs on accept — so callers
     pass themselves and simply bail out, then get re-entered cleanly.
     (Calling `after()` here instead would recurse forever, since every
     caller's first act is to consult this gate again.) */
  function requireTerms(after) {
    if (Moderation.termsAccepted()) return true;
    termsNext = after;
    el.termsOverlay.classList.remove("hidden");
    return false;
  }

  el.btnTermsAccept.addEventListener("click", () => {
    Moderation.acceptTerms();
    el.termsOverlay.classList.add("hidden");
    const next = termsNext;
    termsNext = null;
    if (next) next();
  });
  el.btnTermsDecline.addEventListener("click", () => {
    el.termsOverlay.classList.add("hidden");
    termsNext = null;
  });

  function openOnlineMenu() {
    if (!Net.available()) {
      showNotice(t("onlineTitle"), t("noNet"));
      return;
    }
    if (!requireTerms(openOnlineMenu)) return;
    showOverlay(t("onlineTitle"), t("pickTable"));
    el.onlineName.value = localStorage.getItem("monolito-name") || "";
    el.onlineNamebox.classList.remove("hidden");
    el.onlineModes.classList.remove("hidden");
  }

  function saveName() {
    const n = cleanName(el.onlineName.value);
    if (n !== "Player" || el.onlineName.value.trim()) localStorage.setItem("monolito-name", n);
  }

  /* the JOIN GAME menu: type a table code to join — or rejoin after a drop.
     The code is the same one the host is showing; mode (1v1/2v2) is detected
     automatically from the first message the host sends. */
  function openJoinPrompt() {
    if (!Net.available()) {
      showNotice(t("joinTableTitle"), t("noNet"));
      return;
    }
    if (!requireTerms(openJoinPrompt)) return;
    showOverlay(t("joinTableTitle"), t("joinPrompt"));
    el.onlineName.value = localStorage.getItem("monolito-name") || "";
    el.joinCode.value = "";
    el.onlineNamebox.classList.remove("hidden");
    el.onlineJoinbox.classList.remove("hidden");
    el.btnJoinGo.classList.remove("hidden");
  }

  /* accept a bare code or a pasted invite link, normalize to the 6-char code */
  function parseCode(text) {
    const t = String(text || "").trim();
    const m = t.match(/join4?=([a-z0-9]+)/i);     // a pasted #join= / #join4= link
    const raw = (m ? m[1] : t).toLowerCase().replace(/[^a-z0-9]/g, "");
    return raw;
  }

  function joinFromCode() {
    const code = parseCode(el.joinCode.value);
    if (code.length < 4) {
      el.onlineStatus.textContent = t("codeTooShort");
      return;
    }
    saveName();
    joinByCode(code);
  }

  /* unified guest join: connect by code, decide 1v1 vs 2v2 from the host's
     first message, and route everything to the matching handler */
  const MODE_2V2 = new Set(["roster", "start4", "resume4", "deal4", "a4", "seatbot", "seathuman", "seatname"]);

  function joinByCode(code) {
    if (!Net.available()) {
      showNotice(t("joinTableTitle"), t("noNet"));
      return;
    }
    joinCode = code;
    net = null; room = null; game = null; game4 = null;
    showOverlay(t("joiningTitle"), t("crossing"));
    Net.join(code, {
      onConnect: () => {
        Net.send({ t: "hello", name: myName() });
        showOverlay(t("joiningTitle"), t("connectedSeat"));
      },
      onMessage: guestRoute,
      onClose: () => guestConnLost(),
      onError: (e) => (room ? netError4(e) : netError(e)),
    });
    startHeartbeat();
  }

  function guestRoute(m) {
    if (!m || typeof m !== "object") return;
    if (m.t === "full") {
      room = null; net = null;
      lobbyFailed(t("tableFull"));
      return;
    }
    // lock in 2v2 the first time a 2v2-only message arrives
    if (!room && !net && !game && !game4 && MODE_2V2.has(m.t)) {
      room = { role: "guest", code: joinCode, mySeat: null, seats: null, started: false };
    }
    if (room) guestMsg4(m);
    else netMsg(m);
  }

  /* guest: the link to the table dropped — they can rejoin with the same code */
  function guestConnLost() {
    if (!net && !room) return;                 // already torn down (e.g. via bye)
    const code = joinCode;
    net = null; room = null; rivalName = null;
    game = null; game4 = null;
    clearTimeout(botTimer);
    clearEcho();
    Net.destroy();
    exitToSplash();
    showNotice(t("connLost"), code
      ? t("rejoinHint", code.toUpperCase())
      : t("connLostTable"));
  }

  function openTable() {
    saveName();
    showOverlay(t("onlineTitle"), t("summoning"));
    Net.host({
      onReady: (code) => {
        myTableCode = code;
        const url = location.origin + location.pathname + "#join=" + code;
        showOverlay(t("tableReady"), t("tableReadyTxt"),
          { code, link: url });
      },
      onConnect: () => {
        Net.send({ t: "hello", name: myName() });
        if (game) {
          // a rival (re)connected to a table already in play — resume them
          Net.send({ t: "resume", state: Truco.mirror(game.serialize()) });
          resumeHost1();
        } else {
          hostBegin();
        }
      },
      onMessage: netMsg,
      onClose: () => hostRival1Dropped(),
      onError: netError,
    });
  }

  /* 1v1 host: rival dropped — pause and wait for them to rejoin with the code */
  function hostRival1Dropped() {
    if (!net || net.role !== "host" || rivalGone) return;
    if (!game || game.gameOver) {
      netEnded(t("rivalLeftTitle"), t("rivalLeftTxt"));
      return;
    }
    rivalGone = true;
    showOverlay(t("rivalDisc"), t("rivalDiscTxt"),
      { code: myTableCode, cancelLabel: t("leaveTable") });
  }

  /* 1v1 host: rival is back — drop the pause overlay and repaint the board */
  function resumeHost1() {
    rivalGone = false;
    markRivalSeen();
    el.onlineOverlay.classList.add("hidden");
    if (location.hash.startsWith("#join")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    repaintStage1(t("rivalBack"));
    if (!busy) onIdle();
  }

  /* a shared #join / #join4 link: prefill the code, ask for a name, then join.
     (The link still works; the code is the primary way in.) */
  function openJoinLink(code) {
    if (!requireTerms(() => openJoinLink(code))) return;
    showOverlay(t("joinTableTitle"), t("invitedTxt"));
    el.onlineName.value = localStorage.getItem("monolito-name") || "";
    el.joinCode.value = code.toUpperCase();
    el.onlineNamebox.classList.remove("hidden");
    el.onlineJoinbox.classList.remove("hidden");
    el.btnJoinGo.classList.remove("hidden");
  }

  /* ---------- rules overlay ---------- */

  /* The card ladder: one face per power tier, strongest first. The tiers and
     their order come from the engine (Truco.power over the whole deck), so the
     picture can never drift from the rules the game actually enforces — these
     two maps only decide which card stands for a tier and what to call it. */
  const LADDER_FACE = {
    14: { suit: "espadas", rank: 1 },  13: { suit: "bastos", rank: 1 },
    12: { suit: "espadas", rank: 7 },  11: { suit: "oros", rank: 7 },
    10: { suit: "espadas", rank: 3 },   9: { suit: "espadas", rank: 2 },
     8: { suit: "copas", rank: 1 },     7: { suit: "espadas", rank: 12 },
     6: { suit: "espadas", rank: 11 },  5: { suit: "espadas", rank: 10 },
     4: { suit: "copas", rank: 7 },     3: { suit: "espadas", rank: 6 },
     2: { suit: "espadas", rank: 5 },   1: { suit: "espadas", rank: 4 },
  };

  const LADDER_CAPTION = {
    en: {
      14: "1 espadas", 13: "1 bastos", 12: "7 espadas", 11: "7 oros",
      10: "the 3s", 9: "the 2s", 8: "1 copas / oros", 7: "the 12s",
      6: "the 11s", 5: "the 10s", 4: "7 copas / bastos", 3: "the 6s",
      2: "the 5s", 1: "the 4s",
    },
    es: {
      14: "1 de espadas", 13: "1 de bastos", 12: "7 de espadas", 11: "7 de oros",
      10: "los 3", 9: "los 2", 8: "1 de copas / oros", 7: "los 12",
      6: "los 11", 5: "los 10", 4: "7 de copas / bastos", 3: "los 6",
      2: "los 5", 1: "los 4",
    },
  };

  function cardLadderHTML(lang) {
    const caption = LADDER_CAPTION[lang] || LADDER_CAPTION.en;
    const ranks = Object.keys(Cards.RANK_LABEL).map(Number);

    const tiers = new Map();                       // power -> cards at that power
    for (const suit of Cards.SUITS) {
      for (const rank of ranks) {
        const p = Truco.power({ suit, rank });
        if (!tiers.has(p)) tiers.set(p, []);
        tiers.get(p).push({ suit, rank });
      }
    }

    return [...tiers.keys()].sort((a, b) => b - a).map((p, i) => {
      const face = LADDER_FACE[p] || tiers.get(p)[0];
      const label = caption[p] ||
        `${Cards.RANK_LABEL[face.rank]} ${Cards.SUIT_LABEL[face.suit]}`;
      return `<figure class="ladder-card">
        <span class="ladder-rank">${i + 1}</span>
        ${Cards.cardSVG(face.suit, face.rank)}
        <figcaption>${label}</figcaption>
      </figure>`;
    }).join("");
  }

  const RULES_HTML = {
    en: `
    <h3>The Goal</h3>
    <p>First to <strong>30 points</strong>. Each hand you get 3 cards and play up to 3 tricks — win <strong>2 of 3 tricks</strong> to take the hand.</p>
    <h3>Card Power (high → low)</h3>
    <div class="card-ladder" id="card-ladder"></div>
    <p><em>Suit doesn't matter otherwise — equal cards tie (parda), and ties favor whoever won the earliest trick, or the mano.</em></p>
    <h3>Envido</h3>
    <p>Called in the first trick, before you play your first card. Two cards of the same suit are worth their sum <strong>+ 20</strong> (face cards count 0). Best possible: 33.</p>
    <p>The opening call is always plain <strong>Envido</strong> (2 pts). The responder may raise: <strong>Envido</strong> again, <strong>Real Envido</strong> (+3), or <strong>Falta Envido</strong> — enough points to finish the game. Raises stack (Envido + Envido + Real = 7). Decline and the caller scores the previous stake (minimum 1).</p>
    <h3>Truco</h3>
    <p>Raise the value of the hand at any time: <strong>Truco</strong> (2) → <strong>Retruco</strong> (3) → <strong>Vale Cuatro</strong> (4). Only the side that said "quiero" may raise next. Decline and the caller takes the previous value.</p>
    <h3>Bluffing</h3>
    <p>Lying is legal and expected. Call truco with garbage. Decline nothing. Trust no one — especially El Monolito.</p>
    <h3>Me voy al mazo</h3>
    <p>Fold your hand and concede the current stake. In the first trick before envido it costs 2 points.</p>
    <h3>Flor (optional)</h3>
    <p>Turn on <strong>FLOR</strong> before a game to play "con flor". If your three cards are the <strong>same suit</strong> you have a flor, worth <strong>20 + the pips</strong> (figures count 0, so 20–38). You can only declare it in the first trick, and only if you actually hold it — flor also <strong>beats the envido</strong> (it's set aside).</p>
    <p>An uncontested flor scores <strong>3</strong>. If both sides have flor you compare (higher wins, ties to the mano): <strong>Contraflor</strong> raises it to 6 (decline = 4 to the caller), and <strong>Contraflor al Resto</strong> bets the game.</p>
    <h3>Play Online</h3>
    <p>From the title screen, <strong>PLAY ONLINE</strong> opens a private table — <strong>1v1</strong> or <strong>2v2</strong> — and shows a short <strong>table code</strong>. Share the code; friends pick <strong>JOIN GAME</strong> and type it in. The cards fly when everyone is seated. There's a table-talk chat, and empty 2v2 seats can be filled with bots.</p>
    <p><strong>Dropped out?</strong> Just enter the same code again to rejoin — the hand picks up exactly where it left off. (A shareable link still works too.)</p>
    <h3>2v2 Team Rules</h3>
    <p>Seats alternate teams; your partner sits across the table. The highest card wins the trick for its <strong>team</strong> — if the top cards split between teams it's a parda. Envido is declared from the mano around the table (ties favor whoever is closer to mano), and either member of a team may answer the other side's calls. Folding concedes for your whole team.</p>`,
    es: `
    <h3>El objetivo</h3>
    <p>Primero a <strong>30 puntos</strong>. En cada mano recibís 3 cartas y se juegan hasta 3 bazas — ganá <strong>2 de 3 bazas</strong> para llevarte la mano.</p>
    <h3>Poder de las cartas (mayor → menor)</h3>
    <div class="card-ladder" id="card-ladder"></div>
    <p><em>Por lo demás el palo no importa — cartas iguales empatan (parda), y los empates favorecen al que ganó la baza más temprana, o a la mano.</em></p>
    <h3>Envido</h3>
    <p>Se canta en la primera baza, antes de jugar tu primera carta. Dos cartas del mismo palo valen su suma <strong>+ 20</strong> (las figuras cuentan 0). El máximo: 33.</p>
    <p>El canto inicial es siempre <strong>Envido</strong> (2 ptos). Quien responde puede subir: <strong>Envido</strong> otra vez, <strong>Real Envido</strong> (+3), o <strong>Falta Envido</strong> — los puntos que faltan para terminar el juego. Los cantos se acumulan (Envido + Envido + Real = 7). Si no querés, el que cantó suma lo anterior (mínimo 1).</p>
    <h3>Truco</h3>
    <p>Subí el valor de la mano cuando quieras: <strong>Truco</strong> (2) → <strong>Retruco</strong> (3) → <strong>Vale Cuatro</strong> (4). Solo el lado que dijo "quiero" puede volver a subir. Si no querés, el que cantó se lleva el valor anterior.</p>
    <h3>El bluff</h3>
    <p>Mentir es legal y esperado. Cantá truco con cualquier cosa. No quieras nada. No confíes en nadie — y menos en El Monolito.</p>
    <h3>Me voy al mazo</h3>
    <p>Abandonás la mano y entregás lo que está en juego. En la primera baza, antes del envido, cuesta 2 puntos.</p>
    <h3>Flor (opcional)</h3>
    <p>Activá <strong>FLOR</strong> antes de una partida para jugar "con flor". Si tus tres cartas son del <strong>mismo palo</strong> tenés flor, que vale <strong>20 + los tantos</strong> (las figuras cuentan 0, así que 20–38). Solo se canta en la primera baza, y solo si la tenés de verdad — la flor además <strong>mata al envido</strong> (queda anulado).</p>
    <p>La flor sin rival vale <strong>3</strong>. Si los dos tienen flor se compara (gana la más alta, los empates a la mano): <strong>Contraflor</strong> la sube a 6 (si no se quiere, 4 para el que cantó), y <strong>Contraflor al Resto</strong> apuesta el chico.</p>
    <h3>Jugar online</h3>
    <p>Desde la portada, <strong>JUGAR ONLINE</strong> abre una mesa privada — <strong>1v1</strong> o <strong>2v2</strong> — y muestra un <strong>código de mesa</strong> corto. Compartí el código; tus amigos eligen <strong>ENTRAR</strong> y lo escriben. Las cartas vuelan cuando están todos sentados. Hay charla de mesa, y los asientos 2v2 vacíos se pueden llenar con bots.</p>
    <p><strong>¿Te desconectaste?</strong> Volvé a ingresar el mismo código para reincorporarte — la mano sigue justo donde la dejaste. (El enlace para compartir también sirve.)</p>
    <h3>Reglas 2v2 (en equipo)</h3>
    <p>Los asientos alternan equipos; tu compañero se sienta enfrente. La carta más alta gana la baza para su <strong>equipo</strong> — si las cartas más altas se reparten entre equipos, es parda. El envido se declara desde la mano alrededor de la mesa (los empates favorecen al más cercano a la mano), y cualquiera del equipo puede responder los cantos del otro lado. Irse al mazo entrega por todo tu equipo.</p>`,
  };

  /* ---------- boot ---------- */

  /* apply the chosen language to the static chrome (the rest reads `lang`
     through t() when it renders). The toggle lives on the main screen, so
     language is normally chosen before opening any menu or game. */
  function applyLang() {
    document.documentElement.lang = lang;
    el.langToggle.textContent = lang === "en" ? "ES" : "EN";
    el.splashTag.textContent = t("splashTag");
    el.btnStart.textContent = t("dealMeIn");
    el.btnOnline.textContent = t("playOnline");
    el.btnJoinGame.textContent = t("joinGame");
    el.btnRules.textContent = t("howToPlay");
    // solo overlay
    el.soloOverlay.querySelector("h2").textContent = t("dealMeIn");
    el.soloOverlay.querySelector(".online-status").textContent = t("soloStatus");
    el.btnSoloBot.textContent = t("playBot");
    el.btnSoloLocal.textContent = t("passPlay");
    el.soloOverlay.querySelector(".solo-hint").textContent = t("soloHint");
    el.btnSoloCancel.textContent = t("back");
    // pass gate
    el.passgate.querySelector(".passgate-sub").textContent = t("passSub");
    el.passgateGo.textContent = t("ready");
    // rules
    el.rulesOverlay.querySelector("h2").textContent = t("howToPlay");
    el.btnCloseRules.textContent = t("back");
    el.rulesContent.innerHTML = RULES_HTML[lang] || RULES_HTML.en;
    const ladder = el.rulesContent.querySelector("#card-ladder");
    if (ladder) ladder.innerHTML = cardLadderHTML(lang);
    // online + name + chat chrome
    for (const lab of document.querySelectorAll('label[for="online-name"], label[for="name-input"]'))
      lab.textContent = t("yourName");
    const joinLab = document.querySelector('label[for="join-code"]');
    if (joinLab) joinLab.textContent = t("tableCode");
    const codeLab = document.querySelector(".online-codelabel");
    if (codeLab) codeLab.textContent = t("tableCode");
    const codeHint = document.querySelector(".online-codehint");
    if (codeHint) codeHint.textContent = t("codeHint");
    el.btnCopyLink.textContent = t("orCopyLink");
    el.btnShareLink.textContent = t("share");
    el.btnJoinGo.textContent = t("joinTable");
    el.btnJoin2v2.textContent = t("joinTable");
    el.btnLobbyName.textContent = t("editName");
    if (el.btnLobbyChat.firstChild) el.btnLobbyChat.firstChild.nodeValue = t("tableTalkBtn");
    el.btnNameSave.textContent = t("save");
    el.chatPanel.querySelector(".chat-title").textContent = t("tableTalk");
    el.chatInput.placeholder = t("sayThis");
    el.onlineName.placeholder = t("playerPH");
    el.nameInput.placeholder = t("playerPH");
    // settings
    el.settingsTitle.textContent = t("settingsTitle");
    el.setSoundLabel.textContent = t("soundLabel");
    el.setThemeLabel.textContent = t("appearance");
    el.setHapticsLabel.textContent = t("hapticsLabel");
    el.setStatsLabel.textContent = t("soloRecordLabel");
    el.setBlockedLabel.textContent = t("blockedLabel");
    el.settingsPrivacy.textContent = t("privacyNote");
    el.settingsPolicyLink.textContent = t("policyLink");
    el.btnCloseSettings.textContent = t("back");
    // moderation chrome
    el.chatHint.textContent = t("chatHint");
    el.modTitle.textContent = t("modTitle");
    el.modNote.textContent = t("modNote");
    el.btnModReport.textContent = t("modReport");
    el.btnModCancel.textContent = t("modCancel");
    el.termsTitle.textContent = t("termsTitle");
    el.termsBody.textContent = t("termsBody");
    el.termsPolicyLink.textContent = t("policyLink");
    el.btnTermsAccept.textContent = t("termsAccept");
    el.btnTermsDecline.textContent = t("termsDecline");
    renderSettings();
    renderFlorToggles();
  }

  function renderFlorToggles() {
    const label = t("florToggle", florOn);
    for (const b of [el.btnFlorSolo, el.btnFlorOnline]) {
      b.textContent = label;
      b.classList.toggle("flor-on", florOn);
    }
  }

  function renderSplashStats() {
    const s = Stats.get();
    if (s.wins + s.losses === 0) { el.splashStats.classList.add("hidden"); return; }
    const streakTxt = s.streak > 1 ? ` · 🔥 ${s.streak}` : "";
    el.splashStats.textContent = t("soloRecord", s.wins, s.losses, streakTxt, s.best);
    el.splashStats.classList.remove("hidden");
  }
  applyLang();
  renderSplashStats();

  el.langToggle.addEventListener("click", () => {
    lang = lang === "en" ? "es" : "en";
    localStorage.setItem("monolito-lang", lang);
    applyLang();
    renderSplashStats();
  });

  /* ---------- settings ---------- */

  /* the static labels are set by applyLang(); this paints the live values */
  function renderSettings() {
    el.setSound.textContent = Sound.muted() ? t("off") : t("on");
    el.setTheme.textContent = theme === "light" ? t("light") : t("dark");
    el.setHaptics.textContent = Haptics.off() ? t("off") : t("on");
    el.setReset.textContent = t("reset");
    el.setReset.disabled = false;
    const n = Moderation.blocked().length;
    el.setBlocked.textContent = n ? t("blockedCount", n) : t("blockedNone");
    el.setBlocked.disabled = n === 0;
  }

  el.settingsToggle.addEventListener("click", () => {
    renderSettings();
    el.settingsOverlay.classList.remove("hidden");
  });
  el.btnCloseSettings.addEventListener("click", () => el.settingsOverlay.classList.add("hidden"));
  el.setSound.addEventListener("click", () => {
    Sound.toggle();
    if (!Sound.muted()) Sound.play("trick");   // a quick audible confirmation
    renderSettings();
  });
  el.setHaptics.addEventListener("click", () => {
    Haptics.toggle();   // toggling on buzzes once as confirmation
    renderSettings();
  });
  el.setTheme.addEventListener("click", () => {
    theme = theme === "light" ? "dark" : "light";
    localStorage.setItem("monolito-theme", theme);
    applyTheme();
    renderSettings();
  });
  /* two-tap reset: RESET → SURE? → CLEARED */
  el.setReset.addEventListener("click", () => {
    if (el.setReset.textContent !== t("resetConfirm")) {
      if (el.setReset.textContent === t("resetDone")) return;
      el.setReset.textContent = t("resetConfirm");
      return;
    }
    Stats.reset();
    renderSplashStats();
    el.setReset.textContent = t("resetDone");
    el.setReset.disabled = true;
  });

  /* unblock everyone at once */
  el.setBlocked.addEventListener("click", () => {
    Moderation.clearBlocks();
    el.setBlocked.textContent = t("blockedCleared");
    el.setBlocked.disabled = true;
  });

  /* report / block sheet */
  el.btnModReport.addEventListener("click", doReport);
  el.btnModBlock.addEventListener("click", doBlockToggle);
  el.btnModCancel.addEventListener("click", closeModMenu);
  el.modOverlay.addEventListener("click", (e) => { if (e.target === el.modOverlay) closeModMenu(); });

  const toggleFlor = () => {
    florOn = !florOn;
    localStorage.setItem("monolito-flor", florOn ? "1" : "0");
    renderFlorToggles();
  };
  el.btnFlorSolo.addEventListener("click", toggleFlor);
  el.btnFlorOnline.addEventListener("click", toggleFlor);

  el.btnStart.addEventListener("click", () => el.soloOverlay.classList.remove("hidden"));
  el.btnSoloCancel.addEventListener("click", () => el.soloOverlay.classList.add("hidden"));
  el.btnSoloBot.addEventListener("click", () => {
    el.soloOverlay.classList.add("hidden");
    local2 = false;
    botName = BOT_OPPONENTS[Math.floor(Math.random() * BOT_OPPONENTS.length)];
    enterStage();
    newGame();
  });
  el.btnSoloLocal.addEventListener("click", () => {
    el.soloOverlay.classList.add("hidden");
    local2 = true;
    enterStage();
    newLocalGame();
  });
  el.passgateGo.addEventListener("click", passGateReady);

  el.btnOnline.addEventListener("click", openOnlineMenu);
  el.btnJoinGame.addEventListener("click", openJoinPrompt);
  el.btnJoinGo.addEventListener("click", joinFromCode);
  el.joinCode.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); joinFromCode(); }
  });
  el.btnMode1v1.addEventListener("click", openTable);
  el.btnMode2v2.addEventListener("click", () => { saveName(); openTable4(); });
  el.btnStart2v2.addEventListener("click", () => {
    if (room && room.role === "host" && !room.started &&
        room.seats.every((s) => s.kind !== "open")) {
      hostBegin4();
    }
  });
  el.btnOnlineCancel.addEventListener("click", closeOverlay);

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* ignore */ }
      ta.remove();
    }
  }

  el.btnCopyCode.addEventListener("click", async () => {
    await copyText(myTableCode ? myTableCode.toUpperCase() : el.onlineCode.textContent);
    el.btnCopyCode.textContent = t("copied");
    setTimeout(() => { el.btnCopyCode.textContent = t("copy"); }, 1600);
  });

  el.btnCopyLink.addEventListener("click", async () => {
    await copyText(el.onlineLink.value);
    el.btnCopyLink.textContent = t("copied");
    setTimeout(() => { el.btnCopyLink.textContent = t("orCopyLink"); }, 1600);
  });

  el.btnShareLink.addEventListener("click", () => {
    navigator.share({
      title: "MONOLITO · Truco Argentino",
      text: t("shareText"),
      url: el.onlineLink.value,
    }).catch(() => {});
  });

  el.btnRules.addEventListener("click", () => el.rulesOverlay.classList.remove("hidden"));
  el.btnCloseRules.addEventListener("click", () => el.rulesOverlay.classList.add("hidden"));
  el.btnExit.addEventListener("click", () => {
    leaveNet();
    leaveNet4();
    exitToSplash();
  });

  el.btnChat.addEventListener("click", () => {
    if (el.chatPanel.classList.contains("hidden")) openChat();
    else closeChat();
  });
  el.btnLobbyChat.addEventListener("click", openChat);
  el.btnChatClose.addEventListener("click", closeChat);
  el.chatToast.addEventListener("click", () => { hideToast(); openChat(); });

  el.btnName.addEventListener("click", () => {
    if (el.namePanel.classList.contains("hidden")) openNamePanel();
    else closeNamePanel();
  });
  el.btnLobbyName.addEventListener("click", openNamePanel);
  el.hudCode.addEventListener("click", async () => {
    const code = activeCode();
    if (!code) return;
    await copyText(code.toUpperCase());
    el.hudCode.textContent = t("copied");
    setTimeout(renderHudCode, 1400);
  });
  el.btnNameSave.addEventListener("click", applyRename);
  el.nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyRename(); }
  });
  el.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendChat(el.chatInput.value);
    el.chatInput.value = "";
  });

  /* ---------- Android back button ---------- */

  /* Android hands every back press to the app (see nativeback.js). "Back"
     has to mean the same thing it means on screen: dismiss whatever is on
     top, and once nothing is, leave the table — then the app.

     Order matters. It is the reverse of the order things stack visually,
     so the first match wins and each press peels exactly one layer. */

  let leaveArmed = 0;   // timestamp of a first back press during a match

  /* Leaving mid-hand costs a real game (and strands a rival online), so it
     takes two presses. The hint goes in the dock, which is on screen for the
     whole match, and yields to any play-by-play that lands on top of it. */
  function armLeave() {
    const hint = t("backAgain");
    const prev = el.dockMsg.textContent;
    leaveArmed = Date.now();
    msg(hint);
    setTimeout(() => {
      if (Date.now() - leaveArmed < 1900) return;      // re-armed since
      leaveArmed = 0;
      if (el.dockMsg.textContent === hint) msg(prev);  // a real event won instead
    }, 2000);
  }

  function leaveTable() {
    leaveArmed = 0;
    leaveNet();
    leaveNet4();
    exitToSplash();
  }

  const shown = (node) => node && !node.classList.contains("hidden");

  function handleBack() {
    // top-most layers first — each press closes exactly one
    if (shown(el.modOverlay)) return closeModMenu();
    if (shown(el.termsOverlay)) {
      el.termsOverlay.classList.add("hidden");
      termsNext = null;                       // declining, same as the button
      return;
    }
    if (shown(el.namePanel)) return closeNamePanel();
    if (shown(el.chatPanel)) return closeChat();
    if (shown(el.rulesOverlay)) return el.rulesOverlay.classList.add("hidden");
    if (shown(el.settingsOverlay)) return el.settingsOverlay.classList.add("hidden");
    if (shown(el.soloOverlay)) return el.soloOverlay.classList.add("hidden");
    if (shown(el.onlineOverlay)) return closeOverlay();

    // the match is already over — nothing to lose, so one press is enough
    if (document.querySelector(".endgame")) return leaveTable();

    // mid-match (including behind a pass & play gate): confirm before leaving
    if (shown(el.stage)) {
      if (leaveArmed && Date.now() - leaveArmed < 2000) return leaveTable();
      return armLeave();
    }

    // on the splash with nothing open: back out of the app, like any other
    NativeBack.exit();
  }

  NativeBack.onBack(handleBack);

  // deep links still work: #join=<code> or #join4=<code> prefill the code and
  // ask for a name (mode is detected on connect); #play goes straight to solo
  const linkMatch = location.hash.match(/^#join4?=([a-z0-9]+)$/i);
  if (linkMatch) openJoinLink(linkMatch[1].toLowerCase());
  else if (location.hash === "#play") el.btnStart.click();
})();
