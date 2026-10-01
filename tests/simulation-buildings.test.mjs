import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyCommand, stepGame, snapshotFor, groundPassable, buildingAt } from '../shared/sim.mjs';
import { VEGETATION_PRESETS } from '../shared/terrain.mjs';
import { UNIT_TYPES } from '../shared/data.mjs';

const players = [{ id: 'alice', team: 0 }, { id: 'bob', team: 1 }];
const house = (id = 'house', x = 600, y = 460, w = 80, h = 80, capacity = 2) => ({
  id, name: id, x, y, w, h, height: 16, occupiable: capacity > 0, capacity, protection: 0.45,
  doors: [{ x: x - 12, y: y + h / 2 }, { x: x + w + 12, y: y + h / 2 }, { x: x + w / 2, y: y - 12 }, { x: x + w / 2, y: y + h + 12 }],
  firePoints: [{ x: x - 4, y: y + h / 2 }, { x: x + w + 4, y: y + h / 2 }, { x: x + w / 2, y: y - 4 }, { x: x + w / 2, y: y + h + 4 }],
});
function fixture(buildings = [house()], terrain = [], mode = 'pvp') {
  const game = createGame({ mode, players: mode === 'pvp' ? players : [players[0]], duration: 3600 });
  game.map = { ...game.map, id: 'isolated-building-fixture', buildings, terrain };
  return game;
}
const unit = (game, owner = 'alice', type = 'infantry') => game.units.find(u => u.ownerId === owner && u.type === type);
const position = (unit, x, y) => Object.assign(unit, { x, y, path: [], order: 'stop', target: null, garrisonedIn: null, pendingBuildingId: null, combatPaused: false, combatTargetId: null, nextTargetScan: 0, cooldown: 0 });
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 10); i++) stepGame(game, 0.1); };
const command = (game, troop, type, extra = {}) => applyCommand(game, troop.ownerId, { type, unitIds: [troop.id], ...extra });
function enter(game, troop, buildingId = 'house') {
  assert.equal(command(game, troop, 'garrison', { buildingId }).ok, true);
  for (let i = 0; i < 600 && !troop.garrisonedIn; i++) stepGame(game, 0.1);
  assert.equal(troop.garrisonedIn, buildingId);
}

test('solid building footprints block ground routes while roads remain usable around them', () => {
  const game = fixture(), scout = unit(game, 'alice', 'recon'); game.units = [scout]; position(scout, 500, 500);
  assert.equal(groundPassable(640, 500, game.map), false);
  assert.equal(buildingAt(640, 500, game.map).id, 'house');
  assert.equal(command(game, scout, 'move', { x: 780, y: 500 }).ok, true);
  assert.ok(scout.path.length > 1);
  for (let i = 0; i < 150 && scout.path.length; i++) { stepGame(game, 0.1); assert.equal(groundPassable(scout.x, scout.y, game.map), true); }
  assert.ok(Math.hypot(scout.x - 780, scout.y - 500) < 0.01);
});

test('a target behind a wall can be detected by an ally without permitting direct fire or a futile movement stop', () => {
  const game = fixture(), tank = unit(game, 'alice', 'tank'), enemy = unit(game, 'bob', 'tank'), observer = unit(game, 'alice', 'recon');
  position(tank, 540, 500); position(enemy, 740, 500); enemy.ammo = 0; game.units = [tank, enemy];
  assert.ok(!snapshotFor(game, 'alice').units.some(u => u.id === enemy.id));
  position(observer, 735, 625); observer.cooldown = 100; game.units.push(observer);
  assert.ok(snapshotFor(game, 'alice').units.some(u => u.id === enemy.id));
  const ammo = tank.ammo;
  command(game, tank, 'move', { x: 400, y: 500 }); advance(game, 1);
  assert.equal(tank.combatPaused, false);
  assert.ok(tank.x < 510);
  assert.equal(tank.ammo, ammo);
});

