import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyCommand, stepGame, snapshotFor, terrainAt } from '../shared/sim.mjs';
import { UNIT_TYPES, MAP, RULES } from '../shared/data.mjs';

const players = [{ id: 'alice', name: 'Alicia', team: 0 }, { id: 'bob', name: 'Bruno', team: 1 }];
const pvp = (extra = {}) => createGame({ mode: 'pvp', players, duration: 3600, ...extra });
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 10); i++) stepGame(game, 0.1); };
const unit = (game, ownerId, type) => game.units.find(u => u.ownerId === ownerId && u.type === type);
const position = (u, x, y) => { u.x = x; u.y = y; u.path = []; u.target = null; u.order = 'stop'; };
const only = (game, keep) => { game.units = game.units.filter(u => keep.includes(u)); };

test('nine classes, validated modes, starters and initial hidden opponents', () => {
  assert.equal(Object.keys(UNIT_TYPES).length, 9);
  const game = pvp();
  assert.equal(game.units.length, 8);
  assert.equal(game.players[0].credits, 410);
  assert.equal(snapshotFor(game, 'alice').units.length, 4);
  assert.equal(snapshotFor(game, 'alice').players[1].credits, null);
  assert.throws(() => createGame({ mode: 'pvp', players: [players[0]] }));
  assert.throws(() => snapshotFor(game, 'intruder'));
});

test('deployment validates budget, position, deck and charges once on successful call', () => {
  const game = pvp();
  const original = game.players[0].credits;
  assert.equal(applyCommand(game, 'alice', { type: 'deploy', unitType: 'infantry', x: 900, y: 500 }).ok, false);
  assert.equal(game.players[0].credits, original);
  assert.equal(applyCommand(game, 'alice', { type: 'deploy', unitType: '__proto__' }).ok, false);
  const result = applyCommand(game, 'alice', { type: 'deploy', unitType: 'infantry', x: 165, y: 500 });
  assert.equal(result.ok, true);
  assert.equal(game.players[0].credits, original - UNIT_TYPES.infantry.cost);
  assert.ok(game.units.some(u => u.id === result.unitId && u.ownerId === 'alice'));
  game.players[0].credits = 0;
  assert.equal(applyCommand(game, 'alice', { type: 'deploy', unitType: 'tank' }).ok, false);
  const restricted = pvp({ players: [{ ...players[0], deck: ['infantry', 'recon'] }, players[1]] });
  assert.equal(applyCommand(restricted, 'alice', { type: 'deploy', unitType: 'tank' }).ok, false);
});

test('ownership is exclusive even within allied team and invalid input does not mutate units', () => {
  const game = createGame({ mode: 'coop', players: [{ ...players[0], team: 0 }, { ...players[1], team: 0 }] });
  const friend = unit(game, 'bob', 'tank');
  const before = JSON.stringify(friend);
  assert.equal(applyCommand(game, 'alice', { type: 'move', unitIds: [friend.id], x: 400, y: 500 }).ok, false);
  assert.equal(JSON.stringify(friend), before);
  const own = unit(game, 'alice', 'tank');
  assert.equal(applyCommand(game, 'alice', { type: 'move', unitIds: [own.id], x: NaN, y: 500 }).ok, false);
  assert.equal(applyCommand(game, 'intruder', { type: 'surrender' }).ok, false);
  assert.equal(applyCommand(game, 'alice', { type: 'unknown', unitIds: [own.id] }).ok, false);
});

test('ground pathfinding reaches destination across river using passable crossing', () => {
  const game = pvp(), scout = unit(game, 'alice', 'recon');
  only(game, [scout]); position(scout, 640, 90);
  assert.equal(terrainAt(790, 90), 'water');
  assert.equal(applyCommand(game, 'alice', { type: 'move', unitIds: [scout.id], x: 940, y: 90 }).ok, true);
  assert.ok(scout.path.length > 1);
  let touchedBridge = false;
  for (let i = 0; i < 160; i++) {
    stepGame(game, 0.1);
    assert.notEqual(terrainAt(scout.x, scout.y), 'water', `Entered water at ${scout.x},${scout.y}`);
    if (scout.x > 748 && scout.x < 853) touchedBridge = true;
  }
  assert.ok(touchedBridge);
  assert.ok(Math.hypot(scout.x - 940, scout.y - 90) < 2);
});

test('forest slows vehicles, stop cancels order and suppression slows movement', () => {
  const run = (x, y, suppressed = 0) => {
    const game = pvp(), tank = unit(game, 'alice', 'tank'); only(game, [tank]); position(tank, x, y); tank.suppression = suppressed;
    applyCommand(game, 'alice', { type: 'move', unitIds: [tank.id], x: x + 90, y }); advance(game, 1);
    const distance = tank.x - x;
    applyCommand(game, 'alice', { type: 'stop', unitIds: [tank.id] }); const stopped = tank.x; advance(game, 1); assert.equal(tank.x, stopped);
    return distance;
  };
  // The original y=300 comparison now crosses an authored building. Compare a
  // straight open corridor so this remains a speed test rather than a detour.
  assert.ok(run(300, 100) < run(300, 200) * 0.65);
  assert.ok(run(300, 200, 0.8) < run(300, 200) * 0.5);
});

