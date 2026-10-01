import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createServer } from '../server/index.mjs';
import { Connection } from '../client/network.mjs';

async function client(url, options = {}) {
  const ws = new WebSocket(url.replace(/^http/, 'ws') + '/ws', options);
  const inbox = [];
  const pending = new Set();
  ws.on('message', raw => {
    const message = JSON.parse(raw.toString());
    for (const request of pending) {
      if (request.predicate(message)) {
        pending.delete(request); clearTimeout(request.timer); request.resolve(message); return;
      }
    }
    inbox.push(message);
    if (inbox.length > 300) inbox.shift();
  });
  ws.on('error', () => {});
  await once(ws, 'open');
  return {
    ws,
    send(message) { ws.send(JSON.stringify(message)); },
    discard(type) { for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].type === type) inbox.splice(i, 1); },
    wait(predicate, timeout = 3000) {
      const index = inbox.findIndex(predicate);
      if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const request = { predicate, resolve, timer: null };
        request.timer = setTimeout(() => { pending.delete(request); reject(new Error(`Tiempo agotado esperando mensaje; recibidos: ${JSON.stringify(inbox.slice(-3))}`)); }, timeout);
        pending.add(request);
      });
    },
    async disconnect() {
      if (ws.readyState === WebSocket.CLOSED) return;
      const closed = once(ws, 'close'); ws.close(); await closed;
    },
  };
}

async function fixture(t, mode = 'versus', options = {}) {
  const app = await createServer({ port: 0, ...options });
  t.after(() => app.close());
  const a = await client(app.address.url);
  a.send({ type: 'create', mode, name: 'Águila' });
  a.identity = await a.wait(m => m.type === 'welcome');
  const b = mode === 'solo' ? null : await client(app.address.url);
  if (b) {
    b.send({ type: 'join', code: a.identity.code, name: 'Bruma' });
    b.identity = await b.wait(m => m.type === 'welcome');
    await a.wait(m => m.type === 'room' && m.room.players.length === 2);
  }
  return { app, a, b };
}

async function start(a, b) {
  a.send({ type: 'ready', ready: true });
  if (b) b.send({ type: 'ready', ready: true });
  await a.wait(m => m.type === 'room' && m.room.players.every(p => p.ready));
  a.send({ type: 'start' });
  const firstA = (await a.wait(m => m.type === 'state')).state;
  const firstB = b ? (await b.wait(m => m.type === 'state')).state : null;
  return [firstA, firstB];
}

test('dos WebSockets reales comparten duelo, preparación y autoridad de inicio', { timeout: 10000 }, async t => {
  const { app, a, b } = await fixture(t);
  assert.match(a.identity.code, /^[A-Z2-9]{8}$/);
  assert.match(a.identity.token, /^[a-f0-9]{64}$/);
  assert.notEqual(a.identity.playerId, b.identity.playerId);
  a.send({ type: 'start' });
  assert.match((await a.wait(m => m.type === 'error')).message, /preparados/);
  b.send({ type: 'start' });
  assert.match((await b.wait(m => m.type === 'error')).message, /anfitrión/);
  const [sa, sb] = await start(a, b);
  assert.equal(sa.status, 'playing');
  assert.equal(sa.tick, sb.tick);
  assert.deepEqual(sa.sectors, sb.sectors);
  assert.deepEqual(sa.tickets, sb.tickets);
  const stranger = await client(app.address.url);
  stranger.send({ type: 'join', code: a.identity.code, name: 'Tercero' });
  assert.match((await stranger.wait(m => m.type === 'error')).message, /empezado/);
  stranger.send({ type: 'command', seq: 1, playerId: a.identity.playerId, command: { type: 'stop', unitIds: [] } });
  assert.match((await stranger.wait(m => m.type === 'error')).message, /Primero/);
});

