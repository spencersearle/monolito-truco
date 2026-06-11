/* ============================================================
   MONOLITO · net.js
   PeerJS transport for 1v1 online play. The host's browser and
   the guest's browser each run a full engine in lockstep: the
   host deals (and broadcasts the hands), every action is applied
   locally then replicated to the other side. This file only
   moves messages — game logic stays in engine.js / ui.js.
   ============================================================ */

const Net = (() => {
  const PREFIX = "monolito-truco-";
  const CONNECT_TIMEOUT = 15000;

  let peer = null;
  let conn = null;
  let timeoutId = null;

  function available() {
    return typeof Peer !== "undefined";
  }

  function randomCode() {
    let code = "";
    const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function wire(c, cb) {
    conn = c;
    c.on("open", () => {
      clearTimeout(timeoutId);
      cb.onConnect();
    });
    c.on("data", (d) => cb.onMessage(d));
    c.on("close", () => cb.onClose());
    c.on("error", (e) => cb.onError(e));
  }

  /* create a table: get an id from the broker, wait for one guest */
  function host(cb) {
    const code = randomCode();
    peer = new Peer(PREFIX + code);
    timeoutId = setTimeout(() => cb.onError({ type: "broker-timeout" }), CONNECT_TIMEOUT);
    peer.on("open", () => {
      clearTimeout(timeoutId);
      cb.onReady(code);
    });
    peer.on("connection", (c) => {
      if (conn) { c.close(); return; } // table is full
      wire(c, cb);
    });
    peer.on("error", (e) => cb.onError(e));
    peer.on("disconnected", () => peer && !conn && peer.reconnect());
  }

  /* join a table by code */
  function join(code, cb) {
    peer = new Peer();
    timeoutId = setTimeout(() => cb.onError({ type: "broker-timeout" }), CONNECT_TIMEOUT);
    peer.on("open", () => {
      clearTimeout(timeoutId);
      wire(peer.connect(PREFIX + code, { reliable: true }), cb);
      timeoutId = setTimeout(() => {
        if (!connected()) cb.onError({ type: "timeout" });
      }, CONNECT_TIMEOUT);
    });
    peer.on("error", (e) => cb.onError(e));
  }

  function send(msg) {
    if (conn && conn.open) conn.send(msg);
  }

  function connected() {
    return !!(conn && conn.open);
  }

  function destroy() {
    clearTimeout(timeoutId);
    try { if (conn) conn.close(); } catch (e) { /* already gone */ }
    try { if (peer) peer.destroy(); } catch (e) { /* already gone */ }
    conn = null;
    peer = null;
  }

  return { available, host, join, send, connected, destroy };
})();