test('aerial visibility and direct fire respect the height of intervening buildings', () => {
  const shot = height => {
    const building = { ...house(), height }, game = fixture([building]);
    const id = applyCommand(game, 'alice', { type: 'deploy', unitType: 'jet' }).unitId;
    const aircraft = game.units.find(unit => unit.id === id), enemy = unit(game, 'bob');
    game.units = [aircraft, enemy]; position(aircraft, 550, 500); position(enemy, 740, 500); enemy.ammo = 0;
    advance(game, 0.3);
    return aircraft.ammo < UNIT_TYPES.jet.ammo;
  };
  assert.equal(shot(16), true, 'the ray passes above the low roof');
  assert.equal(shot(80), false, 'the taller building intersects the ray');
});

test('isolated trees attenuate detection modestly while dense vegetation conceals and obstructs', () => {
  const visible = preset => {
    const game = fixture([], [{ id: 'vegetation', type: 'forest', x: 400, y: 450, w: 240, h: 100, ...VEGETATION_PRESETS[preset] }]);
    const scout = unit(game, 'alice', 'recon'), enemy = unit(game, 'bob', 'infantry');
    position(scout, 380, 500); position(enemy, 650, 500); game.units = [scout, enemy];
    return snapshotFor(game, 'alice').units.some(u => u.id === enemy.id);
  };
  assert.equal(visible('isolated'), true);
  assert.equal(visible('dense'), false);
  const partial = preset => {
    const game = fixture([], [{ id: 'screen', type: 'forest', x: 450, y: 450, w: 100, h: 100, ...VEGETATION_PRESETS[preset] }]);
    const scout = unit(game, 'alice', 'recon'), enemy = unit(game, 'bob', 'infantry');
    position(scout, 300, 500); position(enemy, 640, 500); game.units = [scout, enemy];
    return snapshotFor(game, 'alice').units.some(u => u.id === enemy.id);
  };
  assert.equal(partial('isolated'), false, 'a sparse intervening stand still shortens the detection distance');
});

test('entry reserves a place but walks to a door before applying occupation; state is not reset', () => {
  const game = fixture(), troop = unit(game); game.units = [troop]; position(troop, 380, 500);
  Object.assign(troop, { hp: 76, ammo: 9, suppression: 0.6, cooldown: 20 });
  assert.equal(command(game, troop, 'garrison', { buildingId: 'house' }).ok, true);
  assert.equal(troop.garrisonedIn, null);
  assert.equal(troop.pendingBuildingId, 'house');
  assert.equal(troop.x, 380);
  assert.deepEqual([troop.hp, troop.ammo, troop.suppression, troop.cooldown], [76, 9, 0.6, 20]);
  advance(game, 1);
  assert.ok(troop.x > 380 && troop.x < 430);
  assert.equal(troop.garrisonedIn, null);
  for (let i = 0; i < 200 && !troop.garrisonedIn; i++) {
    const previous = { x: troop.x, y: troop.y, suppression: troop.suppression, cooldown: troop.cooldown };
    stepGame(game, 0.1);
    if (troop.garrisonedIn) {
      assert.ok(game.map.buildings[0].doors.some(door => Math.hypot(previous.x - door.x, previous.y - door.y) < 5));
      assert.ok(Math.abs(troop.suppression - Math.max(0, previous.suppression - 0.0075)) < 1e-8);
      assert.ok(Math.abs(troop.cooldown - Math.max(0, previous.cooldown - 0.1)) < 1e-8);
    } else assert.equal(groundPassable(troop.x, troop.y, game.map), true);
  }
  assert.equal(troop.garrisonedIn, 'house');
  assert.equal(troop.pendingBuildingId, null);
  assert.deepEqual([troop.hp, troop.ammo], [76, 9]);
  const state = snapshotFor(game, 'alice').buildings[0];
  assert.deepEqual([state.occupied, state.reserved, state.occupantIds], [1, 0, [troop.id]]);
});

