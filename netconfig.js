/* ============================================================
   MONOLITO · netconfig.js
   The two pieces of infrastructure online play depends on, in
   one place so they can be changed without touching net.js.

   1. THE BROKER (signalling). Two players find each other
      through it; once they're connected the game itself never
      touches it again — cards go peer to peer. Left null, we
      use PeerJS's free public broker, which is fine until it
      isn't: it has no SLA, and if it goes down every table
      goes down with it.

   2. ICE SERVERS (getting the connection through). STUN alone
      tells each side its public address, which is enough on
      most home networks. It is NOT enough behind symmetric
      NAT — carrier-grade NAT on mobile networks being the
      common case — where the two sides can see each other's
      addresses and still fail to reach them. That needs TURN,
      a relay both sides can reach. Without one, some pairs of
      players simply never connect, and it looks like the app
      is broken rather than the network.

   TURN credentials come in two shapes and both are supported:
   paste static ones into TURN_SERVERS, or point
   TURN_CREDENTIALS_URL at an endpoint that mints short-lived
   ones (what Cloudflare Realtime wants, so the API token
   never ships inside the app). If that fetch fails we fall
   back to STUN — a game that might not connect beats no game.
   ============================================================ */

const NetConfig = (() => {
  /* ---------- 1. broker ---------- */

  /* null = PeerJS's public cloud broker.
     Self-hosted looks like:
       { host: "peer.example.com", port: 443, secure: true, path: "/" }   */
  const BROKER = null;

  /* ---------- 2. ice ---------- */

  /* Public STUN. Costs nothing, carries no traffic, and covers the
     majority of connections on its own. More than one so a single
     provider having a bad day isn't a total outage. */
  const STUN_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];

  /* Static TURN credentials, if your provider issues them (Open Relay,
     coturn with a long-lived user). Example:
       { urls: "turn:host:3478", username: "u", credential: "p" }        */
  const TURN_SERVERS = [];

  /* Or an endpoint returning { iceServers: [...] } with short-lived
     credentials. Preferred for Cloudflare Realtime, whose API token must
     not ship in a static app — put a tiny Worker in front of it. */
  const TURN_CREDENTIALS_URL = null;

  const FETCH_TIMEOUT = 4000;

  let cached = null;

  async function fetchMinted() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(TURN_CREDENTIALS_URL, { signal: ctl.signal });
      if (!res.ok) return [];
      const body = await res.json();
      return Array.isArray(body && body.iceServers) ? body.iceServers : [];
    } catch (e) {
      return [];                    // offline, slow, or misconfigured — carry on
    } finally {
      clearTimeout(timer);
    }
  }

  /* Resolve the ICE list once per session. Never rejects. */
  async function ice() {
    if (cached) return cached;
    const minted = TURN_CREDENTIALS_URL ? await fetchMinted() : [];
    cached = [...STUN_SERVERS, ...TURN_SERVERS, ...minted];
    return cached;
  }

  /* Whether a relay is available at all. When this is false, a pair of
     players behind strict NAT has no way through, and the failure is
     worth naming honestly instead of blaming their wifi. */
  function hasRelay() {
    const list = cached || [...STUN_SERVERS, ...TURN_SERVERS];
    return list.some((s) => {
      const urls = [].concat(s.urls || s.url || []);
      return urls.some((u) => String(u).startsWith("turn:") || String(u).startsWith("turns:"));
    });
  }

  function broker() {
    return BROKER;
  }

  return { ice, hasRelay, broker };
})();