test('equipo coop compartido, órdenes ajenas rechazadas y gasto idempotente', { timeout: 10000 }, async t => {
  const { a, b } = await fixture(t, 'coop');
  b.send({ type: 'team', team: 1 });
  assert.match((await b.wait(m => m.type === 'error')).message, /Equipo/);
  const [sa, sb] = await start(a, b);
  const humansA = sa.players.filter(p => p.id === a.identity.playerId || p.id === b.identity.playerId);
  assert.equal(humansA.length, 2);
  assert.ok(humansA.every(p => p.team === 0));
  assert.deepEqual(sa.units, sb.units);
  const initialCount = sa.units.filter(u => u.ownerId === a.identity.playerId).length;
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  assert.equal((await a.wait(m => m.type === 'ack' && m.seq === 1)).ok, true);
  const afterDeploy = (await a.wait(m => m.type === 'state' && m.state.units.filter(u => u.ownerId === a.identity.playerId).length === initialCount + 1)).state;
  const ownBudget = afterDeploy.players.find(p => p.id === a.identity.playerId).credits;
  assert.ok(Math.abs(ownBudget - (410 - 90 + afterDeploy.time * 6)) < 0.2, 'El servidor resta el coste y aplica ingresos de simulación.');
  const own = afterDeploy.units.find(u => u.ownerId === a.identity.playerId && u.type === 'infantry');
  b.send({ type: 'command', seq: 1, playerId: a.identity.playerId, command: { type: 'move', unitIds: [own.id], x: 600, y: 500 } });
  assert.equal((await b.wait(m => m.type === 'ack' && m.seq === 1)).ok, false);
  const count = afterDeploy.units.filter(u => u.ownerId === a.identity.playerId).length;
  a.discard('state');
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'tank', x: 160, y: 500 } });
  assert.equal((await a.wait(m => m.type === 'ack' && m.seq === 1)).ok, true);
  const later = (await a.wait(m => m.type === 'state')).state;
  assert.equal(later.units.filter(u => u.ownerId === a.identity.playerId).length, count);
  a.send({ type: 'command', seq: 2, command: { type: 'move', unitIds: [own.id], x: 600, y: 500 } });
  assert.equal((await a.wait(m => m.type === 'ack' && m.seq === 2)).ok, true);
  const moved = (await a.wait(m => m.type === 'state' && m.state.units.some(u => u.id === own.id && u.x > own.x + 2))).state;
  assert.ok(moved.units.find(u => u.id === own.id).moving);
});

test('niebla de guerra oculta unidades del enemigo al otro cliente', { timeout: 10000 }, async t => {
  const { a, b } = await fixture(t);
  await start(a, b);
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  b.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'tank', x: 1440, y: 500 } });
  assert.equal((await a.wait(m => m.type === 'ack')).ok, true);
  assert.equal((await b.wait(m => m.type === 'ack')).ok, true);
  const sa = (await a.wait(m => m.type === 'state' && m.state.units.some(u => u.ownerId === a.identity.playerId && u.type === 'infantry'))).state;
  const sb = (await b.wait(m => m.type === 'state' && m.state.units.some(u => u.ownerId === b.identity.playerId && u.type === 'tank'))).state;
  assert.ok(!sa.units.some(u => u.ownerId === b.identity.playerId));
  assert.ok(!sb.units.some(u => u.ownerId === a.identity.playerId));
  assert.ok(!JSON.stringify(sa.events).includes(b.identity.playerId));
});

