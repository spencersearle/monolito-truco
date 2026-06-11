/* ============================================================
   MONOLITO · cards.js
   SVG renderer for the 40-card Spanish deck (baraja española),
   restyled futuristic: navy faces, gold frames, glowing suits.
   Authentic touches kept: pinta border-breaks (oros 0, copas 1,
   espadas 2, bastos 3) and traditional pip arrangements.
   ============================================================ */

const SUITS = ["espadas", "bastos", "oros", "copas"];

const SUIT_LABEL = {
  oros: "Oros",
  copas: "Copas",
  espadas: "Espadas",
  bastos: "Bastos",
};

const RANK_LABEL = {
  1: "As", 2: "Dos", 3: "Tres", 4: "Cuatro", 5: "Cinco",
  6: "Seis", 7: "Siete", 10: "Sota", 11: "Caballo", 12: "Rey",
};

const SUIT_COLOR = {
  oros:    { main: "#f2c94c", deep: "#8a6410", glow: "rgba(242,201,76,.55)" },
  copas:   { main: "#e8b84b", deep: "#7d5a14", glow: "rgba(232,184,75,.5)" },
  espadas: { main: "#9cc4ff", deep: "#1d5cd6", glow: "rgba(156,196,255,.55)" },
  bastos:  { main: "#7fd6a8", deep: "#1e6e46", glow: "rgba(127,214,168,.5)" },
};

/* ---------- suit symbols, drawn in a 100x100 box centered at (50,50) ---------- */

function symbolOro(id) {
  return `
  <g filter="url(#glow-${id})">
    <circle cx="50" cy="50" r="34" fill="url(#oro-grad-${id})"/>
    <circle cx="50" cy="50" r="34" fill="none" stroke="#8a6410" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="25" fill="none" stroke="rgba(10,26,58,.55)" stroke-width="2"/>
    <path d="M50 33 L54.5 44.5 L66.5 45 L57 52.5 L60.5 64 L50 57 L39.5 64 L43 52.5 L33.5 45 L45.5 44.5 Z"
          fill="#0a1a3a" opacity=".85"/>
  </g>`;
}

function symbolCopa(id) {
  return `
  <g filter="url(#glow-${id})">
    <path d="M28 22 L72 22 L70 38 C69 52 61 60 53 62 L53 74 L66 80 L66 85 L34 85 L34 80 L47 74 L47 62 C39 60 31 52 30 38 Z"
          fill="url(#copa-grad-${id})" stroke="#7d5a14" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M33 30 L67 30" stroke="rgba(10,26,58,.5)" stroke-width="2.5"/>
    <ellipse cx="50" cy="44" rx="11" ry="6" fill="rgba(10,26,58,.35)"/>
  </g>`;
}

function symbolEspada(id) {
  return `
  <g filter="url(#glow-${id})">
    <path d="M50 8 L56 20 L56 62 L50 70 L44 62 L44 20 Z"
          fill="url(#espada-grad-${id})" stroke="#1d5cd6" stroke-width="2"/>
    <path d="M50 14 L50 64" stroke="rgba(10,26,58,.55)" stroke-width="2"/>
    <rect x="30" y="66" width="40" height="7" rx="3.5" fill="#d4a02a" stroke="#8a6410" stroke-width="1.5"/>
    <rect x="46" y="73" width="8" height="14" rx="2.5" fill="#d4a02a" stroke="#8a6410" stroke-width="1.5"/>
    <circle cx="50" cy="91" r="5.5" fill="#f2c94c" stroke="#8a6410" stroke-width="1.5"/>
  </g>`;
}

function symbolBasto(id) {
  return `
  <g filter="url(#glow-${id})">
    <path d="M50 6 C60 6 65 14 64 24 L59 72 C58.5 79 56 86 50 86 C44 86 41.5 79 41 72 L36 24 C35 14 40 6 50 6 Z"
          fill="url(#basto-grad-${id})" stroke="#1e6e46" stroke-width="2.5"/>
    <path d="M44 16 C46 13 54 13 56 16" stroke="rgba(10,26,58,.45)" stroke-width="2" fill="none"/>
    <rect x="39" y="56" width="22" height="6" rx="3" fill="#d4a02a" stroke="#8a6410" stroke-width="1.2"/>
    <ellipse cx="50" cy="90" rx="7" ry="4" fill="#d4a02a" stroke="#8a6410" stroke-width="1.2"/>
  </g>`;
}

const SUIT_SYMBOL = {
  oros: symbolOro,
  copas: symbolCopa,
  espadas: symbolEspada,
  bastos: symbolBasto,
};

/* ---------- face-card glyphs (sota / caballo / rey), 100x100 box ---------- */