test('capacity reservations are atomic, hostile teams cannot share, cancellation and death free places', () => {
  const game = fixture([house('house', 600, 460, 80, 80, 1)]), first = unit(game), enemy = unit(game, 'bob');
  const deployed = applyCommand(game, 'alice', { type: 'deploy', unitType: 'infantry' });
  const second = game.units.find(u => u.id === deployed.unitId); game.units = [first, second, enemy];
  position(first, 400, 500); position(second, 410, 540); position(enemy, 900, 500);
  assert.equal(applyCommand(game, 'alice', { type: 'garrison', unitIds: [first.id, second.id], buildingId: 'house' }).ok, false);
  assert.equal(first.pendingBuildingId, null); assert.equal(second.pendingBuildingId, null);
  assert.equal(command(game, first, 'garrison', { buildingId: 'house' }).ok, true);
  assert.equal(command(game, second, 'garrison', { buildingId: 'house' }).ok, false);
  assert.equal(command(game, enemy, 'garrison', { buildingId: 'house' }).ok, false);
  command(game, first, 'stop');
  assert.equal(command(game, second, 'garrison', { buildingId: 'house' }).ok, true);
  second.hp = 0;
  assert.equal(command(game, enemy, 'garrison', { buildingId: 'house' }).ok, true);
  assert.equal(snapshotFor(game, 'alice').buildings[0].reserved, null, 'hidden enemy reservation must not be disclosed');
});

test('occupation protection starts inside and occupants remain vulnerable', () => {
  function damage(inside) {
    const game = fixture(), troop = unit(game), attacker = unit(game, 'bob');
    game.units = [troop]; position(troop, 570, 500); troop.ammo = 0;
    if (inside) enter(game, troop);
    else command(game, troop, 'garrison', { buildingId: 'house' });
    troop.hp = UNIT_TYPES.infantry.hp;
    position(attacker, 500, 500); game.units.push(attacker); game.rng = 42;
    stepGame(game, 0.1);
    return UNIT_TYPES.infantry.hp - troop.hp;
  }
  const exposed = damage(false), protectedDamage = damage(true);
  assert.ok(exposed > 0 && protectedDamage > 0);
  assert.ok(protectedDamage < exposed * 0.6);
});

test('occupants fire from exterior windows, can be attacked, and another building still blocks them', () => {
  const game = fixture(), troop = unit(game), enemy = unit(game, 'bob', 'tank'), observer = unit(game, 'alice', 'recon');
  game.units = [troop]; position(troop, 575, 500); enter(game, troop);
  position(enemy, 500, 500); enemy.ammo = 0; game.units.push(enemy); troop.cooldown = 0;
  advance(game, 0.3);
  assert.ok(troop.ammo < UNIT_TYPES.infantry.ammo);
  const shot = game.events.find(event => event.type === 'shot' && event.team === 0);
  assert.ok(shot && !buildingAt(shot.x, shot.y, game.map));
  assert.ok(enemy.hp < UNIT_TYPES.tank.hp);
  const blocking = house('blocking', 520, 430, 20, 140, 0);
  game.map = { ...game.map, buildings: [...game.map.buildings, blocking] };
  position(observer, 480, 590); observer.cooldown = 100; game.units.push(observer); position(enemy, 475, 500); enemy.ammo = 0;
  assert.ok(snapshotFor(game, 'alice').units.some(unit => unit.id === enemy.id));
  const ammo = troop.ammo; troop.cooldown = 0; advance(game, 1);
  assert.equal(troop.ammo, ammo);
});

