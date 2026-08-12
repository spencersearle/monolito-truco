# Monolito signalling broker

Online play currently runs on PeerJS's free public broker. It works, it costs
nothing, and it has no SLA — if it goes down or starts throttling, every
Monolito table in the App Store goes down at the same time and there is nothing
you can do that day. This directory is the replacement, for when that matters.

## What it actually does

Very little, and that is the point.

When someone opens a table, their phone holds one WebSocket here and claims a
six-letter id. When a friend types that code, their phone asks this server to
pass along an SDP offer and a handful of ICE candidates. That is the whole job.
The instant the two phones are connected, **the cards, the chat, the envido and
every other message travel directly between them and never touch this server
again**.

So a game costs this server a few kilobytes at the start and then an idle
socket. It is a matchmaker, not a game server.

## Capacity

The resource that runs out is **memory per open socket**, not bandwidth or CPU.

| Concurrent players | Rough memory | Machine |
|---|---|---|
| ~1,000 | ~40 MB | 256 MB, the config here |
| ~5,000 | ~150 MB | 256 MB |
| ~20,000 | ~600 MB | 1 GB |
| ~50,000 | ~1.5 GB | 2 GB, raise the file-descriptor limit |

Those are players *connected at once*, not players per day. A game that peaks
at a few hundred simultaneous tables fits comfortably on the smallest machine
Fly rents.

Two things to know before you grow:

- **Scale up, not out.** Peer ids live in this process's memory, so two
  instances behind a load balancer cannot see each other's tables — a host on
  instance A is invisible to a guest who lands on instance B. Give one machine
  more memory rather than running two. Past a single machine you need sticky
  routing by peer id or a shared store, which is real work; you are unlikely to
  get there.
- **Raise the file-descriptor limit** before ~10,000 sockets. The usual default
  is 1,024 and you will hit it long before you run out of memory. The container
  here runs as `node` on Alpine, where Fly's default is already high enough for
  the sizes above.

## Deploying it

Fly is the cheapest sensible option for a long-lived WebSocket process; Render,
Railway or any box that speaks Docker work the same way.

```sh
cd peerserver
fly launch --no-deploy      # accept the existing fly.toml, pick your app name
fly deploy
fly logs                    # you should see "monolito peerserver listening on 9000"
curl https://<your-app>.fly.dev/health
```

Then point the game at it, in `netconfig.js` at the repo root:

```js
const BROKER = { host: "<your-app>.fly.dev", port: 443, secure: true, path: "/" };
```

Rebuild and redeploy the web app (`npm run build:web`, push to `main`) and ship
a new native build. **Old app versions keep using the public broker**, so both
will be live for a while — that is fine, they are separate pools of players, but
someone on the old build cannot join a table hosted on the new one. Worth
letting the App Store version roll out before you retire anything.

## The other half: TURN

This server gets two players *introduced*. It does not get their data through a
hostile network. That is TURN, and it is the more common cause of "we can't
connect" — STUN alone cannot cross the carrier-grade NAT that mobile networks
use, so some pairs of players simply never link up.

Also configured in `netconfig.js`:

- **Cloudflare Realtime TURN** — 1,000 GB free per month, then $0.05/GB.
  Credentials are short-lived and must be minted with an API token, which must
  not ship inside the app, so put a small Cloudflare Worker in front of it and
  set `TURN_CREDENTIALS_URL` to the Worker.
- **Open Relay (Metered)** — static credentials you can paste straight into
  `TURN_SERVERS`, free up to 20 GB/month. The fastest thing to try.
- **coturn on your own box** — cheapest at high volume, and one more thing to
  keep alive.

Relayed audio-free game traffic is tiny; Monolito sends short JSON messages, not
video. A thousand games would not come close to the Cloudflare free tier.
