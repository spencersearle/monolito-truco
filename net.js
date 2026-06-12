/* ============================================================
   MONOLITO · net.js
   PeerJS transport for online play. 1v1 uses a single host↔guest
   connection; 2v2 uses a star: the host holds up to three guest
   connections and relays/orders everything (room mode). Both
   modes are lockstep — every browser runs a full engine, the
   host deals and broadcasts, actions are replicated. This file
   only moves messages — game logic stays in the engines / ui.js.
   ============================================================ */

const Net = (() => {
  const PREFIX = "monolito-truco-";
  const CONNECT_TIMEOUT = 15000;
  const ROOM_CAPACITY = 3;       // guests; host makes 4

  let peer = null;
  let conn = null;
  let timeoutId = null;
  let room = null;               // host 2v2: Map connId -> conn
  let nextConnId = 1;

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

  /* ---------- 2v2 room: host holds up to 3 guest connections ---------- */

  function hostRoom(cb) {
    const code = randomCode();
    room = new Map();
    nextConnId = 1;
    peer = new Peer(PREFIX + code);
    timeoutId = setTimeout(() => cb.onError({ type: "broker-timeout" }), CONNECT_TIMEOUT);
    peer.on("open", () => {
      clearTimeout(timeoutId);
      cb.onReady(code);
    });
    peer.on("connection", (c) => {
      if (!room || room.size >= ROOM_CAPACITY) {
        c.on("open", () => { c.send({ t: "full" }); setTimeout(() => c.close(), 400); });
        return;
      }
      const id = nextConnId++;
      room.set(id, c);
      c.on("open", () => cb.onPeerJoin(id));
      c.on("data", (d) => cb.onPeerMessage(id, d));
      c.on("close", () => { if (room && room.delete(id)) cb.onPeerLeave(id); });
      c.on("error", () => { if (room && room.delete(id)) cb.onPeerLeave(id); });
    });
    peer.on("error", (e) => cb.onError(e));
    peer.on("disconnected", () => peer && peer.reconnect());
  }

  function sendToPeer(id, msg) {
    const c = room && room.get(id);
    if (c && c.open) c.send(msg);
  }

  function broadcast(msg, exceptId = null) {
    if (!room) return;
    for (const [id, c] of room) {
      if (id !== exceptId && c.open) c.send(msg);
    }
  }

  function closePeer(id) {
    const c = room && room.get(id);
    if (!c) return;
    room.delete(id);
    try { c.close(); } catch (e) { /* already gone */ }
  }

  function roomSize() {
    return room ? room.size : 0;
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
    if (room) for (const c of room.values()) { try { c.close(); } catch (e) { /* already gone */ } }
    try { if (peer) peer.destroy(); } catch (e) { /* already gone */ }
    conn = null;
    peer = null;
    room = null;
  }

  return {
    available, host, join, send, connected, destroy,
    hostRoom, sendToPeer, broadcast, closePeer, roomSize,
  };
})();
