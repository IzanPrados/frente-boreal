import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyCommand, stepGame, snapshotFor } from '../shared/sim.mjs';
import { UNIT_TYPES } from '../shared/data.mjs';
import { VEGETATION_PRESETS } from '../shared/terrain.mjs';

const players = [{ id: 'alice', team: 0 }, { id: 'bob', team: 1 }];
const unit = (game, owner, type = 'infantry') => game.units.find(unit => unit.ownerId === owner && unit.type === type);
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 10); i++) stepGame(game, 0.1); };
const position = (unit, x, y) => Object.assign(unit, { x, y, path: [], order: 'stop', target: null, cooldown: 0, combatTargetId: null, combatPaused: false, nextTargetScan: 0 });
function openGame(extra = {}) {
  const game = createGame({ mode: 'pvp', players, config: { duration: 3600, ...extra } });
  game.map = { ...game.map, terrain: [], buildings: [] };
  return game;
}

test('infantry balance changes vision and fire independently while preserving every other class', () => {
  assert.equal(UNIT_TYPES.infantry.range, 185);
  assert.equal(UNIT_TYPES.infantry.vision, 250);
  assert.equal(UNIT_TYPES.infantry.speed, 35);
  assert.equal(UNIT_TYPES.infantry.damage, 17);
  assert.equal(UNIT_TYPES.infantry.cost, 90);
  const expected = { tank: [255, 185], transport: [120, 175], recon: [165, 350], supply: [0, 150], artillery: [510, 150], aa: [310, 255], helicopter: [220, 260], jet: [250, 285] };
  for (const [type, values] of Object.entries(expected)) assert.deepEqual([UNIT_TYPES[type].range, UNIT_TYPES[type].vision], values);
});

test('infantry fires within the expanded range but only observes the wider vision band', () => {
  for (const [distance, detected, fires] of [[180, true, true], [240, true, false], [260, false, false]]) {
    const game = openGame(), troop = unit(game, 'alice'), enemy = unit(game, 'bob', 'tank');
    game.units = [troop, enemy]; position(troop, 600, 500); position(enemy, 600 + distance, 500); enemy.ammo = 0;
    assert.equal(snapshotFor(game, 'alice').units.some(unit => unit.id === enemy.id), detected, `distance ${distance}`);
    advance(game, 0.5);
    assert.equal(troop.ammo < UNIT_TYPES.infantry.ammo, fires, `distance ${distance}`);
    if (!fires) {
      applyCommand(game, 'alice', { type: 'move', unitIds: [troop.id], x: 400, y: 500 });
      advance(game, 0.5);
      assert.ok(troop.x < 600); assert.equal(troop.combatPaused, false);
    }
  }
});

test('new infantry range still needs an unobstructed direct firing line and a compatible weapon', () => {
  const game = openGame(), troop = unit(game, 'alice'), enemy = unit(game, 'bob', 'tank'), observer = unit(game, 'alice', 'recon');
  game.map = { ...game.map, buildings: [{ id: 'wall', x: 665, y: 455, w: 30, h: 90, height: 16, capacity: 0, doors: [], firePoints: [] }] };
  game.units = [troop, enemy, observer]; position(troop, 600, 500); position(enemy, 775, 500); position(observer, 820, 560); enemy.ammo = 0; observer.ammo = 0;
  assert.ok(snapshotFor(game, 'alice').units.some(unit => unit.id === enemy.id), 'ally sees the enemy behind the wall');
  applyCommand(game, 'alice', { type: 'move', unitIds: [troop.id], x: 400, y: 500 }); advance(game, 1);
  assert.equal(troop.ammo, UNIT_TYPES.infantry.ammo); assert.equal(troop.combatPaused, false); assert.ok(troop.x < 580);
  const air = openGame(), soldier = unit(air, 'alice');
  const id = applyCommand(air, 'bob', { type: 'deploy', unitType: 'helicopter' }).unitId;
  const helicopter = air.units.find(unit => unit.id === id);
  air.units = [soldier, helicopter]; position(soldier, 600, 500); position(helicopter, 760, 500); helicopter.ammo = 0;
  advance(air, 1);
  assert.equal(soldier.ammo, UNIT_TYPES.infantry.ammo, 'infantry cannot acquire an air target');
});

test('permission defaults off and malformed or unauthorized snapshot requests cannot reveal units', () => {
  const denied = openGame();
  assert.equal(denied.config.allowEnemyReveal, false);
  for (const value of [true, false, 1, 'true', null]) {
    const state = snapshotFor(denied, 'alice', { revealEnemies: value });
    assert.equal(state.revealEnemies, false);
    assert.ok(state.units.every(unit => unit.team === 0));
  }
  const allowed = openGame({ allowEnemyReveal: true });
  assert.equal(snapshotFor(allowed, 'alice').revealEnemies, false);
  assert.equal(snapshotFor(allowed, 'alice', { revealEnemies: 'true' }).revealEnemies, false);
  assert.throws(() => snapshotFor(allowed, 'intruder', { revealEnemies: true }));
});

