/* ============================================================
   MONOLITO · net.js
   PeerJS transport for online play. 1v1 uses a single host↔guest
   connection; 2v2 uses a star: the host holds up to three guest
   connections and relays/orders everything (room mode). Both
   modes are lockstep — every browser runs a full engine, the
   host deals and broadcasts, actions are replicated. This file
   only moves messages — game logic stays in the engines / ui.js.

   Where it connects (broker) and how it gets through a network
   (STUN/TURN) both live in netconfig.js.
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
    return typeof Peer !== "undefined" && typeof NetConfig !== "undefined";
  }

  /* Build the options every Peer is created with: the broker to talk to and
     the ICE servers to try. Resolving ICE can involve a network call for
     short-lived TURN credentials, so everything that makes a Peer awaits it. */
  async function peerOptions() {
    const opts = { config: { iceServers: await NetConfig.ice() } };
    const broker = NetConfig.broker();
    return broker ? Object.assign(opts, broker) : opts;
  }

  /* Watch the underlying RTCPeerConnection so a network that ICE can't cross
     reports itself as exactly that. Otherwise it surfaces as a generic
     timeout, which reads to the player as "the app is broken" when the real
     answer is "this pair of networks needs a TURN relay". */
  function watchIce(c, cb, tries = 0) {
    if (!c) return;
    const pc = c.peerConnection;
    if (!pc) {
      // PeerJS builds the RTCPeerConnection during negotiation, which for an
      // incoming connection is a tick or two after we get the object
      if (tries < 20) setTimeout(() => watchIce(c, cb, tries + 1), 100);
      return;
    }
    pc.addEventListener("iceconnectionstatechange", () => {
      if (pc.iceConnectionState !== "failed") return;
      if (c._replaced) return;
      clearTimeout(timeoutId);
      cb.onError({ type: "ice-failed", relay: NetConfig.hasRelay() });
    });
  }

  function randomCode() {
    let code = "";
    const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function wire(c, cb) {
    conn = c;
    watchIce(c, cb);
    c.on("open", () => {
      clearTimeout(timeoutId);
      cb.onConnect();
    });
    c.on("data", (d) => cb.onMessage(d));
    // a connection that was swapped out by a reconnection stays silent
    c.on("close", () => { if (c._replaced) return; if (conn === c) conn = null; cb.onClose(); });
    c.on("error", (e) => { if (c._replaced) return; cb.onError(e); });
  }

  /* create a table: get an id from the broker, accept a guest. A later
     connection (a rival who dropped and rejoined with the same code) replaces
     the previous link so play resumes seamlessly — newest valid link wins. */
  async function host(cb) {
    const code = randomCode();
    peer = new Peer(PREFIX + code, await peerOptions());
    timeoutId = setTimeout(() => cb.onError({ type: "broker-timeout" }), CONNECT_TIMEOUT);
    peer.on("open", () => {
      clearTimeout(timeoutId);
      cb.onReady(code);
    });
    peer.on("connection", (c) => {
      if (conn) { conn._replaced = true; try { conn.close(); } catch (e) { /* gone */ } conn = null; }
      wire(c, cb);
    });
    peer.on("error", (e) => cb.onError(e));
    peer.on("disconnected", () => peer && peer.reconnect());
  }

  /* join a table by code */
  async function join(code, cb) {
    peer = new Peer(await peerOptions());
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

  async function hostRoom(cb) {
    const code = randomCode();
    room = new Map();
    nextConnId = 1;
    peer = new Peer(PREFIX + code, await peerOptions());
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
      watchIce(c, { onError: (e) => cb.onError(e) });
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