test('shared allied reconnaissance reveals targets, terrain and smoke conceal them', () => {
  const game = pvp(), recon = unit(game, 'alice', 'recon'), target = unit(game, 'bob', 'tank');
  only(game, [recon, target]); position(recon, 600, 500); position(target, 890, 500);
  assert.ok(snapshotFor(game, 'alice').units.some(u => u.id === target.id));
  position(recon, 500, 500);
  assert.ok(!snapshotFor(game, 'alice').units.some(u => u.id === target.id));
  position(recon, 660, 500);
  applyCommand(game, 'bob', { type: 'smoke', unitIds: [target.id], x: target.x, y: target.y });
  assert.ok(!snapshotFor(game, 'alice').units.some(u => u.id === target.id));
  advance(game, 21);
  assert.equal(game.smokes.length, 0);
});

test('anti-air weapons ignore ground units and damage aircraft', () => {
  const game = pvp();
  game.players[0].credits = 1000; game.players[1].credits = 1000;
  const aaId = applyCommand(game, 'alice', { type: 'deploy', unitType: 'aa' }).unitId;
  const planeId = applyCommand(game, 'bob', { type: 'deploy', unitType: 'helicopter' }).unitId;
  const aa = game.units.find(u => u.id === aaId), helicopter = game.units.find(u => u.id === planeId), tank = unit(game, 'bob', 'tank');
  only(game, [aa, tank]); position(aa, 600, 500); position(tank, 700, 500); tank.ammo = 0;
  advance(game, 3);
  assert.equal(aa.ammo, UNIT_TYPES.aa.ammo);
  game.units.push(helicopter); position(helicopter, 740, 500); helicopter.ammo = 0;
  advance(game, 4);
  assert.ok(aa.ammo < UNIT_TYPES.aa.ammo);
  assert.ok(helicopter.hp < UNIT_TYPES.helicopter.hp);
});

test('combat consumes ammunition and applies damage and suppression', () => {
  const game = pvp(), attacker = unit(game, 'alice', 'tank'), target = unit(game, 'bob', 'infantry');
  only(game, [attacker, target]); position(attacker, 600, 500); position(target, 735, 500); target.ammo = 0;
  advance(game, 5);
  assert.ok(attacker.ammo < UNIT_TYPES.tank.ammo);
  assert.ok(target.hp < UNIT_TYPES.infantry.hp);
  assert.ok(target.suppression > 0);
  const remainingHp = target.hp; attacker.ammo = 0; advance(game, 3);
  assert.equal(target.hp, remainingHp);
});

test('logistics replenishes and repairs nearby units using finite stock', () => {
  const game = pvp(), tank = unit(game, 'alice', 'tank'), supply = unit(game, 'alice', 'supply');
  only(game, [tank, supply]); position(tank, 600, 500); position(supply, 650, 500); tank.hp = 100; tank.ammo = 1;
  const stock = supply.stock; advance(game, 3);
  assert.ok(tank.hp > 100); assert.ok(tank.ammo > 1); assert.ok(supply.stock < stock);
  supply.stock = 0; const hp = tank.hp, ammo = tank.ammo; advance(game, 2);
  assert.equal(tank.hp, hp); assert.equal(tank.ammo, ammo);
  applyCommand(game, 'alice', { type: 'resupply', unitIds: [tank.id] });
  assert.equal(tank.order, 'resupply'); assert.deepEqual(tank.target, MAP.spawns[0]);
});

test('transport boarding, movement and disembarking preserve ownership and passengers', () => {
  const game = pvp(), infantry = unit(game, 'alice', 'infantry');
  const transportId = applyCommand(game, 'alice', { type: 'deploy', unitType: 'transport' }).unitId;
  const transport = game.units.find(u => u.id === transportId);
  only(game, [infantry, transport]); position(infantry, 400, 500); position(transport, 420, 500);
  assert.equal(applyCommand(game, 'alice', { type: 'load', unitIds: [infantry.id], transportId }).ok, true);
  assert.equal(infantry.loadedIn, transportId);
  applyCommand(game, 'alice', { type: 'move', unitIds: [transportId], x: 620, y: 500 }); advance(game, 3);
  assert.equal(infantry.x, transport.x);
  assert.equal(applyCommand(game, 'alice', { type: 'unload', unitIds: [transportId] }).ok, true);
  assert.equal(infantry.loadedIn, null); assert.equal(transport.cargo.length, 0);
  assert.ok(Math.hypot(infantry.x - transport.x, infantry.y - transport.y) < 45);
});

