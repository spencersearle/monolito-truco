/* ============================================================
   MONOLITO · peerserver
   The signalling broker two players use to find each other.

   It is deliberately small, because it does very little. When
   someone opens a table their browser holds one WebSocket here
   and announces a six-letter id; when a friend types that code
   their browser asks this server to pass along an SDP offer and
   a handful of ICE candidates. That is the entire job. The
   moment the two are connected the cards, the chat and every
   call travel directly between the phones and never touch this
   process again.

   So the load per player is a few kilobytes at the start of a
   game and then an idle socket. What this server spends is
   memory per open connection, not bandwidth or CPU.
   ============================================================ */

import express from 'express';
import { ExpressPeerServer } from 'peer';

const PORT = Number(process.env.PORT || 9000);

/* Above this many simultaneous sockets the server turns new ones away rather
   than falling over — a table that can't be created is recoverable, a broker
   that OOMs takes every game down at once. Raise it with the machine. */
const CONCURRENT_LIMIT = Number(process.env.PEER_CONCURRENT_LIMIT || 20000);

/* A client that stops answering is dropped after this. PeerJS clients ping on
   their own; the window is generous so a phone that locks its screen mid-hand
   isn't kicked out of a game it could still rejoin. */
const ALIVE_TIMEOUT = Number(process.env.PEER_ALIVE_TIMEOUT || 60000);

let live = 0;                    // sockets currently held open

const app = express();
app.disable('x-powered-by');

/* Fly, Render and friends want a cheap endpoint that proves the process is
   answering. Also handy for a status page. */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    clients: live,
    uptime: Math.round(process.uptime()),
  });
});

const server = app.listen(PORT, () => {
  console.log(`monolito peerserver listening on ${PORT}`);
});

const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: false,        // nobody needs to enumerate the open tables
  concurrent_limit: CONCURRENT_LIMIT,
  alive_timeout: ALIVE_TIMEOUT,
});

peerServer.on('connection', (client) => {
  live += 1;
  console.log(`+ ${client.getId()} (${live} live)`);
});

peerServer.on('disconnect', (client) => {
  live = Math.max(0, live - 1);
  console.log(`- ${client.getId()} (${live} live)`);
});

app.use('/', peerServer);

/* Let the platform restart us cleanly instead of killing sockets mid-handshake. */
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} — closing`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