test('desconexión pausa y resume conserva identidad y confirmaciones sin repetir órdenes', { timeout: 10000 }, async t => {
  const { app, a, b } = await fixture(t);
  await start(a, b);
  a.send({ type: 'command', seq: 42, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  const ack = await a.wait(m => m.type === 'ack' && m.seq === 42);
  assert.equal(ack.ok, true);
  await a.disconnect();
  const paused = (await b.wait(m => m.type === 'state' && m.state.paused)).state;
  assert.ok(paused.reconnectDeadline > Date.now());
  b.discard('state');
  const stillPaused = (await b.wait(m => m.type === 'state' && m.state.paused)).state;
  assert.equal(stillPaused.tick, paused.tick);
  b.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry', x: 1440, y: 500 } });
  assert.equal((await b.wait(m => m.type === 'ack' && m.seq === 1)).ok, false);
  const resumed = await client(app.address.url);
  resumed.send({ type: 'resume', code: a.identity.code, token: a.identity.token });
  const identity = await resumed.wait(m => m.type === 'welcome');
  assert.equal(identity.playerId, a.identity.playerId);
  assert.notEqual(identity.token, a.identity.token);
  const state = (await resumed.wait(m => m.type === 'state' && !m.state.paused)).state;
  const count = state.units.filter(u => u.ownerId === identity.playerId).length;
  resumed.send({ type: 'command', seq: 42, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  assert.deepEqual(await resumed.wait(m => m.type === 'ack' && m.seq === 42), ack);
  resumed.discard('state');
  const next = (await resumed.wait(m => m.type === 'state')).state;
  assert.equal(next.units.filter(u => u.ownerId === identity.playerId).length, count);
  const invalid = await client(app.address.url);
  invalid.send({ type: 'resume', code: identity.code, token: a.identity.token });
  assert.match((await invalid.wait(m => m.type === 'error')).message, /recuperar/);
  invalid.send({ type: 'resume', code: identity.code, token: 'é'.repeat(64) });
  assert.match((await invalid.wait(m => m.type === 'error')).message, /recuperar/);
  const replacement = await client(app.address.url);
  replacement.send({ type: 'resume', code: identity.code, token: identity.token });
  assert.equal((await replacement.wait(m => m.type === 'welcome')).playerId, identity.playerId);
  assert.match((await resumed.wait(m => m.type === 'ended')).message, /otra conexión/);
});

test('expira el plazo de reconexión y el jugador conectado recibe un final controlado', { timeout: 10000 }, async t => {
  const { a, b } = await fixture(t, 'versus', { disconnectGraceMs: 250, tickMs: 25, snapshotMs: 50 });
  await start(a, b);
  await a.disconnect();
  assert.match((await b.wait(m => m.type === 'ended')).message, /reconexión/);
  b.send({ type: 'command', seq: 1, command: { type: 'stop', unitIds: [] } });
  assert.match((await b.wait(m => m.type === 'error')).message, /Primero/);
});

test('solo puede llegar al final y el servidor bloquea órdenes posteriores', { timeout: 20000 }, async t => {
  const { a } = await fixture(t, 'solo', { duration: 10 });
  await start(a);
  const finalState = (await a.wait(m => m.type === 'state' && m.state.status === 'finished', 15000)).state;
  assert.ok(finalState.winner === null || [0, 1, 'draw'].includes(finalState.winner));
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  assert.equal((await a.wait(m => m.type === 'ack')).ok, false);
});

test('HTTP limita archivos; WebSocket rechaza orígenes ajenos y mensajes grandes', { timeout: 10000 }, async t => {
  const app = await createServer({ port: 0 });
  t.after(() => app.close());
  assert.equal((await fetch(app.address.url + '/health')).status, 200);
  for (const hidden of ['/server/index.mjs', '/package.json', '/node_modules/ws/package.json', '/tests/network.test.mjs', '/.git/config', '/client/..%2Fserver/index.mjs']) {
    assert.equal((await fetch(app.address.url + hidden)).status, 404, hidden);
  }
  assert.equal((await fetch(app.address.url + '/shared/data.mjs')).status, 200);
  assert.equal((await fetch(app.address.url + '/health', { method: 'POST' })).status, 405);
  await assert.rejects(client(app.address.url, { origin: 'https://sitio-ajeno.example' }), /403/);
  const valid = await client(app.address.url, { origin: app.address.url });
  const closed = once(valid.ws, 'close');
  valid.ws.send('x'.repeat(17 * 1024));
  assert.equal((await closed)[0], 1009);
});

test('cliente de la aplicación recupera una orden sin ack y cierra sesiones caducadas', { timeout: 10000 }, async t => {
  const app = await createServer({ port: 0 });
  const original = Object.fromEntries(['location', 'sessionStorage', 'WebSocket'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const stored = new Map();
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: app.address.url, href: app.address.url, protocol: 'http:' } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) } });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: WebSocket });
  const observed = [];
  const connection = new Connection(message => observed.push(message), () => {});
  const rejected = new Connection(message => observed.push(message), () => {});
  t.after(async () => {
    connection.leave(); rejected.leave(); await app.close();
    for (const key of Object.keys(original)) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else delete globalThis[key];
    }
  });
  async function wait(predicate) {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      const index = observed.findIndex(predicate);
      if (index >= 0) return observed.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    assert.fail('El cliente de la aplicación no completó el flujo esperado.');
  }
  connection.connect(app.address.url, { type: 'create', name: 'Cliente aplicación', mode: 'solo' });
  const welcome = await wait(m => m.type === 'welcome');
  connection.send({ type: 'ready', ready: true });
  await wait(m => m.type === 'room' && m.room.players.every(p => p.ready));
  connection.send({ type: 'start' });
  const initial = (await wait(m => m.type === 'state')).state;
  const initialCount = initial.units.filter(u => u.ownerId === welcome.playerId).length;
  const serverSocket = [...app.wss.clients].find(ws => ws.context?.player.id === welcome.playerId);
  const originalSend = serverSocket.send.bind(serverSocket);
  let dropped = false;
  // Controlled fault injection: apply a real command, lose its first ack, and
  // break the real TCP socket. No simulation or command result is mocked.
  serverSocket.send = (payload, ...args) => {
    const data = JSON.parse(payload);
    if (data.type === 'ack' && data.seq === 1 && !dropped) { dropped = true; serverSocket.terminate(); return; }
    return originalSend(payload, ...args);
  };
  assert.equal(connection.command({ type: 'deploy', unitType: 'infantry', x: 160, y: 500 }), true);
  assert.equal((await wait(m => m.type === 'ack' && m.seq === 1)).ok, true);
  const recovered = await wait(m => m.type === 'welcome' && m.token !== welcome.token);
  assert.equal(recovered.playerId, welcome.playerId);
  assert.equal(connection.pending.size, 0);
  const state = (await wait(m => m.type === 'state' && !m.state.paused && m.state.units.filter(u => u.ownerId === welcome.playerId).length === initialCount + 1)).state;
  assert.equal(state.units.filter(u => u.ownerId === welcome.playerId).length, initialCount + 1);
  const credential = stored.get('fb-resume');
  observed.length = 0;
  connection.leave();
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.ok(!observed.some(m => m.type === 'ended'), 'Abandonar intencionalmente no emite un final tardío hacia otra pantalla.');
  stored.set('fb-resume', credential);
  assert.equal(rejected.resumeSaved(), true);
  assert.match((await wait(m => m.type === 'ended')).message, /caducado|existe|recuperar/);
  assert.equal(rejected.token, null);
  assert.equal(stored.has('fb-resume'), false);
});

