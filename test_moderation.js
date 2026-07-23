/* ============================================================
   MONOLITO · test_moderation.js
   Verifies the Guideline 1.2 machinery: the chat filter masks
   objectionable words (including the usual evasions) without
   mangling innocent ones, and block/report/terms persist.

   Run: node test_moderation.js
   ============================================================ */

/* A tiny in-memory localStorage so the storage paths are exercised
   under Node exactly as they are in the browser. Must exist before
   moderation.js is required. */
global.localStorage = (() => {
  let map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _reset: () => { map = new Map(); },
  };
})();

const M = require("./moderation.js");

let passed = 0, failed = 0;

function check(name, cond, extra = "") {
  if (cond) { passed++; }
  else { failed++; console.log(`  ✗ ${name}${extra ? "  — " + extra : ""}`); }
}

function eq(name, actual, expected) {
  check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

function section(title) { console.log(`\n${title}`); }

/* The suite must not hardcode profanity either. Build probe words
   from the module's own list the same way the filter does — decode
   once here, purely to drive the tests. */
const LIST = Buffer.from(
  require("fs").readFileSync("./moderation.js", "utf8")
    .match(/LIST_B64\s*=\s*([\s\S]*?);/)[1]
    .match(/"([^"]*)"/g).map((s) => s.slice(1, -1)).join(""),
  "base64",
).toString("utf8").split(",");

const BAD = LIST[0];                              // a short entry
const BAD_LONG = LIST.find((w) => w.length >= 7); // a long entry (substring rule)

/* ---------- filtering ---------- */
section("Filter · masks objectionable words");

check("a listed word is masked", M.filterText(BAD) === M.MASK.repeat(BAD.length));
check("mask length matches the word", M.filterText(BAD).length === BAD.length);
check("hasObjectionable flags it", M.hasObjectionable(BAD) === true);
check("a long listed word is masked", M.filterText(BAD_LONG) === M.MASK.repeat(BAD_LONG.length));

section("Filter · leaves ordinary play talk alone");

const CLEAN = [
  "quiero retruco",
  "envido son 33",
  "no quiero, al mazo",
  "good game, well played",
  "voy a recoger las cartas",   // contains a 5-letter entry as a substring
  "tengo que escoger una",      // same trap, different prefix
  "flor! son 38 puntos",
  "Scunthorpe",                 // the classic false-positive test
  "classic analysis assignment",
];
for (const s of CLEAN) eq(`untouched: "${s}"`, M.filterText(s), s);

section("Filter · sees through evasion");

check("uppercase", M.hasObjectionable(BAD.toUpperCase()));
check("mixed case", M.hasObjectionable(BAD[0].toUpperCase() + BAD.slice(1)));
check("letters spaced by punctuation", M.hasObjectionable(BAD.split("").join("*")));
check("repeated letters", M.hasObjectionable(BAD[0] + BAD[0] + BAD[0] + BAD.slice(1)));
check("leetspeak digits", M.hasObjectionable(BAD.replace(/i/g, "1").replace(/o/g, "0").replace(/a/g, "4").replace(/e/g, "3")));
check("trailing plural", M.hasObjectionable(BAD + "s"));
check("accented letters", M.hasObjectionable(BAD.replace(/a/g, "á").replace(/o/g, "ó")));

section("Filter · preserves the rest of the sentence");

const mixed = `quiero ${BAD} truco`;
const out = M.filterText(mixed);
check("surrounding words survive", out.startsWith("quiero ") && out.endsWith(" truco"));
check("only the bad word is masked", out.includes(M.MASK) && !out.includes(BAD));
eq("punctuation is kept", M.filterText(`${BAD}!`), M.MASK.repeat(BAD.length) + "!");

section("Filter · degenerate input");
eq("empty string", M.filterText(""), "");
eq("null", M.filterText(null), "");
eq("undefined", M.filterText(undefined), "");
eq("whitespace only", M.filterText("   "), "   ");

/* ---------- blocking ---------- */
section("Block · add, test, remove");

localStorage._reset();
check("nobody blocked at first", M.blocked().length === 0);
check("unknown name is not blocked", M.isBlocked("Juan") === false);

M.block("Juan");
check("blocked after block()", M.isBlocked("Juan") === true);
eq("list has one entry", M.blocked().length, 1);

check("match ignores case", M.isBlocked("JUAN") === true);
check("match ignores surrounding spaces", M.isBlocked("  juan  ") === true);
check("a different player is unaffected", M.isBlocked("Sofia") === false);

M.block("Juan");
eq("blocking twice does not duplicate", M.blocked().length, 1);

M.block("Sofia");
eq("a second player is added", M.blocked().length, 2);

M.unblock("Juan");
check("unblocked", M.isBlocked("Juan") === false);
check("the other block survives", M.isBlocked("Sofia") === true);

M.clearBlocks();
eq("clearBlocks empties the list", M.blocked().length, 0);

check("empty name is never blocked", M.isBlocked("") === false);
M.block("");
eq("blocking an empty name is a no-op", M.blocked().length, 0);

section("Block · persists across a reload");
localStorage._reset();
M.block("Mateo");
const raw = localStorage.getItem("monolito-blocked");
check("written to localStorage", typeof raw === "string" && raw.includes("Mateo"));
check("read back", M.isBlocked("Mateo") === true);

/* ---------- reporting ---------- */
section("Report · records and blocks in one step");

localStorage._reset();
eq("no reports at first", M.reports().length, 0);

M.report("Diego", "something offensive");
eq("report recorded", M.reports().length, 1);
check("reported player is auto-blocked", M.isBlocked("Diego") === true);
check("report keeps the name", M.reports()[0].name === "Diego");
check("report keeps the text", M.reports()[0].text === "something offensive");
check("report is timestamped", typeof M.reports()[0].at === "string" && !isNaN(Date.parse(M.reports()[0].at)));

localStorage._reset();
for (let i = 0; i < 60; i++) M.report("P" + i, "msg " + i);
eq("report log is capped at 50", M.reports().length, 50);
check("the cap drops the oldest", M.reports()[0].name === "P10");

section("Report · mailto is well formed");
const link = M.reportMailto("support@example.com", "Diego", "bad message");
check("addressed to support", link.startsWith("mailto:support@example.com?"));
check("carries a subject", link.includes("subject="));
check("body names the player", decodeURIComponent(link).includes("Diego"));
check("body carries the message", decodeURIComponent(link).includes("bad message"));

/* ---------- terms ---------- */
section("Terms · one-time acceptance persists");

localStorage._reset();
check("not accepted initially", M.termsAccepted() === false);
M.acceptTerms();
check("accepted after acceptTerms()", M.termsAccepted() === true);

/* ---------- storage-less environment ---------- */
section("Storage · degrades safely when unavailable");

const savedLS = global.localStorage;
Object.defineProperty(global, "localStorage", {
  configurable: true,
  get() { throw new Error("SecurityError: storage disabled"); },
});

let survived = true;
try {
  M.filterText("hola");
  M.blocked();
  M.isBlocked("Juan");
  M.block("Juan");
  M.report("Juan", "x");
  M.termsAccepted();
  M.acceptTerms();
} catch (e) {
  survived = false;
  console.log("  ✗ threw with storage disabled: " + e.message);
}
check("no throw when localStorage is inaccessible", survived);

Object.defineProperty(global, "localStorage", { configurable: true, writable: true, value: savedLS });

/* ---------- summary ---------- */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
