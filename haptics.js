/* ============================================================
   MONOLITO · haptics.js
   Native touch feedback: the Taptic Engine on iOS and the
   vibrator on Android, through Capacitor's Haptics plugin.

   Falls back to navigator.vibrate() in a plain browser and to a
   no-op where neither exists, so the same build runs as a PWA,
   a native app, or a desktop page without branching anywhere
   else in the code. Off is remembered, like the sound setting.
   ============================================================ */

(() => {
  let off = localStorage.getItem("monolito-haptics") === "0";

  /* The Capacitor bridge only exists inside the native shell, and only
     after it boots — so resolve it per call rather than caching a miss. */
  function plugin() {
    const cap = window.Capacitor;
    return (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins)
      ? cap.Plugins.Haptics
      : null;
  }

  function canVibrate() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  }

  /* Feedback is a garnish — a rejected promise or a missing API must
     never surface. Every entry point funnels through here. */
  function safe(fn) {
    try { const r = fn(); if (r && typeof r.catch === "function") r.catch(() => {}); }
    catch (e) { /* no haptics on this device */ }
  }

  /* name -> { style for native, milliseconds for the web fallback } */
  const IMPACTS = {
    light:  { style: "LIGHT",  ms: 10 },
    medium: { style: "MEDIUM", ms: 20 },
    heavy:  { style: "HEAVY",  ms: 35 },
  };

  function impact(kind = "light") {
    if (off) return;
    const spec = IMPACTS[kind] || IMPACTS.light;
    const p = plugin();
    if (p && p.impact) safe(() => p.impact({ style: spec.style }));
    else if (canVibrate()) safe(() => navigator.vibrate(spec.ms));
  }

  /* success / warning / error — the notification family, which iOS
     renders as a distinct double-tap pattern. */
  function notify(type = "SUCCESS") {
    if (off) return;
    const p = plugin();
    if (p && p.notification) safe(() => p.notification({ type }));
    else if (canVibrate()) safe(() => navigator.vibrate(type === "ERROR" ? [30, 60, 30] : [15, 50, 15]));
  }

  window.Haptics = {
    off: () => off,
    toggle() {
      off = !off;
      localStorage.setItem("monolito-haptics", off ? "0" : "1");
      if (!off) impact("light");   // confirm the setting by feel
      return off;
    },
    /** a card leaving the hand, a button committing */
    tap: () => impact("light"),
    /** calling truco / envido — something with weight behind it */
    call: () => impact("medium"),
    /** taking a trick */
    trick: () => impact("light"),
    /** the hand or game resolving your way, or not */
    win: () => notify("SUCCESS"),
    lose: () => notify("ERROR"),
    impact,
    notify,
  };
})();
