/* Tests for the TURN credentials Worker, with Cloudflare stubbed out so this
   runs anywhere with no account and no network. What matters here is the
   contract the game depends on: an iceServers array, CORS that the native
   shells are actually allowed through, and a failure that degrades to STUN
   instead of taking online play down with it. */

import assert from 'node:assert';
import worker from './src/index.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

const ENV = { TURN_KEY_ID: 'key-id', TURN_KEY_API_TOKEN: 'secret-token' };

const CF_REPLY = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp',
             'turns:turn.cloudflare.com:5349?transport=tcp'],
      username: 'u',
      credential: 'p',
    },
  ],
};

/* A cache that never hits, so each test exercises the mint path. */
function stubCaches() {
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
}

const ctx = { waitUntil: () => {} };

function stubFetch(handler) {
  globalThis.fetch = handler;
}

function get(origin = 'capacitor://localhost') {
  return new Request('https://monolito-turn.workers.dev/turn', {
    method: 'GET',
    headers: origin ? { Origin: origin } : {},
  });
}

console.log('\nTURN credentials worker\n');
stubCaches();

await asyncTest('returns the iceServers the game expects', async () => {
  let seen = null;
  stubFetch(async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify(CF_REPLY), { status: 201 });
  });

  const res = await worker.fetch(get(), ENV, ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.iceServers), 'iceServers must be an array');
  const turn = body.iceServers.flatMap((s) => s.urls).filter((u) => u.startsWith('turn'));
  assert.ok(turn.length >= 1, 'a reply with no turn: url is useless');

  assert.match(seen.url, /\/v1\/turn\/keys\/key-id\/credentials\/generate-ice-servers$/);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer secret-token');
  assert.ok(JSON.parse(seen.init.body).ttl > 0, 'a credential with no ttl never expires');
});

await asyncTest('the secret never reaches the client', async () => {
  stubFetch(async () => new Response(JSON.stringify(CF_REPLY), { status: 201 }));
  const res = await worker.fetch(get(), ENV, ctx);
  const text = await res.text();
  assert.ok(!text.includes('secret-token'), 'the API token leaked into the response');
  assert.ok(!text.includes('key-id'), 'the key id leaked into the response');
});

await asyncTest('the iOS shell origin is allowed through CORS', async () => {
  stubFetch(async () => new Response(JSON.stringify(CF_REPLY), { status: 201 }));
  const res = await worker.fetch(get('capacitor://localhost'), ENV, ctx);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'capacitor://localhost');
});

await asyncTest('the Android shell origin is allowed through CORS', async () => {
  stubFetch(async () => new Response(JSON.stringify(CF_REPLY), { status: 201 }));
  const res = await worker.fetch(get('http://localhost'), ENV, ctx);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost');
});

await asyncTest('an unknown origin is not echoed back', async () => {
  stubFetch(async () => new Response(JSON.stringify(CF_REPLY), { status: 201 }));
  const res = await worker.fetch(get('https://evil.example'), ENV, ctx);
  assert.notEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://evil.example');
});

await asyncTest('preflight is answered', async () => {
  const req = new Request('https://monolito-turn.workers.dev/turn', {
    method: 'OPTIONS',
    headers: { Origin: 'capacitor://localhost' },
  });
  const res = await worker.fetch(req, ENV, ctx);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'capacitor://localhost');
});

await asyncTest('a Cloudflare outage degrades instead of exploding', async () => {
  stubFetch(async () => new Response('upstream on fire', { status: 500 }));
  const res = await worker.fetch(get(), ENV, ctx);
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.deepEqual(body.iceServers, [], 'the client reads iceServers and must find an array');
});

await asyncTest('a thrown fetch degrades too', async () => {
  stubFetch(async () => { throw new Error('DNS is having a day'); });
  const res = await worker.fetch(get(), ENV, ctx);
  assert.equal(res.status, 502);
});

await asyncTest('a misconfigured worker says so plainly', async () => {
  stubFetch(async () => new Response(JSON.stringify(CF_REPLY), { status: 201 }));
  const res = await worker.fetch(get(), {}, ctx);
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /TURN_KEY_ID/);
});

await asyncTest('a single object from Cloudflare is normalised to an array', async () => {
  stubFetch(async () => new Response(
    JSON.stringify({ iceServers: { urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'p' } }),
    { status: 201 }));
  const res = await worker.fetch(get(), ENV, ctx);
  const body = await res.json();
  assert.ok(Array.isArray(body.iceServers));
  assert.equal(body.iceServers.length, 1);
});

await asyncTest('a POST is refused', async () => {
  const req = new Request('https://monolito-turn.workers.dev/turn', { method: 'POST' });
  assert.equal((await worker.fetch(req, ENV, ctx)).status, 405);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