test('exits preserve state, use separate exterior positions, and move orders leave before travelling', () => {
  const game = fixture(), first = unit(game);
  const id = applyCommand(game, 'alice', { type: 'deploy', unitType: 'infantry' }).unitId;
  const second = game.units.find(unit => unit.id === id); game.units = [first, second];
  position(first, 575, 490); position(second, 575, 530);
  assert.equal(applyCommand(game, 'alice', { type: 'garrison', unitIds: [first.id, second.id], buildingId: 'house' }).ok, true);
  advance(game, 3);
  assert.ok(first.garrisonedIn && second.garrisonedIn);
  const before = [first, second].map(unit => ({ hp: unit.hp, ammo: unit.ammo, suppression: unit.suppression, cooldown: unit.cooldown }));
  assert.equal(applyCommand(game, 'alice', { type: 'exit', unitIds: [first.id, second.id] }).ok, true);
  [first, second].forEach((unit, i) => {
    assert.equal(unit.garrisonedIn, null); assert.equal(groundPassable(unit.x, unit.y, game.map), true);
    assert.deepEqual({ hp: unit.hp, ammo: unit.ammo, suppression: unit.suppression, cooldown: unit.cooldown }, before[i]);
  });
  assert.ok(Math.hypot(first.x - second.x, first.y - second.y) >= 10);
  enter(game, first);
  assert.equal(command(game, first, 'move', { x: 900, y: 500 }).ok, true);
  assert.equal(first.garrisonedIn, null); assert.equal(groundPassable(first.x, first.y, game.map), true);
  advance(game, 20);
  assert.ok(Math.hypot(first.x - 900, first.y - 500) < 0.01);
});

test('enemy occupation and reservation details stay hidden until occupants are detected', () => {
  const game = fixture(), own = unit(game, 'alice', 'recon'), enemy = unit(game, 'bob');
  position(own, 100, 100); position(enemy, 710, 500); game.units = [own, enemy]; enter(game, enemy);
  let state = snapshotFor(game, 'alice');
  assert.ok(!state.units.some(unit => unit.id === enemy.id));
  assert.deepEqual(state.buildings[0], { id: 'house', team: null, known: false, observed: false, occupied: null, reserved: null, occupantIds: [] });
  position(own, 750, 620);
  state = snapshotFor(game, 'alice');
  assert.ok(state.units.some(unit => unit.id === enemy.id && unit.garrisonedIn === 'house'));
  assert.equal(state.buildings[0].observed, true); assert.equal(state.buildings[0].reserved, null);
  assert.deepEqual(state.buildings[0].occupantIds, [enemy.id]);
});

test('blocked exits reject a subsequent move without losing the occupied state', () => {
  const game = fixture(), troop = unit(game); game.units = [troop]; position(troop, 575, 500); enter(game, troop);
  const building = game.map.buildings[0];
  let id = 100;
  for (const door of building.doors) for (const offset of [0, 14, -14, 28, -28, 42, -42, 56, -56]) {
    const horizontal = door.y < building.y || door.y > building.y + building.h;
    const blocker = { ...troop, id: `blocker${id++}`, type: 'supply', garrisonedIn: null, pendingBuildingId: null, x: door.x + (horizontal ? offset : 0), y: door.y + (horizontal ? 0 : offset) };
    game.units.push(blocker);
  }
  const before = JSON.stringify(troop);
  assert.equal(command(game, troop, 'move', { x: 900, y: 500 }).ok, false);
  assert.equal(JSON.stringify(troop), before);
});

test('AI infantry reserves and enters a useful building near a contested objective', () => {
  const game = fixture([house()], [], 'solo'), troop = unit(game, 'ai'), observer = unit(game, 'alice', 'recon');
  position(troop, 730, 500); position(observer, 100, 100); game.units = [troop, observer];
  game.sectors = [{ id: 'test-sector', name: 'Sector', x: 640, y: 580, radius: 130, owner: null, progress: 0, capturingTeam: null, contested: false }];
  let reserved = false, occupied = false;
  for (let i = 0; i < 70; i++) { stepGame(game, 0.1); reserved ||= troop.pendingBuildingId === 'house'; occupied ||= troop.garrisonedIn === 'house'; }
  assert.ok(reserved && occupied);
});
