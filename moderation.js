/* ============================================================
   MONOLITO · moderation.js
   The four things Apple's Guideline 1.2 asks of an app with
   user-generated content (the table-talk chat):

     1. filter objectionable material  → filterText()
     2. block abusive users            → block() / isBlocked()
     3. report offensive content       → report()
     4. published contact info + terms → privacy.html + the
                                         one-time agreement gate

   Pure logic only, no DOM — so it also runs under Node for the
   test suite (test_moderation.js). Storage calls are guarded so
   the module still works where localStorage is absent.
   ============================================================ */

const Moderation = (() => {

  /* The word list is base64-encoded on purpose: a filter is only
     useful if it knows the words, but nobody reading this repo
     should have to look at them. Decoded once, lazily. */
  const LIST_B64 =
    "ZnVjayxzaGl0LGN1bnQsYml0Y2gsYmFzdGFyZCxhc3Nob2xlLGRpY2ssY29jayxwdXNzeSx3aG9y" +
    "ZSxzbHV0LGRvdWNoZSx3YW5rZXIsYm9sbG9ja3MscHJpY2ssdHdhdCxuaWdnZXIsbmlnZ2EsZmFn" +
    "Z290LGZhZyxyZXRhcmQsdHJhbm55LHNwaWMsY2hpbmssa2lrZSx3ZXRiYWNrLGR5a2UsbWllcmRh" +
    "LHB1dGEscHV0byxwZW5kZWpvLGNhYnJvbixjYWJyb25hLGNvbmNoYSxib2x1ZG8sZm9ycm8scGVs" +
    "b3R1ZG8sZ2lsaXBvbGxhcyxqb2RlcixjaGluZ2EsdmVyZ2EsY3VsaWFvLGNvbmNodWRvLGNhcmFq" +
    "byxjb2dlcixwb2xsYSx6b3JyYSxtYXJpY29uLG1hcmljYSxuZWdyYXRhLHN1ZGFjYSxwYW5jaGl0bw==";

  const MASK = "▮"; // ▮

  let WORDS = null;
  function words() {
    if (!WORDS) {
      const raw = typeof atob === "function"
        ? atob(LIST_B64)
        : Buffer.from(LIST_B64, "base64").toString("utf8");
      WORDS = raw.split(",");
    }
    return WORDS;
  }

  /* ---------- normalization ----------
     Fold the usual evasions down to plain letters so "p*u*t@"
     and "sh1t" match the same entry as the bare word:
       accents → ascii, leetspeak → letters, runs of the same
       letter collapsed, everything else dropped. */
  const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i" };

  const COMBINING = /[\u0300-\u036f]/g;

  function normalize(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD").replace(COMBINING, "")   // strip accents
      .replace(/[01345789@$!|]/g, (c) => LEET[c] || "")   // leetspeak
      .replace(/[^a-z]/g, "")                             // drop punctuation/spacing
      .replace(/(.)\1{1,}/g, "$1");                       // "fuuuck" → "fuck"
  }

  /* A normalized token is objectionable if it
       (a) is a listed word exactly,
       (b) is a listed word plus a short suffix — plurals and
           inflections ("putas", "fucking"), or
       (c) contains a *long* listed word, for compounds.
     The length floor on (c) is what keeps innocent words safe:
     Spanish "recoger"/"escoger" contain a 5-letter entry, and
     "Scunthorpe" contains a 4-letter one, so substring matching
     only kicks in at 6+. Short entries must match (a) or (b). */
  const SUFFIX_SLACK = 3;
  const SUBSTRING_MIN = 6;

  function isBadToken(token) {
    if (!token) return false;
    for (const w of words()) {
      const n = normalize(w);
      if (!n) continue;
      if (token === n) return true;
      if (token.startsWith(n) && token.length - n.length <= SUFFIX_SLACK) return true;
      if (n.length >= SUBSTRING_MIN && token.includes(n)) return true;
    }
    return false;
  }

  /** filterText: string -> string  (objectionable words masked, rest intact) */
  function filterText(text) {
    return String(text == null ? "" : text).replace(/\S+/g, (chunk) => {
      // Keep leading/trailing punctuation, test only the word body.
      const m = chunk.match(/^(\W*)(.*?)(\W*)$/);
      const [, pre, body, post] = m;
      if (!body) return chunk;
      return isBadToken(normalize(body)) ? pre + MASK.repeat(body.length) + post : chunk;
    });
  }

  /** hasObjectionable: string -> boolean */
  function hasObjectionable(text) { return filterText(text) !== String(text == null ? "" : text); }

  /* ---------- storage helpers ---------- */

  function store() {
    try { return typeof localStorage !== "undefined" ? localStorage : null; }
    catch { return null; }   // Safari private mode throws on access
  }

  function readJSON(key, fallback) {
    const s = store();
    if (!s) return fallback;
    try { const v = JSON.parse(s.getItem(key)); return v == null ? fallback : v; }
    catch { return fallback; }
  }

  function writeJSON(key, value) {
    const s = store();
    if (!s) return;
    try { s.setItem(key, JSON.stringify(value)); } catch { /* quota — non-fatal */ }
  }

  const BLOCK_KEY = "monolito-blocked";
  const REPORT_KEY = "monolito-reports";
  const TERMS_KEY = "monolito-terms-accepted";

  /* Players are identified by display name — it's all a peer-to-peer
     table has. Names are matched normalized so a renamed-but-same
     "Juan " / "juan" doesn't slip past a block. */
  function nameKey(name) { return String(name == null ? "" : name).trim().toLowerCase(); }

  /** blocked: () -> string[]  (the display names, as blocked) */
  function blocked() {
    const list = readJSON(BLOCK_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function block(name) {
    const key = nameKey(name);
    if (!key) return blocked();
    const list = blocked();
    if (!list.some((n) => nameKey(n) === key)) list.push(String(name).trim());
    writeJSON(BLOCK_KEY, list);
    return list;
  }

  function unblock(name) {
    const key = nameKey(name);
    const list = blocked().filter((n) => nameKey(n) !== key);
    writeJSON(BLOCK_KEY, list);
    return list;
  }

  function isBlocked(name) {
    const key = nameKey(name);
    return !!key && blocked().some((n) => nameKey(n) === key);
  }

  function clearBlocks() { writeJSON(BLOCK_KEY, []); }

  /* ---------- reporting ----------
     There's no game server to post to — the whole app is static
     files and peer-to-peer WebRTC. So a report is kept on-device
     for the player to send on (the privacy page carries the
     support address) and, most importantly, blocks the reported
     player immediately: the abuse stops on the spot rather than
     waiting on a round trip. */
  function reports() {
    const list = readJSON(REPORT_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function report(name, text) {
    const list = reports();
    list.push({ name: String(name || ""), text: String(text || "").slice(0, 300), at: new Date().toISOString() });
    while (list.length > 50) list.shift();
    writeJSON(REPORT_KEY, list);
    block(name);
    return list;
  }

  /** The report body a player can mail to support, prefilled. */
  function reportMailto(address, name, text) {
    const subject = "Monolito · reported chat message";
    const body =
      "Reported player: " + String(name || "") + "\n" +
      "Message: " + String(text || "") + "\n" +
      "When: " + new Date().toISOString() + "\n\n" +
      "(Sent from the Monolito table-talk chat.)";
    return "mailto:" + address +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  }

  /* ---------- the one-time content agreement ---------- */
  function termsAccepted() { return readJSON(TERMS_KEY, false) === true; }
  function acceptTerms() { writeJSON(TERMS_KEY, true); }

  return {
    filterText, hasObjectionable, normalize,
    blocked, block, unblock, isBlocked, clearBlocks,
    report, reports, reportMailto,
    termsAccepted, acceptTerms,
    MASK,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Moderation;