test('artillery executes indirect area fire and suppresses enemy near impact', () => {
  const game = pvp(); game.players[0].credits = 1000;
  const id = applyCommand(game, 'alice', { type: 'deploy', unitType: 'artillery' }).unitId;
  const gun = game.units.find(u => u.id === id), target = unit(game, 'bob', 'tank');
  only(game, [gun, target]); position(gun, 420, 500); position(target, 800, 500); target.ammo = 0;
  assert.equal(applyCommand(game, 'alice', { type: 'fire', unitIds: [id], x: 440, y: 500 }).ok, false);
  assert.equal(applyCommand(game, 'alice', { type: 'fire', unitIds: [id], x: 800, y: 500 }).ok, true);
  advance(game, 3);
  assert.ok(gun.ammo < UNIT_TYPES.artillery.ammo);
  assert.ok(target.hp < UNIT_TYPES.tank.hp);
  assert.ok(target.suppression > 0.15);
  assert.ok(game.events.some(e => e.type === 'explosion'));
});

test('only ground capture units take sectors, contested sectors block capture, tickets win', () => {
  const game = pvp(); game.players[0].credits = 1000;
  const airId = applyCommand(game, 'alice', { type: 'deploy', unitType: 'jet' }).unitId;
  const air = game.units.find(u => u.id === airId), infantry = unit(game, 'alice', 'infantry'), rival = unit(game, 'bob', 'infantry');
  only(game, [air]); position(air, 810, 500); advance(game, 15);
  const center = game.sectors.find(s => s.id === 'center'); assert.equal(center.owner, null);
  game.units.push(infantry, rival); position(infantry, 810, 500); position(rival, 810, 530); infantry.ammo = 0; rival.ammo = 0; air.ammo = 0;
  advance(game, 15); assert.equal(center.owner, null); assert.equal(center.contested, true);
  position(rival, 1300, 700); advance(game, 10);
  assert.equal(center.owner, 0); assert.ok(game.tickets[1] < RULES.tickets);
  game.tickets[1] = 0.2; advance(game, 1);
  assert.equal(game.status, 'finished'); assert.equal(game.winner, 0); assert.equal(game.reason, 'tickets');
});

test('AI deploys, disputes objectives and does not react to invisible enemy locations', () => {
  const a = createGame({ seed: 129 }), b = createGame({ seed: 129 });
  a.units.filter(u => u.team === 0).forEach((u, i) => position(u, 40 + i * 5, 40));
  b.units.filter(u => u.team === 0).forEach((u, i) => position(u, 40 + i * 5, 940));
  advance(a, 8); advance(b, 8);
  const aiOnly = g => g.units.filter(u => u.team === 1).map(u => ({ id: u.id, type: u.type, x: u.x, y: u.y, order: u.order, target: u.target }));
  assert.deepEqual(aiOnly(a), aiOnly(b));
  assert.ok(a.units.filter(u => u.team === 1).length > 4);
  assert.ok(a.units.filter(u => u.team === 1).some(u => u.x < 1300));
  const c = createGame({ seed: 129 });
  c.players[0].credits = 1000;
  const airId = applyCommand(c, 'player1', { type: 'deploy', unitType: 'helicopter' }).unitId;
  position(c.units.find(u => u.id === airId), 1290, 500);
  advance(c, 1);
  assert.ok(c.units.some(u => u.ownerId === 'ai' && u.type === 'aa'));
});

test('seeded solo simulation is deterministic, bounded and completes a whole match', () => {
  const a = createGame({ seed: 55, duration: 120 }), b = createGame({ seed: 55, duration: 120 });
  const orderA = a.units.filter(u => u.ownerId === 'player1' && u.type !== 'supply').map(u => u.id);
  applyCommand(a, 'player1', { type: 'attackMove', unitIds: orderA, x: 810, y: 500 });
  applyCommand(b, 'player1', { type: 'attackMove', unitIds: orderA, x: 810, y: 500 });
  advance(a, 120); advance(b, 120);
  assert.deepEqual(snapshotFor(a, 'player1'), snapshotFor(b, 'player1'));
  assert.equal(a.status, 'finished');
  assert.ok(a.units.length <= RULES.maxUnits);
  assert.ok(a.units.every(u => Number.isFinite(u.x) && Number.isFinite(u.hp) && u.hp > 0));
  assert.ok(a.sectors.some(s => s.owner !== null));
});

test('surrender is authoritative and finished states reject further commands', () => {
  const game = pvp();
  assert.equal(applyCommand(game, 'alice', { type: 'surrender' }).ok, true);
  assert.equal(game.winner, 1); assert.equal(game.reason, 'surrender');
  const before = JSON.stringify(game);
  stepGame(game);
  assert.equal(JSON.stringify(game), before);
  assert.equal(applyCommand(game, 'bob', { type: 'deploy', unitType: 'infantry' }).ok, false);
  const coop = createGame({ mode: 'coop', players });
  applyCommand(coop, 'alice', { type: 'surrender' }); assert.equal(coop.status, 'playing');
  applyCommand(coop, 'bob', { type: 'surrender' }); assert.equal(coop.winner, 1);
});
