# TURN credentials Worker

Monolito connects players directly, phone to phone. That works on most home
networks and fails on some others, most often when both players are on mobile
data: carrier-grade NAT hands each phone an address that only works for talking
to the server that reported it, so the two sides can see each other's addresses
and still never reach each other. No amount of retrying fixes it. There is no
path.

TURN is the fix. It's a relay both phones can reach outbound, which always
works, and it carries the game between them when a direct link can't be made.

Cloudflare Realtime gives **1,000 GB of TURN free per month**, and only egress
counts. A measured full game of Truco to 30 points relays about **60 KB**. Even
assuming a slow thirty-minute game and pessimistically counting every game as
relayed, that free tier is somewhere north of five million games a month. You
will not reach it.

## Why a Worker exists at all

Cloudflare issues short-lived TURN credentials, and minting one means calling
their API with your account token. Monolito is a static site: anything in it
can be read by anyone who opens View Source. So the token can't live there.

This Worker holds the token and hands the app a temporary credential instead.

```
app  ──"a credential please"──►  worker  (holds the token)
                                    │
                                    ▼  Cloudflare Realtime API
app  ◄────username + password───────┘
app  ──authenticates with it──►  TURN relay
```

One mint is cached and shared for 30 minutes, so a busy evening costs a handful
of API calls rather than one per player. Credentials last 2 hours, comfortably
longer than a game and well inside Cloudflare's 48-hour ceiling.

## Deploying it

You need a Cloudflare account. The free plan covers all of this.

**1. Make a TURN key.** Cloudflare dashboard → Realtime → TURN Keys → *Create*.
Copy the **Key ID** and the **API Token**. The token is shown once.

**2. Deploy the Worker.**

```sh
cd worker
npx wrangler login
npx wrangler deploy
```

It prints a URL like `https://monolito-turn.<your-subdomain>.workers.dev`.

**3. Give it the secrets.** These are stored by Cloudflare, never in the repo:

```sh
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
```

**4. Point the game at it.** In `netconfig.js` at the repo root:

```js
const TURN_CREDENTIALS_URL = "https://monolito-turn.<your-subdomain>.workers.dev/turn";
```

Then rebuild and ship: `npm run build:web`, push to `main` for the web, and a
new native build for the app.

## Checking it worked

```sh
curl https://monolito-turn.<your-subdomain>.workers.dev/turn
```

You should get JSON with a `turn:` URL and a username and credential. Run it
twice; the second should come back with `X-Cache: hit`.

In the app, open a table and check the browser console for a peer connection
whose ICE servers include `turn:turn.cloudflare.com`. Usage shows up in the
Cloudflare dashboard under Realtime.

## If it breaks

Nothing breaks. Every failure path degrades to STUN, which is exactly where the
game is today: `netconfig.js` gives the fetch 4 seconds, falls back to the STUN
list on any error, and the Worker returns an empty `iceServers` array rather
than an error the client can choke on. A dead Worker costs some players a
connection, the same ones who can't connect right now. It cannot take online
play down.

## Allowed origins

The Worker only answers requests from Monolito's own origins, listed in
`src/index.js`. The native shells count as their own origins and are easy to
forget: iOS WKWebView reports `capacitor://localhost` and Android reports
`http://localhost`. Leaving those out breaks TURN in exactly the app that needs
it most, so there is a test for each.

## Tests

`node test_worker.mjs`, or just `npm test` from the repo root. Cloudflare is
stubbed, so it runs with no account and no network.