function glyphSota() {
  // footman: helmeted figure with banner pike
  return `
  <g>
    <line x1="68" y1="10" x2="68" y2="78" stroke="#d4a02a" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M68 12 L88 19 L68 27 Z" fill="#f2c94c" stroke="#8a6410" stroke-width="1.5"/>
    <circle cx="42" cy="30" r="11" fill="#9cc4ff"/>
    <path d="M31 30 a11 11 0 0 1 22 0 Z" fill="#1d5cd6"/>
    <path d="M26 78 L30 50 C32 42 52 42 54 50 L58 78 Z" fill="#1d5cd6" stroke="#9cc4ff" stroke-width="1.5"/>
    <path d="M30 56 L54 56" stroke="#d4a02a" stroke-width="2.5"/>
  </g>`;
}

function glyphCaballo() {
  // knight: chess-horse head profile
  return `
  <g>
    <path d="M36 84 C34 66 30 56 36 44 C42 32 56 24 60 14 L66 22 L74 18 C82 30 84 44 80 56 C77 65 70 68 62 70 L60 84 Z"
          fill="#1d5cd6" stroke="#9cc4ff" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="66" cy="32" r="3" fill="#f2c94c"/>
    <path d="M60 14 L57 26" stroke="#9cc4ff" stroke-width="2"/>
    <path d="M28 84 L70 84" stroke="#d4a02a" stroke-width="3.5" stroke-linecap="round"/>
  </g>`;
}

function glyphRey() {
  // king: crown over shoulders
  return `
  <g>
    <path d="M26 40 L32 18 L42 32 L50 14 L58 32 L68 18 L74 40 Z"
          fill="#f2c94c" stroke="#8a6410" stroke-width="2" stroke-linejoin="round"/>
    <rect x="26" y="40" width="48" height="8" rx="2" fill="#d4a02a" stroke="#8a6410" stroke-width="1.5"/>
    <circle cx="32" cy="16" r="3" fill="#f2c94c"/>
    <circle cx="50" cy="11" r="3.5" fill="#f2c94c"/>
    <circle cx="68" cy="16" r="3" fill="#f2c94c"/>
    <path d="M30 86 C30 66 42 58 50 58 C58 58 70 66 70 86 Z" fill="#1d5cd6" stroke="#9cc4ff" stroke-width="2"/>
    <path d="M50 58 L50 86" stroke="#9cc4ff" stroke-width="1.5"/>
  </g>`;
}

const FACE_GLYPH = { 10: glyphSota, 11: glyphCaballo, 12: glyphRey };

/* ---------- pip layouts (card viewBox 200x300) ---------- */

const PIP_LAYOUT = {
  1: [[100, 150]],
  2: [[100, 95], [100, 205]],
  3: [[100, 78], [100, 150], [100, 222]],
  4: [[64, 95], [136, 95], [64, 205], [136, 205]],
  5: [[64, 95], [136, 95], [100, 150], [64, 205], [136, 205]],
  6: [[64, 85], [136, 85], [64, 150], [136, 150], [64, 215], [136, 215]],
  7: [[64, 85], [136, 85], [100, 118], [64, 150], [136, 150], [64, 215], [136, 215]],
};

const PIP_SCALE = { 1: 1.15, 2: 0.62, 3: 0.58, 4: 0.6, 5: 0.55, 6: 0.55, 7: 0.52 };

/* ---------- pinta: border breaks identify the suit at a glance ---------- */

const PINTA_BREAKS = { oros: 0, copas: 1, espadas: 2, bastos: 3 };

function pintaLine(y, breaks) {
  const x0 = 22, x1 = 178;
  if (breaks === 0) {
    return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#d4a02a" stroke-width="2.5"/>`;
  }
  const gap = 12;
  const segs = breaks + 1;
  const total = x1 - x0 - breaks * gap;
  const segLen = total / segs;
  let parts = "", x = x0;
  for (let i = 0; i < segs; i++) {
    parts += `<line x1="${x}" y1="${y}" x2="${x + segLen}" y2="${y}" stroke="#d4a02a" stroke-width="2.5"/>`;
    x += segLen + gap;
  }
  return parts;
}

/* ---------- shared defs ---------- */

let uid = 0;

function cardDefs(id) {
  return `
  <defs>
    <linearGradient id="face-grad-${id}" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#10295c"/>
      <stop offset="0.55" stop-color="#0a1a3a"/>
      <stop offset="1" stop-color="#071224"/>
    </linearGradient>
    <radialGradient id="oro-grad-${id}" cx="0.36" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#f8e08a"/>
      <stop offset="0.45" stop-color="#f2c94c"/>
      <stop offset="1" stop-color="#a87b18"/>
    </radialGradient>
    <linearGradient id="copa-grad-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2c94c"/>
      <stop offset="1" stop-color="#a87b18"/>
    </linearGradient>
    <linearGradient id="espada-grad-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#dceaff"/>
      <stop offset="0.5" stop-color="#9cc4ff"/>
      <stop offset="1" stop-color="#5d8fe0"/>
    </linearGradient>
    <linearGradient id="basto-grad-${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#a8e8c6"/>
      <stop offset="0.5" stop-color="#7fd6a8"/>
      <stop offset="1" stop-color="#3a9c6a"/>
    </linearGradient>
    <filter id="glow-${id}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>`;
}

