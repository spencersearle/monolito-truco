/* ============================================================
   MONOLITO · share.js
   Handing an invite to a friend, through whatever the current
   shell can actually offer.

   The web has navigator.share. WKWebView does not — inside the
   iOS app that property is simply absent, so the SHARE button
   used to hide itself and app users were left with a COPY LINK
   they couldn't do much with. Capacitor's Share plugin fills
   that gap on both native platforms.

   Reached through window.Capacitor.Plugins, the same bridge
   nativeback.js uses: this app has no bundler, every script is
   a plain tag, and the npm package exists only so `cap sync`
   copies the native half into the iOS/Android projects.

   Nothing here throws and nothing here is required — share()
   answers false when it couldn't hand anything off, and the
   caller falls back to copying.
   ============================================================ */

(() => {
  /* The bridge only exists inside the native shell, and only after it
     boots — so resolve it per call rather than caching a miss. */
  function plugin() {
    const cap = window.Capacitor;
    return (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins)
      ? cap.Plugins.Share
      : null;
  }

  function webShare() {
    return typeof navigator !== "undefined" && typeof navigator.share === "function"
      ? navigator.share.bind(navigator)
      : null;
  }

  window.NativeShare = {
    /** true when something on this device can open a share sheet */
    available() {
      return !!(plugin() || webShare());
    },

    /** true only inside the native shell, where the Capacitor plugin answers */
    native() {
      return !!plugin();
    },

    /** Hand {title, text, url} to the platform. Resolves false if that
        wasn't possible — including when the user dismissed the sheet, since
        a silent no-op and a cancel look the same to us and copying the link
        instead is never the wrong answer. */
    async share(payload) {
      const p = plugin();
      if (p && p.share) {
        try {
          await p.share({
            title: payload.title,
            text: payload.text,
            url: payload.url,
            dialogTitle: payload.title,   // Android chooser heading
          });
          return true;
        } catch (e) { return false; }
      }

      const web = webShare();
      if (web) {
        try { await web(payload); return true; }
        catch (e) { return false; }
      }

      return false;
    },
  };
})();
