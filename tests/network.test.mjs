import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createServer } from '../server/index.mjs';
import { Connection } from '../client/network.mjs';
import { DEFAULT_CONFIG } from '../shared/config.mjs';

async function client(url, options = {}) {
  const ws = new WebSocket(url.replace(/^http/, 'ws') + '/ws', options);
  const inbox = [];
  const pending = new Set();
  let latestRoom = null;
  ws.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'room') latestRoom = message.room;
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
    get room() { return latestRoom; },
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

async function fixture(t, mode = 'versus', options = {}, config) {
  const app = await createServer({ port: 0, ...options });
  t.after(() => app.close());
  const a = await client(app.address.url);
  a.send({ type: 'create', mode, name: 'Águila', config });
  a.identity = await a.wait(m => m.type === 'welcome');
  await a.wait(m => m.type === 'room');
  const b = mode === 'solo' ? null : await client(app.address.url);
  if (b) {
    b.send({ type: 'join', code: a.identity.code, name: 'Bruma' });
    b.identity = await b.wait(m => m.type === 'welcome');
    await b.wait(m => m.type === 'room');
    await a.wait(m => m.type === 'room' && m.room.players.length === 2);
  }
  return { app, a, b };
}

async function start(a, b) {
  a.send({ type: 'ready', ready: true, configRevision: a.room.configRevision });
  if (b) b.send({ type: 'ready', ready: true, configRevision: b.room.configRevision });
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

test('anfitrión sincroniza ajustes; los cambios invalidan preparación y se bloquean al empezar', { timeout: 10000 }, async t => {
  const { a, b } = await fixture(t);
  assert.deepEqual(a.room.config, DEFAULT_CONFIG);
  assert.deepEqual(a.room.config, b.room.config);
  a.send({ type: 'ready', ready: true, configRevision: 1 });
  await a.wait(m => m.type === 'room' && m.room.players.find(p => p.id === a.identity.playerId).ready);
  b.send({ type: 'configure', config: { incomeMultiplier: 5 } });
  assert.match((await b.wait(m => m.type === 'error')).message, /anfitrión/);
  a.send({ type: 'configure', config: { startingResources: -1 } });
  assert.equal((await a.wait(m => m.type === 'error')).type, 'error');
  a.send({ type: 'configure' });
  assert.match((await a.wait(m => m.type === 'error')).message, /ajustes/);
  assert.equal(a.room.configRevision, 1);
  const config = { ...DEFAULT_CONFIG, mapId: 'frontera-de-los-siete-pasos', startingResources: 940, incomeMultiplier: 3, maxUnits: 60, duration: 900, tickets: 500 };
  a.send({ type: 'configure', config });
  const ra = (await a.wait(m => m.type === 'room' && m.room.configRevision === 2)).room;
  const rb = (await b.wait(m => m.type === 'room' && m.room.configRevision === 2)).room;
  assert.deepEqual(ra.config, config);
  assert.deepEqual(ra.config, rb.config);
  assert.ok(ra.players.every(p => !p.ready));
  b.send({ type: 'ready', ready: true, configRevision: 1 });
  assert.match((await b.wait(m => m.type === 'error')).message, /ajustes.*cambiado/i);
  b.send({ type: 'ready', ready: true });
  assert.match((await b.wait(m => m.type === 'error')).message, /ajustes.*cambiado/i);
  const [sa, sb] = await start(a, b);
  assert.deepEqual(sa.config, config);
  assert.deepEqual(sa.config, sb.config);
  assert.equal(sa.mapId, config.mapId);
  assert.equal(sa.mapId, sb.mapId);
  assert.equal(sa.duration, 900);
  assert.deepEqual(sa.tickets, [500, 500]);
  assert.equal(sa.limits.maxUnits, 60);
  assert.equal(sa.players.find(p => p.id === a.identity.playerId).credits, 940);
  assert.equal(sb.players.find(p => p.id === b.identity.playerId).credits, 940);
  a.send({ type: 'configure', config: DEFAULT_CONFIG });
  assert.match((await a.wait(m => m.type === 'error')).message, /bloqueados/);
  a.discard('state'); b.discard('state');
  const nextA = (await a.wait(m => m.type === 'state' && m.state.time >= .2)).state;
  const nextB = (await b.wait(m => m.type === 'state' && m.state.tick === nextA.tick)).state;
  const creditsA = nextA.players.find(p => p.id === a.identity.playerId).credits;
  const creditsB = nextB.players.find(p => p.id === b.identity.playerId).credits;
  assert.equal(creditsA, creditsB);
  assert.ok(Math.abs(creditsA - (940 + 6 * 3 * nextA.time)) < .02, 'Ingresos multiplicados una vez; presupuesto inicial intacto.');
});

test('crear sala valida ajustes y multiplicador conserva precios en economía compartida', { timeout: 10000 }, async t => {
  const app = await createServer({ port: 0 });
  t.after(() => app.close());
  const invalid = await client(app.address.url);
  for (const config of [null, [], { incomeMultiplier: 1.3 }, { maxUnits: 121 }, { mapId: 'desconocido' }, { startingResources: '900' }, { priceMultiplier: 2 }]) {
    invalid.send({ type: 'create', mode: 'solo', config });
    assert.equal((await invalid.wait(m => m.type === 'error')).type, 'error');
  }
  assert.equal((await (await fetch(app.address.url + '/health')).json()).rooms, 0);
  const { app: coopApp, a, b } = await fixture(t, 'coop', {}, { startingResources: 1000, incomeMultiplier: .5 });
  const [sa, sb] = await start(a, b);
  assert.deepEqual(sa.config, sb.config);
  const game = [...coopApp.wss.clients].find(ws => ws.context?.player.id === a.identity.playerId).context.room.game;
  assert.ok(game.players.every(p => p.credits === 1000), 'IA y jugadores tienen el mismo presupuesto inicial.');
  game.aiAt = Infinity; // Prevent AI spending while checking its real authoritative income.
  const before = game.players.map(p => p.credits);
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  assert.equal((await a.wait(m => m.type === 'ack')).ok, true);
  const state = (await a.wait(m => m.type === 'state' && m.state.tick >= 2)).state;
  const ownCredits = state.players.find(p => p.id === a.identity.playerId).credits;
  assert.ok(Math.abs(ownCredits - (1000 - 90 + 6 * .5 * state.time)) < .02, 'El precio sigue siendo 90 y los ingresos se reducen a la mitad.');
  const increments = game.players.map((p, i) => p.credits - before[i] + (p.id === a.identity.playerId ? 90 : 0));
  assert.ok(increments.every(value => Math.abs(value - increments[0]) < .0001), 'IA y jugadores reciben la misma tasa real del servidor.');
});

test('grupo en movimiento se detiene, dispara y reanuda en estados idénticos de dos clientes', { timeout: 12000 }, async t => {
  const { app, a, b } = await fixture(t, 'coop', { tickMs: 25, snapshotMs: 25 });
  await start(a, b);
  const game = [...app.wss.clients].find(ws => ws.context?.player.id === a.identity.playerId).context.room.game;
  // A deterministic combat fixture is placed inside the real server process.
  // Commands still travel through TCP and all movement/shooting uses stepGame.
  game.aiAt = Infinity;
  game.rng = 42;
  const group = ['recon', 'infantry'].map(type => game.units.find(u => u.ownerId === a.identity.playerId && u.type === type));
  const observer = game.units.find(u => u.ownerId === b.identity.playerId && u.type === 'recon');
  const enemy = game.units.find(u => u.team === 1 && u.type === 'infantry');
  group.forEach((u, i) => Object.assign(u, { x: 300, y: 485 + i * 30, cooldown: 0, order: 'stop', target: null, path: [] }));
  Object.assign(observer, { x: 440, y: 650, ammo: 0, path: [] });
  Object.assign(enemy, { x: 470, y: 500, hp: 45, ammo: 0, order: 'stop', target: null, path: [] });
  game.units = [...group, observer, enemy];
  const ammo = group.map(u => u.ammo);
  a.discard('state'); b.discard('state');
  a.send({ type: 'command', seq: 1, command: { type: 'move', unitIds: group.map(u => u.id), x: 650, y: 500 } });
  assert.equal((await a.wait(m => m.type === 'ack')).ok, true);
  const paused = (await a.wait(m => m.type === 'state' && group.every((unit, i) => m.state.units.some(u => u.id === unit.id && u.combatPaused && !u.moving && u.ammo < ammo[i])), 7000)).state;
  const shared = (await b.wait(m => m.type === 'state' && m.state.tick === paused.tick)).state;
  assert.deepEqual(paused.units, shared.units);
  const pending = group.map(unit => paused.units.find(u => u.id === unit.id));
  assert.ok(pending.every(u => u.order === 'move' && u.target.x > 600 && u.combatTargetId === enemy.id));
  const resumed = (await a.wait(m => m.type === 'state' && !m.state.units.some(u => u.id === enemy.id) && pending.every(unit => m.state.units.some(u => u.id === unit.id && u.moving && !u.combatPaused && u.x > unit.x + 2)), 7000)).state;
  const sharedResumed = (await b.wait(m => m.type === 'state' && m.state.tick === resumed.tick)).state;
  assert.deepEqual(resumed.units, sharedResumed.units);
  for (const unit of pending) assert.deepEqual(resumed.units.find(u => u.id === unit.id).target, unit.target);
  a.send({ type: 'command', seq: 2, command: { type: 'stop', unitIds: group.map(u => u.id) } });
  assert.equal((await a.wait(m => m.type === 'ack' && m.seq === 2)).ok, true);
  const stopped = (await a.wait(m => m.type === 'state' && group.every(unit => m.state.units.some(u => u.id === unit.id && u.order === 'stop')))).state;
  assert.ok(group.every(unit => stopped.units.find(u => u.id === unit.id).target === null));
});

test('ambos compañeros controlan el tiempo por TCP, comparten orden de revisión y preparan órdenes sin efectos durante pausa', { timeout: 10000 }, async t => {
  const { a, b } = await fixture(t, 'coop', { tickMs: 25, snapshotMs: 50 }, { startingResources: 1000, incomeMultiplier: 2 });
  const [initialA] = await start(a, b);
  assert.equal(initialA.timeControl.speed, 1);
  b.send({ type: 'time', speed: 0 });
  const paused = (await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === 1)).state;
  const pausedB = (await b.wait(message => message.type === 'state' && message.state.timeControl?.revision === 1)).state;
  assert.deepEqual(paused.timeControl, pausedB.timeControl);
  assert.equal(paused.timeControl.changedBy, b.identity.playerId);
  assert.equal(paused.timeControl.changedByName, 'Bruma');
  assert.equal(paused.timeControl.paused, true);
  assert.equal(paused.paused, false, 'La pausa manual es independiente de la desconexión.');
  a.discard('state');
  const still = (await a.wait(message => message.type === 'state')).state;
  assert.equal(still.tick, paused.tick);
  assert.deepEqual(still.units, paused.units);
  assert.deepEqual(still.players, paused.players);

  a.send({ type: 'time', speed: .5 });
  await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === 2);
  // Requests are deliberately sent without waiting for one another. We do not
  // assume which socket arrives first: both clients must observe the same order.
  a.send({ type: 'time', speed: 2 });
  b.send({ type: 'time', speed: 0 });
  const sequenceA = [], sequenceB = [];
  for (const revision of [3, 4]) {
    sequenceA.push((await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === revision)).state.timeControl);
    sequenceB.push((await b.wait(message => message.type === 'state' && message.state.timeControl?.revision === revision)).state.timeControl);
  }
  assert.deepEqual(sequenceA, sequenceB);
  assert.deepEqual(new Set(sequenceA.map(control => control.changedBy)), new Set([a.identity.playerId, b.identity.playerId]));
  a.send({ type: 'time', speed: 0 });
  const frozen = (await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === 5)).state;
  await b.wait(message => message.type === 'state' && message.state.timeControl?.revision === 5);
  const aCount = frozen.units.filter(unit => unit.ownerId === a.identity.playerId).length;
  const bCount = frozen.units.filter(unit => unit.ownerId === b.identity.playerId).length;
  const own = frozen.units.find(unit => unit.ownerId === a.identity.playerId);
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  assert.equal((await a.wait(message => message.type === 'ack' && message.seq === 1)).queued, true);
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  assert.equal((await a.wait(message => message.type === 'ack' && message.seq === 1)).queued, true, 'Un reintento conserva una sola orden preparada.');
  a.send({ type: 'command', seq: 2, command: { type: 'deploy', unitType: 'infantry', x: 800, y: 500 } });
  assert.equal((await a.wait(message => message.type === 'ack' && message.seq === 2)).queued, true);
  b.send({ type: 'command', seq: 1, command: { type: 'move', unitIds: [own.id], x: 400, y: 500 } });
  assert.equal((await b.wait(message => message.type === 'ack' && message.seq === 1)).ok, false);
  b.send({ type: 'command', seq: 2, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  assert.equal((await b.wait(message => message.type === 'ack' && message.seq === 2)).queued, true);
  const pendingA = (await a.wait(message => message.type === 'state' && message.state.pendingOrders === 2)).state;
  const pendingB = (await b.wait(message => message.type === 'state' && message.state.pendingOrders === 1)).state;
  assert.equal(pendingA.tick, frozen.tick);
  assert.equal(pendingB.tick, frozen.tick);
  assert.deepEqual(pendingA.units, frozen.units);
  assert.deepEqual(pendingA.players, frozen.players);
  b.send({ type: 'time', speed: 2 });
  const resultA = await a.wait(message => message.type === 'commandResult' && message.seq === 1);
  const failedA = await a.wait(message => message.type === 'commandResult' && message.seq === 2);
  const resultB = await b.wait(message => message.type === 'commandResult' && message.seq === 2);
  assert.equal(resultA.ok, true); assert.equal(resultB.ok, true);
  assert.equal(failedA.ok, false);
  assert.match(failedA.error, /base/);
  const resumed = (await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === 6 && message.state.pendingOrders === 0 && message.state.tick > frozen.tick)).state;
  assert.equal(resumed.timeControl.speed, 2);
  assert.equal(resumed.timeControl.changedBy, b.identity.playerId);
  assert.equal(resumed.units.filter(unit => unit.ownerId === a.identity.playerId).length, aCount + 1);
  assert.equal(resumed.units.filter(unit => unit.ownerId === b.identity.playerId).length, bCount + 1);
  for (const id of [a.identity.playerId, b.identity.playerId]) assert.ok(Math.abs(resumed.players.find(player => player.id === id).credits - (1000 - 90 + resumed.time * 6 * 2)) < .02);
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry', x: 160, y: 500 } });
  const repeated = await a.wait(message => message.type === 'ack' && message.seq === 1);
  assert.equal(repeated.ok, true); assert.equal(repeated.queued, false);
});

