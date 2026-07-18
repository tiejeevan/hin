/**
 * Local realtime smoke tests against wrangler (http://127.0.0.1:8787).
 * Run: node --input-type=module apps/api/scripts/realtime-smoke.mjs
 */
import { WebSocket } from 'undici';

const API = process.env.SMOKE_API_URL || 'http://127.0.0.1:8787';
const WS_URL = process.env.SMOKE_WS_URL || 'ws://127.0.0.1:8787/ws';
const PASSWORD = 'SmokePass123!';

const results = [];

function ok(name, detail = '') {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

function assert(name, cond, detail = '') {
  if (cond) ok(name, detail);
  else fail(name, detail || 'assertion failed');
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function uniqueUser(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function register(username) {
  const { status, json } = await api('/api/auth/register', {
    method: 'POST',
    body: { username, password: PASSWORD },
  });
  if (status !== 200 || !json?.token) {
    throw new Error(`register ${username} failed: ${status} ${JSON.stringify(json)}`);
  }
  return { token: json.token, user: json.user };
}

class Client {
  constructor(label, token, userId) {
    this.label = label;
    this.token = token;
    this.userId = userId;
    this.events = [];
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(WS_URL);
    this.events = [];
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.label} connect timeout`)), 8000);
      this.ws.addEventListener('open', () => {
        this.ws.send(JSON.stringify({ type: 'join', payload: { token: this.token } }));
      });
      this.ws.addEventListener('message', (e) => {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
        this.events.push(msg);
        if (msg.type === 'joined') {
          clearTimeout(t);
          resolve();
        }
        if (msg.type === 'error' && msg.payload?.message === 'Authentication failed') {
          clearTimeout(t);
          resolve();
        }
      });
      this.ws.addEventListener('error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });
    return this;
  }

  waitFor(predicate, ms = 5000, label = 'event') {
    const existing = this.events.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error(`${this.label} timeout waiting for ${label}; got ${this.events.map((e) => e.type).join(',')}`));
      }, ms);
      const onMsg = (e) => {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
        this.events.push(msg);
        if (predicate(msg)) {
          clearTimeout(t);
          this.ws.removeEventListener('message', onMsg);
          resolve(msg);
        }
      };
      this.ws.addEventListener('message', onMsg);
    });
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  close() {
    try {
      this.ws?.close(1000, 'smoke done');
    } catch (_) {}
  }

  ofType(type) {
    return this.events.filter((e) => e.type === type);
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`Smoke against ${API} / ${WS_URL}\n`);

  // --- Auth / register ---
  const aliceName = uniqueUser('smoke_a');
  const bobName = uniqueUser('smoke_b');
  const aliceAuth = await register(aliceName);
  const bobAuth = await register(bobName);
  assert('register two users', aliceAuth.user.id && bobAuth.user.id, `${aliceName}=${aliceAuth.user.id}, ${bobName}=${bobAuth.user.id}`);

  // --- Invalid token ---
  {
    const bad = new Client('bad', 'not-a-jwt', -1);
    bad.ws = new WebSocket(WS_URL);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('invalid token timeout')), 5000);
      bad.ws.addEventListener('open', () => {
        bad.ws.send(JSON.stringify({ type: 'join', payload: { token: 'not-a-jwt' } }));
      });
      bad.ws.addEventListener('message', (e) => {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
        bad.events.push(msg);
        if (msg.type === 'error') {
          clearTimeout(t);
          resolve();
        }
      });
      bad.ws.addEventListener('close', () => {
        clearTimeout(t);
        resolve();
      });
      bad.ws.addEventListener('error', reject);
    });
    assert(
      'invalid JWT gets error and/or close',
      bad.ofType('error').length > 0 || bad.ws.readyState >= 2,
      `events=${bad.events.map((e) => e.type).join(',')}`,
    );
    bad.close();
  }

  // --- Join + presence ---
  const alice = await new Client('alice', aliceAuth.token, aliceAuth.user.id).connect();
  assert('alice receives joined', alice.ofType('joined').length === 1);
  assert(
    'alice presence_snapshot includes self',
    alice.ofType('presence_snapshot')[0]?.payload?.onlineUserIds?.includes(alice.userId),
  );

  const bob = await new Client('bob', bobAuth.token, bobAuth.user.id).connect();
  await sleep(200);
  const aliceSawBob = alice.events.some((e) => e.type === 'user_online' && e.payload?.userId === bob.userId);
  const bobSnap = bob.ofType('presence_snapshot')[0]?.payload?.onlineUserIds || [];
  assert('alice sees bob online', aliceSawBob);
  assert('bob snapshot includes alice and bob', bobSnap.includes(alice.userId) && bobSnap.includes(bob.userId), JSON.stringify(bobSnap));

  // --- Multi-tab: second alice tab must not re-emit user_online ---
  const beforeOnline = bob.events.filter((e) => e.type === 'user_online' && e.payload?.userId === alice.userId).length;
  const aliceTab2 = await new Client('alice-tab2', aliceAuth.token, aliceAuth.user.id).connect();
  await sleep(300);
  const afterOnline = bob.events.filter((e) => e.type === 'user_online' && e.payload?.userId === alice.userId).length;
  assert('second alice tab does not emit duplicate user_online', afterOnline === beforeOnline, `before=${beforeOnline} after=${afterOnline}`);

  // Closing one alice tab must not offline alice
  aliceTab2.close();
  await sleep(400);
  const offlineAfterOneTab = bob.events.filter((e) => e.type === 'user_offline' && e.payload?.userId === alice.userId);
  assert('closing one alice tab does not emit user_offline', offlineAfterOneTab.length === 0);

  // --- Typing ---
  bob.events = bob.events.filter(() => false); // clear for clarity — keep array ref by length=0
  bob.events.length = 0;
  alice.send({ type: 'typing', payload: { receiverId: bob.userId, isTyping: true } });
  const typing = await bob.waitFor((e) => e.type === 'typing' && e.payload?.senderId === alice.userId, 4000, 'typing');
  assert('typing reaches bob', typing.payload.isTyping === true);

  // --- Active chat + DM + read ---
  bob.send({ type: 'active_chat', payload: { recipientId: alice.userId } });
  await sleep(200);

  alice.events.length = 0;
  bob.events.length = 0;
  const dmContent = `smoke-dm-${Date.now()}`;
  alice.send({
    type: 'send_message',
    payload: { receiverId: bob.userId, content: dmContent },
  });

  const aliceAck = await alice.waitFor((e) => e.type === 'message' && e.payload?.content === dmContent, 5000, 'dm ack');
  const bobMsg = await bob.waitFor((e) => e.type === 'message' && e.payload?.content === dmContent, 5000, 'dm receive');
  assert('DM delivered to sender', !!aliceAck.payload?.id);
  assert('DM delivered to receiver', !!bobMsg.payload?.id && bobMsg.payload.id === aliceAck.payload.id);
  assert(
    'DM auto-read because bob has active_chat open',
    bobMsg.payload.read === true,
    `read=${bobMsg.payload.read}`,
  );

  // Alice opens chat with bob → messages_read fan-out (for any unread; still should be safe)
  alice.events.length = 0;
  alice.send({ type: 'active_chat', payload: { recipientId: bob.userId } });
  // Bob should get messages_read if there were unread from bob→alice; may be none. Still verify attachment path by sending bob→alice.
  bob.events.length = 0;
  bob.send({ type: 'send_message', payload: { receiverId: alice.userId, content: `smoke-reply-${Date.now()}` } });
  const reply = await alice.waitFor((e) => e.type === 'message' && String(e.payload?.content || '').startsWith('smoke-reply-'), 5000, 'reply');
  assert('reply DM delivered while alice active_chat', reply.payload?.read === true, `read=${reply.payload?.read}`);

  // --- Feed broadcast via post create ---
  bob.events.length = 0;
  alice.events.length = 0;
  const postRes = await api('/api/posts', {
    method: 'POST',
    token: alice.token,
    body: { content: `smoke post ${Date.now()}`, visibility: 'public' },
  });
  assert('create post HTTP ok', postRes.status === 200 || postRes.status === 201, `status=${postRes.status} body=${JSON.stringify(postRes.json)}`);
  if (postRes.status === 200 || postRes.status === 201) {
    const postEvt = await bob.waitFor((e) => e.type === 'post_created', 5000, 'post_created').catch((e) => e);
    assert('post_created broadcast reaches bob', !(postEvt instanceof Error), postEvt instanceof Error ? postEvt.message : `id=${postEvt.payload?.id ?? postEvt.payload?.post?.id}`);
  }

  // --- Admin toast (login as admin) ---
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: '087425' },
  });
  if (adminLogin.status === 200 && adminLogin.json?.token) {
    alice.events.length = 0;
    bob.events.length = 0;
    const toastRes = await api('/api/admin/broadcast', {
      method: 'POST',
      token: adminLogin.json.token,
      body: { message: `smoke toast ${Date.now()}`, delivery: 'toast' },
    });
    assert('admin toast HTTP ok', toastRes.status === 200, JSON.stringify(toastRes.json));
    if (toastRes.status === 200) {
      const [aToast, bToast] = await Promise.all([
        alice.waitFor((e) => e.type === 'system_toast', 5000, 'alice toast'),
        bob.waitFor((e) => e.type === 'system_toast', 5000, 'bob toast'),
      ]);
      assert('system_toast reaches alice', aToast.type === 'system_toast');
      assert('system_toast reaches bob', bToast.type === 'system_toast');
    }
  } else {
    fail('admin login for toast', `status=${adminLogin.status} ${JSON.stringify(adminLogin.json)}`);
  }

  // --- Idle wake: leave sockets open briefly, then WS + HTTP again ---
  await sleep(1500);
  bob.events.length = 0;
  alice.send({ type: 'typing', payload: { receiverId: bob.userId, isTyping: false } });
  const wakeTyping = await bob.waitFor((e) => e.type === 'typing', 4000, 'idle wake typing');
  assert('WS message after idle still delivers', wakeTyping.payload?.isTyping === false);

  bob.events.length = 0;
  const post2 = await api('/api/posts', {
    method: 'POST',
    token: alice.token,
    body: { content: `smoke idle post ${Date.now()}`, visibility: 'public' },
  });
  if (post2.status === 200 || post2.status === 201) {
    const wakePost = await bob.waitFor((e) => e.type === 'post_created', 5000, 'idle wake post').catch((e) => e);
    assert('HTTP broadcast after idle still delivers', !(wakePost instanceof Error), wakePost instanceof Error ? wakePost.message : 'ok');
  } else {
    fail('idle post create', `status=${post2.status}`);
  }

  // --- Final offline when alice closes last tab ---
  bob.events.length = 0;
  alice.close();
  await sleep(500);
  const offline = bob.events.find((e) => e.type === 'user_offline' && e.payload?.userId === alice.userId);
  assert('alice final close emits user_offline', !!offline);

  bob.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.error('\nFailures:');
    for (const f of failed) console.error(` - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
}

main().catch((err) => {
  console.error('Smoke runner crashed:', err);
  process.exit(1);
});
