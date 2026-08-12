/* ============================================================
   MONOLITO · turn-credentials worker
   Hands the game a short-lived TURN credential without ever
   letting the API token that mints it leave Cloudflare.

   Monolito is a static site. Anything baked into it can be read
   by anyone who opens View Source, so the Realtime API token
   cannot live there. This Worker holds it, and the app asks
   this Worker instead:

     app  ──"a credential please"──►  worker  (holds the token)
     app  ◄──username + password───┘  ──────►  Cloudflare API

   The credential it hands back expires on its own, so a copy
   scraped out of the app is worthless within hours.

   One mint is shared by everyone who asks during the cache
   window. Cloudflare asks providers to keep credential
   utilisation above 50%, and a game that lasts twenty minutes
   does not need its own two-hour credential.
   ============================================================ */

const API = 'https://rtc.live.cloudflare.com/v1/turn/keys';

/* How long a minted credential stays valid. Cloudflare's ceiling is 48h.
   Two hours comfortably outlives a game of Truco and keeps utilisation high. */
const CREDENTIAL_TTL = 7200;

/* How long the edge reuses one mint before asking for another. Kept well
   inside CREDENTIAL_TTL so nobody is ever handed a credential about to die. */
const CACHE_SECONDS = 1800;

/* Who may ask. The native shells are their own origins: iOS WKWebView reports
   capacitor://localhost and Android reports http://localhost, so leaving those
   out silently breaks TURN in exactly the app that needs it most. */
const ALLOWED_ORIGINS = new Set([
  'https://spencersearle.github.io',
  'capacitor://localhost',
  'http://localhost',
  'ionic://localhost',
  'http://localhost:8123',        // the local test server
]);

function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://spencersearle.github.io',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...extra },
  });
}

/* Ask Cloudflare for a credential. Returns an iceServers array, or null if
   anything at all went wrong — the app falls back to STUN on null, which is
   worse than TURN and much better than no game. */
async function mint(env) {
  const res = await fetch(`${API}/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl: CREDENTIAL_TTL }),
  });

  if (!res.ok) return null;

  const body = await res.json().catch(() => null);
  const servers = body && body.iceServers;
  if (!servers) return null;

  // Cloudflare has returned both a bare object and an array over time
  const list = Array.isArray(servers) ? servers : [servers];
  return list.length ? list : null;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, origin);
    }
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
      return json({ error: 'worker is missing TURN_KEY_ID / TURN_KEY_API_TOKEN' }, 500, origin);
    }

    /* One mint serves everyone who asks inside the window. The cache key is
       deliberately origin-free so every player shares the same entry. */
    const cache = caches.default;
    const cacheKey = new Request(new URL('/turn', request.url).toString(), { method: 'GET' });

    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.json();
      return json(body, 200, origin, { 'X-Cache': 'hit' });
    }

    let iceServers = null;
    try {
      iceServers = await mint(env);
    } catch (e) {
      iceServers = null;
    }

    if (!iceServers) {
      // Don't cache a failure; the next player should get a fresh attempt.
      return json({ error: 'could not mint credentials', iceServers: [] }, 502, origin);
    }

    const body = { iceServers };
    const cacheable = new Response(JSON.stringify(body), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheable));

    return json(body, 200, origin, { 'X-Cache': 'miss' });
  },
};