test('reconectar conserva pausa manual, última velocidad y órdenes preparadas; PvP rechaza cambios de reloj', { timeout: 10000 }, async t => {
  const { app, a, b } = await fixture(t, 'coop', { tickMs: 25, snapshotMs: 50 });
  await start(a, b);
  a.send({ type: 'time', speed: 2 });
  await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === 1);
  b.send({ type: 'time', speed: 0 });
  const paused = (await b.wait(message => message.type === 'state' && message.state.timeControl?.revision === 2)).state;
  a.send({ type: 'command', seq: 1, command: { type: 'deploy', unitType: 'infantry' } });
  assert.equal((await a.wait(message => message.type === 'ack')).queued, true);
  await a.disconnect();
  const disconnected = (await b.wait(message => message.type === 'state' && message.state.paused)).state;
  assert.deepEqual(disconnected.timeControl, paused.timeControl);
  const recovered = await client(app.address.url);
  recovered.send({ type: 'resume', code: a.identity.code, token: a.identity.token });
  assert.equal((await recovered.wait(message => message.type === 'welcome')).playerId, a.identity.playerId);
  const recoveredState = (await recovered.wait(message => message.type === 'state' && !message.state.paused)).state;
  assert.deepEqual(recoveredState.timeControl, paused.timeControl);
  assert.equal(recoveredState.pendingOrders, 1);
  assert.equal(recoveredState.tick, paused.tick);
  b.send({ type: 'time', speed: .5 });
  const resumed = (await recovered.wait(message => message.type === 'state' && message.state.timeControl?.revision === 3 && message.state.tick > paused.tick)).state;
  assert.equal(resumed.timeControl.speed, .5);
  assert.ok(resumed.tick - paused.tick <= 2, 'Reconectar no recupera de golpe el tiempo real suspendido.');
  assert.equal((await recovered.wait(message => message.type === 'commandResult')).ok, true);

  const { a: versusA, b: versusB } = await fixture(t, 'versus');
  const [initial] = await start(versusA, versusB);
  assert.equal(initial.timeControl, null);
  versusB.send({ type: 'time', speed: 0 });
  assert.match((await versusB.wait(message => message.type === 'error')).message, /cooperativo/);
  const next = (await versusA.wait(message => message.type === 'state' && message.state.tick > initial.tick)).state;
  assert.equal(next.timeControl, null);
});