test('authorized reveal is a pure viewer projection and hiding returns to current normal visibility', () => {
  const game = openGame({ allowEnemyReveal: true });
  const enemy = unit(game, 'bob');
  const before = JSON.stringify(game);
  const normal = snapshotFor(game, 'alice');
  const shown = snapshotFor(game, 'alice', { revealEnemies: true });
  assert.equal(JSON.stringify(game), before, 'requesting revealed data must not mutate any game state');
  assert.equal(shown.revealEnemies, true);
  assert.equal(shown.units.length, game.units.length);
  for (const unit of shown.units.filter(unit => unit.team === 1)) {
    assert.equal(unit.detected, false); assert.equal(unit.displayOnly, true);
    assert.equal(unit.order, null); assert.equal(unit.target, null); assert.equal(unit.ammo, null); assert.equal(unit.pendingBuildingId, null);
    assert.equal(unit.combatTargetId, null); assert.deepEqual(unit.cargo, []);
  }
  assert.deepEqual(snapshotFor(game, 'alice'), normal);
  assert.equal(snapshotFor(game, 'bob').revealEnemies, false, 'another player has an independent projection');
  position(enemy, 1300, 800);
  const hidden = snapshotFor(game, 'alice', { revealEnemies: false });
  assert.ok(!hidden.units.some(unit => unit.id === enemy.id));
  assert.equal(hidden.units.length, normal.units.length);
});

test('a normally detected enemy remains distinct from one shown only by reveal', () => {
  const game = openGame({ allowEnemyReveal: true }), troop = unit(game, 'alice'), close = unit(game, 'bob'), far = unit(game, 'bob', 'tank');
  game.units = [troop, close, far]; position(troop, 600, 500); position(close, 830, 500); position(far, 1400, 500);
  const state = snapshotFor(game, 'alice', { revealEnemies: true });
  assert.deepEqual([state.units.find(unit => unit.id === close.id).detected, state.units.find(unit => unit.id === close.id).displayOnly], [true, false]);
  assert.deepEqual([state.units.find(unit => unit.id === far.id).detected, state.units.find(unit => unit.id === far.id).displayOnly], [false, true]);
});

test('revealed targets hidden by vegetation never become automatic combat targets', () => {
  const game = openGame({ allowEnemyReveal: true }), troop = unit(game, 'alice'), enemy = unit(game, 'bob', 'tank');
  game.map = { ...game.map, terrain: [{ id: 'dense', type: 'forest', x: 710, y: 450, w: 120, h: 100, ...VEGETATION_PRESETS.dense }] };
  game.units = [troop, enemy]; position(troop, 600, 500); position(enemy, 770, 500); enemy.ammo = 0;
  assert.ok(!snapshotFor(game, 'alice').units.some(unit => unit.id === enemy.id));
  assert.equal(snapshotFor(game, 'alice', { revealEnemies: true }).units.find(unit => unit.id === enemy.id).displayOnly, true);
  applyCommand(game, 'alice', { type: 'move', unitIds: [troop.id], x: 400, y: 500 });
  for (let i = 0; i < 20; i++) { snapshotFor(game, 'alice', { revealEnemies: true }); stepGame(game, 0.1); }
  assert.equal(troop.ammo, UNIT_TYPES.infantry.ammo); assert.equal(troop.combatPaused, false); assert.equal(troop.combatTargetId, null);
  assert.ok(troop.x < 550);
});

test('reveal requests do not change AI decisions, targeting, economy or seeded results', () => {
  const a = createGame({ seed: 4182, config: { allowEnemyReveal: true, duration: 3600 } });
  const b = createGame({ seed: 4182, config: { allowEnemyReveal: true, duration: 3600 } });
  for (let i = 0; i < 600; i++) {
    snapshotFor(a, 'player1', { revealEnemies: i % 3 !== 0 });
    stepGame(a, 0.1); stepGame(b, 0.1);
  }
  assert.deepEqual(a, b);
  assert.deepEqual(snapshotFor(a, 'player1'), snapshotFor(b, 'player1'));
});

test('revealed garrisons expose shown occupants consistently but never pending reservations or orders', () => {
  const game = createGame({ mode: 'pvp', players, config: { allowEnemyReveal: true, duration: 3600 } });
  const building = game.map.buildings.find(building => building.capacity > 0);
  const own = unit(game, 'alice', 'recon'), enemy = unit(game, 'bob');
  game.units = [own, enemy]; position(own, 30, 950); position(enemy, building.doors[0].x, building.doors[0].y);
  assert.equal(applyCommand(game, 'bob', { type: 'garrison', unitIds: [enemy.id], buildingId: building.id }).ok, true);
  const pending = snapshotFor(game, 'alice', { revealEnemies: true });
  assert.equal(pending.units.find(unit => unit.id === enemy.id).pendingBuildingId, null);
  assert.equal(pending.buildings.find(item => item.id === building.id).reserved, null);
  assert.equal(pending.buildings.find(item => item.id === building.id).occupied, null);
  advance(game, 0.2);
  assert.equal(enemy.garrisonedIn, building.id);
  const normal = snapshotFor(game, 'alice');
  assert.ok(!normal.units.some(unit => unit.id === enemy.id));
  const shown = snapshotFor(game, 'alice', { revealEnemies: true });
  const occupied = shown.buildings.find(item => item.id === building.id);
  assert.deepEqual({ team: occupied.team, known: occupied.known, observed: occupied.observed, displayOnly: occupied.displayOnly, occupied: occupied.occupied, reserved: occupied.reserved, occupantIds: occupied.occupantIds }, { team: 1, known: false, observed: false, displayOnly: true, occupied: 1, reserved: null, occupantIds: [enemy.id] });
  assert.equal(shown.units.find(unit => unit.id === enemy.id).garrisonedIn, building.id);
  assert.equal(shown.units.find(unit => unit.id === enemy.id).displayOnly, true);
  assert.deepEqual(snapshotFor(game, 'alice'), normal);
});
