import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyCommand, stepGame, snapshotFor } from '../shared/sim.mjs';
import { UNIT_TYPES } from '../shared/data.mjs';

const players = [{ id: 'alice', name: 'Alicia', team: 0 }, { id: 'bob', name: 'Bruno', team: 1 }];
const gameFor = () => createGame({ mode: 'pvp', players, duration: 3600 });
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 10); i++) stepGame(game, 0.1); };
const get = (game, owner, type) => game.units.find(u => u.ownerId === owner && u.type === type);
const keep = (game, units) => { game.units = units; };
const position = (unit, x, y) => Object.assign(unit, { x, y, order: 'stop', target: null, path: [], cooldown: 0, combatTargetId: null, combatPaused: false, targetLostAt: null, nextTargetScan: 0 });
const move = (game, unit, x, y, type = 'move') => applyCommand(game, unit.ownerId, { type, unitIds: [unit.id], x, y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('ordinary move stops before its destination, fires, then resumes the same route after a kill', () => {
  const game = gameFor(), tank = get(game, 'alice', 'tank'), enemy = get(game, 'bob', 'infantry');
  keep(game, [tank, enemy]); position(tank, 400, 500); position(enemy, 700, 500); enemy.ammo = 0; enemy.hp = 30;
  const destination = { x: 1000, y: 500 };
  assert.equal(move(game, tank, destination.x, destination.y).ok, true);
  let stoppedAt = null, observedShot = false;
  for (let i = 0; i < 180 && game.units.includes(enemy); i++) {
    const previous = { x: tank.x, y: tank.y };
    stepGame(game, 0.1);
    if (tank.combatPaused) {
      assert.equal(tank.moving, false);
      assert.deepEqual({ x: tank.x, y: tank.y }, previous);
      assert.deepEqual(tank.target, destination);
      assert.equal(tank.order, 'move');
      stoppedAt = { x: tank.x, y: tank.y };
    }
    observedShot ||= game.events.some(e => e.type === 'shot' && e.team === 0);
  }
  assert.ok(stoppedAt && stoppedAt.x > 400 && stoppedAt.x < 700);
  assert.ok(observedShot);
  assert.equal(enemy.hp, 0);
  advance(game, 20);
  assert.ok(distance(tank, destination) < 0.01);
  assert.equal(tank.target, null);
  assert.equal(tank.order, 'stop');
});

test('visible enemies outside weapon range do not stop or redirect a route', () => {
  const game = gameFor(), scout = get(game, 'alice', 'recon'), enemy = get(game, 'bob', 'tank');
  keep(game, [scout, enemy]); position(scout, 600, 500); position(enemy, 900, 500); enemy.ammo = 0;
  assert.ok(snapshotFor(game, 'alice').units.some(u => u.id === enemy.id));
  move(game, scout, 300, 500);
  advance(game, 2);
  assert.ok(scout.x < 450);
  assert.equal(scout.combatPaused, false);
  assert.deepEqual(scout.target, { x: 300, y: 500 });
  assert.equal(scout.ammo, UNIT_TYPES.recon.ammo);
});

test('hidden targets and blocked direct fire never interrupt movement', () => {
  const game = gameFor(), tank = get(game, 'alice', 'tank'), enemy = get(game, 'bob', 'tank');
  keep(game, [tank, enemy]); position(tank, 600, 500); position(enemy, 790, 500); enemy.ammo = 0;
  game.smokes.push({ id: 'test-smoke', x: 790, y: 500, radius: 75, until: 30, team: 1 });
  assert.ok(!snapshotFor(game, 'alice').units.some(u => u.id === enemy.id));
  move(game, tank, 360, 500);
  advance(game, 1);
  assert.ok(tank.x < 560);
  assert.equal(tank.ammo, UNIT_TYPES.tank.ammo);
  assert.equal(tank.combatPaused, false);

  const recon = get(gameFor(), 'alice', 'recon');
  position(tank, 600, 500); position(enemy, 780, 500); position(recon, 780, 630);
  game.units.push(recon); game.smokes = [{ id: 'between', x: 690, y: 500, radius: 35, until: 30, team: 1 }];
  assert.ok(snapshotFor(game, 'alice').units.some(u => u.id === enemy.id), 'allied scout reveals the target');
  const ammo = tank.ammo;
  move(game, tank, 360, 500); advance(game, 0.3);
  assert.ok(tank.x < 600, 'a revealed enemy behind blocking smoke is not a valid firing target');
  assert.equal(tank.ammo, ammo);
});

test('a valid retained target is stable when another enemy becomes closer', () => {
  const game = gameFor(), tank = get(game, 'alice', 'tank'), first = get(game, 'bob', 'tank'), second = get(game, 'bob', 'infantry');
  keep(game, [tank, first, second]); position(tank, 600, 500); position(first, 770, 500); position(second, 1300, 500);
  first.ammo = 0; second.ammo = 0; tank.cooldown = 100;
  move(game, tank, 1100, 500); advance(game, 0.2);
  assert.equal(tank.combatTargetId, first.id);
  position(second, 680, 500); advance(game, 1);
  assert.equal(tank.combatTargetId, first.id);
  first.hp = 0; advance(game, 0.3);
  assert.equal(tank.combatTargetId, second.id);
  assert.deepEqual(tank.target, { x: 1100, y: 500 });
});

test('brief loss does not make a unit stutter; a lost/out-of-range target resumes without pursuit', () => {
  const game = gameFor(), tank = get(game, 'alice', 'tank'), enemy = get(game, 'bob', 'tank');
  keep(game, [tank, enemy]); position(tank, 600, 500); position(enemy, 770, 500); enemy.ammo = 0; tank.cooldown = 100;
  move(game, tank, 400, 500); advance(game, 0.2);
  const stoppedX = tank.x;
  position(enemy, 1300, 500); advance(game, 0.3);
  assert.equal(tank.x, stoppedX);
  position(enemy, 770, 500); advance(game, 0.3);
  assert.equal(tank.x, stoppedX);
  assert.equal(tank.combatPaused, true);
  position(enemy, 1300, 500); advance(game, 1);
  assert.ok(tank.x < stoppedX, 'resumes its westward route instead of chasing east');
  assert.equal(tank.combatPaused, false);
  advance(game, 5);
  assert.ok(distance(tank, { x: 400, y: 500 }) < 0.01);
});

test('replacement orders discard the old destination and stop cancels pending movement', () => {
  for (const replacement of ['move', 'stop']) {
    const game = gameFor(), tank = get(game, 'alice', 'tank'), enemy = get(game, 'bob', 'tank');
    keep(game, [tank, enemy]); position(tank, 600, 500); position(enemy, 770, 500); enemy.ammo = 0; tank.cooldown = 100;
    move(game, tank, 1100, 500); advance(game, 0.2);
    assert.equal(tank.combatPaused, true);
    assert.equal(move(game, tank, 400, 500, replacement).ok, true);
    assert.deepEqual(tank.target, replacement === 'stop' ? null : { x: 400, y: 500 });
    enemy.hp = 0; advance(game, 8);
    assert.ok(distance(tank, { x: replacement === 'stop' ? 600 : 400, y: 500 }) < 0.01);
    assert.equal(tank.target, null);
    assert.equal(tank.path.length, 0);
  }
});

test('groups pause and resume independently while retaining their formation destinations', () => {
  const game = gameFor(), tank = get(game, 'alice', 'tank'), infantry = get(game, 'alice', 'infantry'), enemy = get(game, 'bob', 'tank');
  keep(game, [tank, infantry, enemy]); position(tank, 600, 500); position(infantry, 620, 500); position(enemy, 745, 500);
  tank.cooldown = 100; infantry.cooldown = 100; enemy.ammo = 0;
  assert.equal(applyCommand(game, 'alice', { type: 'move', unitIds: [tank.id, infantry.id], x: 1000, y: 500 }).ok, true);
  const destinations = [tank, infantry].map(u => ({ ...u.target }));
  advance(game, 0.5);
  for (const [index, unit] of [tank, infantry].entries()) {
    assert.equal(unit.combatPaused, true);
    assert.deepEqual(unit.target, destinations[index]);
    const state = snapshotFor(game, 'alice').units.find(u => u.id === unit.id);
    assert.equal(state.combatPaused, true);
    assert.equal(state.combatTargetId, enemy.id);
    assert.deepEqual(state.target, destinations[index]);
    const enemyView = snapshotFor(game, 'bob').units.find(u => u.id === unit.id);
    assert.equal(enemyView.combatTargetId, null);
    assert.equal(enemyView.target, null);
  }
  enemy.hp = 0; advance(game, 15);
  [tank, infantry].forEach((unit, index) => assert.ok(distance(unit, destinations[index]) < 0.01));
});

test('unarmed logistics, empty weapons, incompatible targets and resupply routes keep moving', () => {
  const game = gameFor(), tank = get(game, 'alice', 'tank'), supply = get(game, 'alice', 'supply'), enemy = get(game, 'bob', 'tank');
  game.players[0].credits = 1000;
  const aaId = applyCommand(game, 'alice', { type: 'deploy', unitType: 'aa' }).unitId;
  const aa = game.units.find(u => u.id === aaId);
  keep(game, [tank, supply, aa, enemy]);
  position(tank, 600, 500); position(supply, 600, 535); position(aa, 600, 465); position(enemy, 735, 500);
  tank.ammo = 0; enemy.ammo = 0;
  for (const unit of [tank, supply, aa]) move(game, unit, 400, unit.y);
  advance(game, 0.5);
  for (const unit of [tank, supply, aa]) { assert.ok(unit.x < 590); assert.equal(unit.combatPaused, false); }
  position(tank, 600, 500); tank.ammo = UNIT_TYPES.tank.ammo;
  keep(game, [tank, enemy]);
  applyCommand(game, 'alice', { type: 'resupply', unitIds: [tank.id] }); advance(game, 0.5);
  assert.equal(tank.combatPaused, false);
  assert.ok(tank.x < 590);
});

test('artillery minimum range prevents a futile automatic stop', () => {
  const game = gameFor(); game.players[0].credits = 1000;
  const id = applyCommand(game, 'alice', { type: 'deploy', unitType: 'artillery' }).unitId;
  const gun = game.units.find(u => u.id === id), enemy = get(game, 'bob', 'tank');
  keep(game, [gun, enemy]); position(gun, 600, 500); position(enemy, 650, 500); enemy.ammo = 0;
  move(game, gun, 630, 500); advance(game, 1);
  assert.equal(gun.combatPaused, false);
  assert.equal(gun.ammo, UNIT_TYPES.artillery.ammo);
  assert.equal(gun.x, 630);
});