test('ocupación y salida por TCP esperan la reanudación y sincronizan plazas, tropas y destinos', { timeout: 10000 }, async t => {
  const { app, a, b } = await fixture(t, 'coop', { tickMs: 25, snapshotMs: 50 }, { mapId: 'llanura-del-estuario' });
  await start(a, b);
  const game = [...app.wss.clients].find(socket => socket.context?.player.id === a.identity.playerId).context.room.game;
  game.aiAt = Infinity;
  const building = game.map.buildings.find(value => value.capacity === 2 && value.x < game.map.width / 2);
  assert(building, 'El mapa incluye una posición real con dos plazas.');
  const troops = [a, b].map(connection => game.units.find(unit => unit.ownerId === connection.identity.playerId && unit.type === 'infantry'));
  troops.forEach((troop, index) => {
    const door = building.doors[index];
    const center = { x: building.x + building.w / 2, y: building.y + building.h / 2 };
    const distance = Math.hypot(door.x - center.x, door.y - center.y);
    Object.assign(troop, { x: door.x + (door.x - center.x) / distance * 30, y: door.y + (door.y - center.y) / distance * 30, hp: 83, ammo: 9, path: [], target: null, order: 'stop' });
  });
  game.units = troops;
  b.send({ type: 'time', speed: 0 });
  const paused = (await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === 1)).state;
  await b.wait(message => message.type === 'state' && message.state.timeControl?.revision === 1);
  a.send({ type: 'command', seq: 1, command: { type: 'garrison', unitIds: [troops[0].id], buildingId: building.id } });
  b.send({ type: 'command', seq: 1, command: { type: 'garrison', unitIds: [troops[1].id], buildingId: building.id } });
  assert.equal((await a.wait(message => message.type === 'ack')).queued, true);
  assert.equal((await b.wait(message => message.type === 'ack')).queued, true);
  const queued = (await a.wait(message => message.type === 'state' && message.state.pendingOrders === 1)).state;
  assert.equal(queued.tick, paused.tick);
  assert.ok(troops.every(troop => !troop.pendingBuildingId && !troop.garrisonedIn), 'Preparar la orden no reserva plazas ni teletransporta tropas durante la pausa.');
  a.send({ type: 'time', speed: 1 });
  assert.equal((await a.wait(message => message.type === 'commandResult' && message.seq === 1)).ok, true);
  assert.equal((await b.wait(message => message.type === 'commandResult' && message.seq === 1)).ok, true);
  const reserved = (await a.wait(message => message.type === 'state' && message.state.buildings.some(value => value.id === building.id && value.reserved === 2))).state;
  const reservedB = (await b.wait(message => message.type === 'state' && message.state.tick === reserved.tick && message.state.timeControl?.revision === 2)).state;
  assert.deepEqual(reserved.buildings, reservedB.buildings);
  assert.deepEqual(reserved.units, reservedB.units);
  assert.equal(reserved.buildings.find(value => value.id === building.id).occupied, 0);
  assert.ok(reserved.units.every(troop => troop.pendingBuildingId === building.id && !troop.garrisonedIn), 'La entrada exige recorrer el camino a la puerta.');
  const inside = (await a.wait(message => message.type === 'state' && troops.every(troop => message.state.units.some(unit => unit.id === troop.id && unit.garrisonedIn === building.id)))).state;
  const insideB = (await b.wait(message => message.type === 'state' && message.state.tick === inside.tick)).state;
  assert.deepEqual(inside.units, insideB.units);
  assert.deepEqual(inside.buildings, insideB.buildings);
  const occupied = inside.buildings.find(value => value.id === building.id);
  assert.equal(occupied.occupied, 2); assert.equal(occupied.reserved, 0);
  assert.deepEqual(new Set(occupied.occupantIds), new Set(troops.map(troop => troop.id)));
  assert.ok(inside.units.every(troop => troop.hp === 83 && troop.ammo === 9), 'Entrar conserva integridad y munición.');

  a.send({ type: 'time', speed: 0 });
  const stopped = (await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === 3)).state;
  a.send({ type: 'command', seq: 2, command: { type: 'exit', unitIds: [troops[0].id] } });
  b.send({ type: 'command', seq: 2, command: { type: 'move', unitIds: [troops[1].id], ...game.map.spawns[0] } });
  assert.equal((await a.wait(message => message.type === 'ack' && message.seq === 2)).queued, true);
  assert.equal((await b.wait(message => message.type === 'ack' && message.seq === 2)).queued, true);
  const waitingExit = (await a.wait(message => message.type === 'state' && message.state.pendingOrders === 1 && message.state.timeControl?.revision === 3)).state;
  assert.equal(waitingExit.tick, stopped.tick);
  assert.ok(waitingExit.units.every(troop => troop.garrisonedIn === building.id));
  b.send({ type: 'time', speed: .5 });
  assert.equal((await a.wait(message => message.type === 'commandResult' && message.seq === 2)).ok, true);
  assert.equal((await b.wait(message => message.type === 'commandResult' && message.seq === 2)).ok, true);
  const outside = (await a.wait(message => message.type === 'state' && message.state.timeControl?.revision === 4 && message.state.units.every(troop => !troop.garrisonedIn))).state;
  const outsideB = (await b.wait(message => message.type === 'state' && message.state.tick === outside.tick && message.state.timeControl?.revision === 4)).state;
  assert.deepEqual(outside.units, outsideB.units);
  assert.deepEqual(outside.buildings, outsideB.buildings);
  assert.ok(outside.units.every(troop => troop.hp === 83 && troop.ammo === 9));
  assert.equal(outside.units.find(troop => troop.id === troops[0].id).order, 'stop');
  assert.deepEqual(outside.units.find(troop => troop.id === troops[1].id).target, game.map.spawns[0], 'Una orden de movimiento sale del edificio y conserva su destino.');
  assert.ok(outside.units.every(troop => !(troop.x > building.x && troop.x < building.x + building.w && troop.y > building.y && troop.y < building.y + building.h)));
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
  const room = (await wait(m => m.type === 'room')).room;
  connection.send({ type: 'ready', ready: true, configRevision: room.configRevision });
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
