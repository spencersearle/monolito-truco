/* ============================================================
   MONOLITO · nativeback.js
   Capacitor's App plugin: the Android hardware/gesture BACK
   button, and URLs handed to the app from outside it.

   Android sends every back press to the app; if nothing claims
   it the shell walks the WebView's history or closes the app
   outright — which, mid-hand, reads as a crash. Registering a
   listener here takes that default away, so ui.js can decide
   what "back" means at each moment (close the top panel, leave
   the table, quit).

   iOS has no back button and a browser has its own, so this is
   a no-op everywhere but the Android shell. Same build runs in
   all three without branching anywhere else.
   ============================================================ */

(() => {
  /* The Capacitor bridge only exists inside the native shell, and only
     after it boots — so resolve it per call rather than caching a miss. */
  function plugin() {
    const cap = window.Capacitor;
    return (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins)
      ? cap.Plugins.App
      : null;
  }

  const p = plugin();
  const active = !!(p && p.addListener);

  window.NativeBack = {
    /** true only inside the Android shell, where back presses reach us */
    active: () => active,

    /** hand each back press to `fn`; `fn` decides and returns nothing */
    onBack(fn) {
      if (!active) return;
      try {
        p.addListener("backButton", () => {
          try { fn(); } catch (e) { /* never let a handler wedge the button */ }
        });
      } catch (e) { /* no App plugin on this build */ }
    },

    /** Hand `fn` every URL the shell is asked to open — a monolito:// invite
        tapped in a browser. Covers the cold start too: if the app was launched
        by the URL, the event may already have fired before ui.js got here, so
        the launch URL is replayed once. */
    onAppUrl(fn) {
      const p = plugin();
      if (!p) return;
      try {
        p.addListener("appUrlOpen", (e) => {
          try { if (e && e.url) fn(e.url); } catch (err) { /* never wedge the shell */ }
        });
      } catch (e) { /* no App plugin on this build */ }
      try {
        if (p.getLaunchUrl) {
          Promise.resolve(p.getLaunchUrl())
            .then((r) => { if (r && r.url) fn(r.url); })
            .catch(() => {});
        }
      } catch (e) { /* nothing launched us */ }
    },

    /** close the app — the honest end of the back stack on Android */
    exit() {
      const cur = plugin();
      if (cur && cur.exitApp) {
        try { const r = cur.exitApp(); if (r && r.catch) r.catch(() => {}); }
        catch (e) { /* nothing sensible left to do */ }
      }
    },
  };
})();