function placeSymbol(suit, id, x, y, scale) {
  return `<g transform="translate(${x - 50 * scale} ${y - 50 * scale}) scale(${scale})">${SUIT_SYMBOL[suit](id)}</g>`;
}

/* ---------- card face ---------- */

function cardSVG(suit, rank) {
  const id = ++uid;
  const c = SUIT_COLOR[suit];
  const breaks = PINTA_BREAKS[suit];

  let middle = "";
  if (rank <= 7) {
    const scale = PIP_SCALE[rank];
    middle = PIP_LAYOUT[rank]
      .map(([x, y]) => placeSymbol(suit, id, x, y, scale))
      .join("");
  } else {
    middle = `
      <circle cx="100" cy="128" r="56" fill="rgba(212,160,42,.06)" stroke="rgba(212,160,42,.4)" stroke-width="1.5"/>
      <g transform="translate(50 78) scale(1)">${FACE_GLYPH[rank]()}</g>
      ${placeSymbol(suit, id, 100, 222, 0.5)}
      <text x="100" y="272" text-anchor="middle" font-family="Cinzel, serif" font-size="17"
            font-weight="700" letter-spacing="3" fill="#d4a02a">${RANK_LABEL[rank].toUpperCase()}</text>`;
  }

  const cornerNum = rank > 9 ? rank : rank;

  return `
  <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
    ${cardDefs(id)}
    <rect x="2" y="2" width="196" height="296" rx="16" fill="url(#face-grad-${id})"
          stroke="#d4a02a" stroke-width="2.5"/>
    <rect x="9" y="9" width="182" height="282" rx="11" fill="none"
          stroke="rgba(242,201,76,.28)" stroke-width="1"/>
    ${pintaLine(22, breaks)}
    ${pintaLine(278, breaks)}
    <text x="22" y="52" font-family="Cinzel, serif" font-size="30" font-weight="700"
          fill="${c.main}" style="text-shadow:0 0 8px ${c.glow}">${cornerNum}</text>
    ${placeSymbol(suit, id, 168, 44, 0.3)}
    <g transform="rotate(180 100 150)">
      <text x="22" y="52" font-family="Cinzel, serif" font-size="30" font-weight="700" fill="${c.main}">${cornerNum}</text>
      ${placeSymbol(suit, id, 168, 44, 0.3)}
    </g>
    ${middle}
  </svg>`;
}

/* ---------- card back ---------- */

function cardBackSVG() {
  const id = ++uid;
  return `
  <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="back-grad-${id}" x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0" stop-color="#12306e"/>
        <stop offset="0.6" stop-color="#0a1a3a"/>
        <stop offset="1" stop-color="#071224"/>
      </linearGradient>
      <radialGradient id="back-coin-${id}" cx="0.36" cy="0.32" r="0.9">
        <stop offset="0" stop-color="#f8e08a"/>
        <stop offset="0.5" stop-color="#f2c94c"/>
        <stop offset="1" stop-color="#a87b18"/>
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="196" height="296" rx="16" fill="url(#back-grad-${id})"
          stroke="#d4a02a" stroke-width="2.5"/>
    <rect x="10" y="10" width="180" height="280" rx="10" fill="none"
          stroke="rgba(242,201,76,.35)" stroke-width="1.2"/>
    <path d="M10 95 C45 75 70 115 100 95 C130 75 155 115 190 95 L190 110 C155 130 130 90 100 110 C70 130 45 90 10 110 Z"
          fill="rgba(212,160,42,.30)"/>
    <path d="M10 190 C45 170 70 210 100 190 C130 170 155 210 190 190 L190 205 C155 225 130 185 100 205 C70 225 45 185 10 205 Z"
          fill="rgba(212,160,42,.22)"/>
    <circle cx="100" cy="150" r="34" fill="url(#back-coin-${id})" stroke="#8a6410" stroke-width="2.5"/>
    <circle cx="100" cy="150" r="24" fill="#0a1a3a"/>
    <circle cx="100" cy="150" r="13" fill="url(#back-coin-${id})"/>
  </svg>`;
}

/* exported surface */
const Cards = { cardSVG, cardBackSVG, SUITS, SUIT_LABEL, RANK_LABEL };