test('el límite de salas limita trabajo y libera plazas al abandonar', { timeout: 10000 }, async t => {
  const app = await createServer({ port: 0, maxRooms: 1 });
  t.after(() => app.close());
  const a = await client(app.address.url);
  const b = await client(app.address.url);
  a.send({ type: 'create', mode: 'solo' });
  await a.wait(m => m.type === 'welcome');
  b.send({ type: 'create', mode: 'solo' });
  assert.match((await b.wait(m => m.type === 'error')).message, /lleno/);
  a.send({ type: 'leave' });
  await a.wait(m => m.type === 'ended');
  b.send({ type: 'create', mode: 'solo' });
  assert.equal((await b.wait(m => m.type === 'welcome')).type, 'welcome');
});

test('HTTP sirve manifiesto, service worker y todos los recursos PWA incluidas licencias', { timeout: 10000 }, async t => {
  const app = await createServer({ port: 0 });
  t.after(() => app.close());
  const serviceWorker = await fetch(app.address.url + '/sw.js');
  assert.equal(serviceWorker.status, 200);
  assert.match(serviceWorker.headers.get('content-type'), /javascript/);
  assert.equal(serviceWorker.headers.get('service-worker-allowed'), '/');
  const manifestResponse = await fetch(app.address.url + '/manifest.webmanifest');
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get('content-type'), /manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, 'standalone');
  const precacheResponse = await fetch(app.address.url + '/precache.json');
  assert.equal(precacheResponse.status, 200);
  const precache = await precacheResponse.json();
  assert.ok(precache.files.length > 0);
  const paths = new Set([...precache.files.map(entry => entry.url), ...manifest.icons.map(icon => icon.src)]);
  assert.ok(paths.has('/vendor/THREE-LICENSE.txt'));
  assert.ok(paths.has('/vendor/WS-LICENSE.txt'));
  await Promise.all([...paths].map(async resource => {
    const response = await fetch(app.address.url + resource);
    assert.equal(response.status, 200, `${resource} debe poder guardarse sin conexión.`);
    if (resource.endsWith('.txt')) {
      assert.match(response.headers.get('content-type'), /^text\/plain; charset=utf-8$/);
      assert.match(await response.text(), /copyright/i);
    } else await response.arrayBuffer();
  }));
});
