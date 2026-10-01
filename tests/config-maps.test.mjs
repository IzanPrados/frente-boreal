import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, INCOME_MULTIPLIERS, normalizeConfig, validateConfig } from '../shared/config.mjs';
import { MAPS, DEFAULT_MAP_ID, getMap, isMapId } from '../shared/maps.mjs';
import { MAP, RULES } from '../shared/data.mjs';
import { createGame, applyCommand, stepGame, terrainAt as simulatedTerrainAt, groundPassable } from '../shared/sim.mjs';
import { containsPoint, segmentRectangleInterval, VEGETATION_PRESETS, vegetationAt } from '../shared/terrain.mjs';

test('default configuration preserves the existing compact scenario and economy', () => {
  assert.deepEqual(validateConfig(undefined), { ok: true, config: DEFAULT_CONFIG });
  assert.equal(DEFAULT_CONFIG.mapId, DEFAULT_MAP_ID);
  assert.equal(DEFAULT_CONFIG.startingResources, RULES.startCredits);
  assert.equal(DEFAULT_CONFIG.incomeMultiplier, 1);
  assert.equal(DEFAULT_CONFIG.maxUnits, RULES.maxUnits);
  assert.equal(DEFAULT_CONFIG.duration, RULES.defaultDuration);
  assert.equal(DEFAULT_CONFIG.tickets, RULES.tickets);
  const compact = getMap();
  for (const original of MAP.terrain) {
    const retained = compact.terrain.find(feature => feature.id === original.id);
    assert.ok(retained, `Original terrain ${original.id} must remain`);
    for (const key of ['x', 'y', 'w', 'h', 'type']) assert.equal(retained[key], original[key]);
  }
  assert.deepEqual(compact.spawns, MAP.spawns);
  assert.deepEqual(compact.sectors, MAP.sectors);
});

test('strict configuration rejects invalid values instead of silently changing a network match', () => {
  for (const input of [null, [], '', true, 12]) assert.equal(validateConfig(input).ok, false);
  const invalid = {
    startingResources: [-1, 10001, 0.5, NaN, Infinity, '410', null],
    incomeMultiplier: [-1, 0, 0.25, 1.5, 6, NaN, Infinity, '2'],
    maxUnits: [0, 23, 121, 32.5, '120'],
    duration: [-1, 179, 3601, 500.5, '720'],
    tickets: [0, 99, 2001, 101.5, '300'],
    mapId: ['', '__proto__', 'missing-map', 1, null],
  };
  for (const [field, values] of Object.entries(invalid)) for (const value of values) {
    const result = validateConfig({ [field]: value });
    assert.equal(result.ok, false, `${field}=${String(value)} must fail`);
    assert.equal(typeof result.error, 'string');
    assert.ok(!Object.hasOwn(result, 'config'), 'Failed validation must not return a usable config');
  }
  assert.equal(validateConfig({ priceMultiplier: 2 }).ok, false);
  assert.equal(validateConfig(JSON.parse('{"__proto__":{"startingResources":99999}}')).ok, false);
});

test('all supported multipliers, maps and boundary values round-trip without modifying unrelated fields', () => {
  for (const map of MAPS) for (const multiplier of INCOME_MULTIPLIERS) {
    const result = validateConfig({ mapId: map.id, incomeMultiplier: multiplier });
    assert.equal(result.ok, true);
    assert.deepEqual(result.config, { ...DEFAULT_CONFIG, mapId: map.id, incomeMultiplier: multiplier });
    assert.ok(Object.isFrozen(result.config));
  }
  for (const fields of [
    { startingResources: 0, maxUnits: 24, duration: 180, tickets: 100 },
    { startingResources: 10000, maxUnits: 120, duration: 3600, tickets: 2000 },
  ]) {
    assert.deepEqual(validateConfig(fields).config, { ...DEFAULT_CONFIG, ...fields });
  }
});

test('saved settings retain valid preferences and independently repair malformed or obsolete fields', () => {
  assert.deepEqual(normalizeConfig({ mapId: 'old-map', incomeMultiplier: 3, startingResources: -5, tickets: 600, oldOption: true }), {
    ...DEFAULT_CONFIG, incomeMultiplier: 3, tickets: 600,
  });
  assert.deepEqual(normalizeConfig('{malformed'), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  const old = { startingResources: 2000 };
  normalizeConfig(old);
  assert.deepEqual(old, { startingResources: 2000 }, 'Normalization must not mutate local preferences');
});

// This terrain inspection is intentionally independent of the simulation's
// navigation cache. It checks the authored map, including every dry grid cell,
// instead of asserting that a pathfinder produces its own cached result.
function terrainAt(map, x, y) {
  const contains = r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (map.terrain.some(r => r.type === 'road' && contains(r))) return 'road';
  if (map.terrain.some(r => r.type === 'water' && contains(r))) return 'water';
  return map.terrain.find(contains)?.type || 'open';
}

function gridFor(map, cell = 40) {
  const cols = map.width / cell, rows = map.height / cell;
  const point = i => ({ x: i % cols * cell + cell / 2, y: Math.floor(i / cols) * cell + cell / 2 });
  const index = p => Math.floor(p.y / cell) * cols + Math.floor(p.x / cell);
  const ground = Array.from({ length: cols * rows }, (_, i) => {
    const p = point(i);
    return terrainAt(map, p.x, p.y) !== 'water' && !map.buildings.some(building => containsPoint(p, building));
  });
  return { cols, rows, point, index, ground };
}

function flood(map) {
  const grid = gridFor(map), start = grid.index(map.spawns[0]);
  assert.ok(grid.ground[start]);
  const found = new Set([start]), pending = [start];
  while (pending.length) {
    const current = pending.pop(), x = current % grid.cols, y = Math.floor(current / grid.cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = ny * grid.cols + nx;
      if (nx < 0 || nx >= grid.cols || ny < 0 || ny >= grid.rows || !grid.ground[next] || found.has(next)) continue;
      if (map.buildings.some(building => segmentRectangleInterval(grid.point(current), grid.point(next), building))) continue;
      found.add(next); pending.push(next);
    }
  }
  return { ...grid, found };
}

test('map catalog retains three maps and adds a physically larger fourth scenario with solid settlements', () => {
  assert.equal(MAPS.length, 4);
  assert.equal(new Set(MAPS.map(map => map.id)).size, MAPS.length);
  assert.equal(isMapId('missing-map'), false);
  assert.equal(getMap('missing-map'), getMap());
  assert.ok(MAPS[2].width * MAPS[2].height >= MAPS[0].width * MAPS[0].height * 4);
  assert.equal(MAPS[2].sectors.length, 7);
  assert.equal(MAPS[3].width, 4800);
  assert.equal(MAPS[3].height, 3000);
  assert.equal(MAPS[3].width * MAPS[3].height / (MAPS[2].width * MAPS[2].height), 2.25);
  assert.equal(MAPS[3].sectors.length, 9);
  for (const map of MAPS) {
    assert.ok(Object.isFrozen(map) && Object.isFrozen(map.terrain[0]));
    assert.equal(map.width % 40, 0); assert.equal(map.height % 40, 0);
    assert.equal(map.spawns.length, 2);
    assert.equal(new Set(map.terrain.map(r => r.id)).size, map.terrain.length);
    assert.equal(new Set(map.sectors.map(r => r.id)).size, map.sectors.length);
    for (const feature of map.terrain) {
      assert.ok(['road', 'water', 'forest', 'town'].includes(feature.type));
      assert.ok(feature.w > 0 && feature.h > 0);
      assert.ok(feature.x >= 0 && feature.y >= 0 && feature.x + feature.w <= map.width && feature.y + feature.h <= map.height, `${map.id}/${feature.id} leaves map`);
    }
    for (const point of [...map.spawns, ...map.sectors]) {
      assert.ok(point.x >= 0 && point.x <= map.width && point.y >= 0 && point.y <= map.height);
      assert.notEqual(terrainAt(map, point.x, point.y), 'water', `${map.id}: objective/spawn lies in water`);
    }
  }
});

test('every dry grid cell, both deployment areas and every objective have a connected ground route', () => {
  for (const map of MAPS) {
    const grid = flood(map);
    assert.equal(grid.found.size, grid.ground.filter(Boolean).length, `${map.id}: inaccessible ground pocket`);
    for (const point of [...map.spawns, ...map.sectors]) assert.ok(grid.found.has(grid.index(point)), `${map.id}: unreachable objective or spawn`);
    for (const spawn of map.spawns) {
      for (let dy = -160; dy <= 160; dy += 40) for (let dx = -160; dx <= 160; dx += 40) {
        if (Math.hypot(dx, dy) > RULES.deploymentRadius) continue;
        const point = { x: spawn.x + dx, y: spawn.y + dy };
        assert.notEqual(terrainAt(map, point.x, point.y), 'water');
        assert.ok(grid.found.has(grid.index(point)), `${map.id}: isolated deployment cell`);
      }
    }
  }
});

test('new maps give both sides equal terrain, matching objective approaches and meaningful cover', () => {
  for (const map of MAPS.slice(1)) {
    const grid = gridFor(map);
    const terrainCounts = { road: 0, water: 0, forest: 0, town: 0, open: 0 };
    for (let i = 0; i < grid.ground.length; i++) {
      const p = grid.point(i), land = terrainAt(map, p.x, p.y);
      terrainCounts[land]++;
      assert.equal(land, terrainAt(map, map.width - p.x, map.height - p.y), `${map.id}: unfair terrain at ${p.x},${p.y}`);
    }
    assert.ok(terrainCounts.forest / grid.ground.length > 0.07, `${map.id}: insufficient functional forest`);
    assert.ok(terrainCounts.town > 40 && terrainCounts.road > 100 && terrainCounts.open > 300);
    for (const point of map.sectors) {
      const counterpart = map.sectors.find(other => other.x === map.width - point.x && other.y === map.height - point.y);
      assert.ok(counterpart, `${map.id}: unbalanced objective ${point.id}`);
      const d0 = Math.hypot(point.x - map.spawns[0].x, point.y - map.spawns[0].y);
      const d1 = Math.hypot(counterpart.x - map.spawns[1].x, counterpart.y - map.spawns[1].y);
      assert.equal(d0, d1);
      assert.ok(d0 > RULES.deploymentRadius + point.radius, `${map.id}: objective available directly in deployment`);
      let nearbyCover = 0;
      for (let y = point.y - 200; y <= point.y + 200; y += 40) for (let x = point.x - 200; x <= point.x + 200; x += 40) {
        if (['forest', 'town'].includes(terrainAt(map, x, y))) nearbyCover++;
      }
      assert.ok(nearbyCover >= 4, `${map.id}/${point.id}: isolated decorative objective without useful nearby cover`);
    }
  }
});

test('actual ground movement reaches every new objective from both deployment zones without entering water', () => {
  for (const map of MAPS.slice(1)) for (const team of [0, 1]) for (const point of map.sectors) {
    const game = createGame({
      mode: 'pvp', players: [{ id: 'blue', team: 0 }, { id: 'red', team: 1 }],
      config: { mapId: map.id, duration: 3600, tickets: 2000 }, seed: 17,
    });
    const scout = game.units.find(u => u.team === team && u.type === 'recon');
    // An isolated route fixture removes opponents so the test measures terrain
    // navigation rather than an unrelated battle on the way to the objective.
    game.units = [scout];
    Object.assign(scout, map.spawns[team]);
    const result = applyCommand(game, scout.ownerId, { type: 'move', unitIds: [scout.id], x: point.x, y: point.y });
    assert.equal(result.ok, true, result.error);
    assert.ok(scout.path.length > 0, `${map.id}/${point.id}: empty ground route`);
    for (let tick = 0; tick < 1400 && scout.order !== 'stop'; tick++) {
      stepGame(game, 0.1);
      assert.notEqual(simulatedTerrainAt(scout.x, scout.y, game.map), 'water', `${map.id}/${point.id}: unit enters water`);
    }
    assert.ok(Math.hypot(scout.x - point.x, scout.y - point.y) < 2, `${map.id}/${point.id}: team ${team} cannot arrive in 140 seconds`);
  }
});

test('AI contests multiple objectives and completes a real seeded match on each larger map', () => {
  for (const map of MAPS.slice(1)) {
    const game = createGame({ config: { mapId: map.id }, seed: 20261001 });
    const captures = new Set(), occupiedByAI = new Set();
    while (game.status === 'playing' && game.tick < 7201) {
      stepGame(game, 0.1);
      for (const event of game.events) if (event.type === 'capture' && event.team === 1) captures.add(event.sectorId);
      for (const troop of game.units) if (troop.ownerId === 'ai' && troop.garrisonedIn) occupiedByAI.add(troop.garrisonedIn);
      for (const troop of game.units) if (troop.domain !== 'air' && !['helicopter', 'jet'].includes(troop.type) && !troop.loadedIn && !troop.garrisonedIn) {
        assert.ok(groundPassable(troop.x, troop.y, game.map), `${map.id}: AI/human ground unit enters blocked terrain`);
      }
    }
    assert.equal(game.status, 'finished', `${map.id}: match never finishes`);
    assert.equal(game.winner, 1, `${map.id}: active AI must defeat an idle opponent`);
    assert.ok(captures.size >= Math.ceil(map.sectors.length / 2), `${map.id}: AI failed to spread across objectives (${captures.size})`);
    if (map.size === 'very-large') assert.ok(occupiedByAI.size > 0, 'AI must use the new map buildings during an actual match');
  }
});

test('all buildings have visible bounded footprints, clear doors and usable occupancy parameters', () => {
  for (const map of MAPS) {
    assert.ok(map.buildings.length > 0);
    assert.equal(new Set(map.buildings.map(building => building.id)).size, map.buildings.length);
    for (const building of map.buildings) {
      assert.ok(Object.isFrozen(building));
      assert.ok(building.w >= 30 && building.h >= 30 && building.height > 0);
      assert.ok(building.x >= 0 && building.y >= 0 && building.x + building.w <= map.width && building.y + building.h <= map.height);
      assert.equal(building.occupiable, building.capacity > 0);
      assert.ok([0, 1, 2].includes(building.capacity));
      assert.ok(building.protection > 0 && building.protection < 1);
      assert.equal(groundPassable(building.x + building.w / 2, building.y + building.h / 2, map), false);
      assert.ok(building.doors.length > 0 && building.firePoints.length > 0);
      for (const point of [...building.doors, ...building.firePoints]) {
        assert.ok(groundPassable(point.x, point.y, map), `${map.id}/${building.id}: entrance or firing point blocked at ${point.x},${point.y}`);
      }
      for (const region of map.terrain.filter(region => ['water', 'road'].includes(region.type))) {
        const overlap = building.x < region.x + region.w && building.x + building.w > region.x && building.y < region.y + region.h && building.y + building.h > region.y;
        assert.equal(overlap, false, `${map.id}/${building.id}: footprint on road or water`);
      }
      for (const other of map.buildings) if (other !== building) {
        const overlap = building.x < other.x + other.w && building.x + building.w > other.x && building.y < other.y + other.h && building.y + building.h > other.y;
        assert.equal(overlap, false, `${map.id}/${building.id}: overlapping solid buildings`);
      }
      if (map !== MAPS[0]) {
        const counterpart = map.buildings.find(other => other.x === map.width - building.x - building.w && other.y === map.height - building.y - building.h);
        assert.ok(counterpart, `${map.id}/${building.id}: missing balanced counterpart`);
        assert.equal(counterpart.capacity, building.capacity);
        assert.equal(counterpart.protection, building.protection);
      }
    }
  }
  assert.ok(MAPS[3].buildings.some(building => !building.occupiable));
});

test('every building entrance has a real route and troops can walk to a door without entering solid walls', () => {
  for (const map of MAPS) for (const building of map.buildings) {
    const team = building.x < map.width / 2 ? 0 : 1;
    const game = createGame({ mode: 'pvp', players: [{ id: 'blue', team: 0 }, { id: 'red', team: 1 }], config: { mapId: map.id, duration: 3600, tickets: 2000 } });
    const troop = game.units.find(unit => unit.team === team && unit.type === 'recon');
    game.units = [troop];
    for (const door of building.doors) {
      Object.assign(troop, map.spawns[team]);
      assert.equal(applyCommand(game, troop.ownerId, { type: 'move', unitIds: [troop.id], ...door }).ok, true);
      assert.ok(troop.path.length, `${map.id}/${building.id}: inaccessible door`);
    }
    for (let tick = 0; tick < 2000 && troop.order !== 'stop'; tick++) {
      stepGame(game, 0.1);
      assert.ok(groundPassable(troop.x, troop.y, map), `${map.id}/${building.id}: crossed a wall or water on approach`);
    }
    const door = building.doors.at(-1);
    assert.ok(Math.hypot(troop.x - door.x, troop.y - door.y) < 2, `${map.id}/${building.id}: did not reach exterior door`);
  }
});

test('isolated trees, sparse groves and dense woods expose distinct adjustable gameplay properties', () => {
  assert.ok(VEGETATION_PRESETS.isolated.visionDensity < VEGETATION_PRESETS.grove.visionDensity);
  assert.ok(VEGETATION_PRESETS.grove.visionDensity < VEGETATION_PRESETS.dense.visionDensity);
  assert.ok(VEGETATION_PRESETS.isolated.concealment > VEGETATION_PRESETS.grove.concealment);
  assert.ok(VEGETATION_PRESETS.grove.concealment > VEGETATION_PRESETS.dense.concealment);
  for (const map of MAPS) {
    const vegetation = map.terrain.filter(feature => feature.type === 'forest');
    assert.ok(vegetation.some(feature => feature.density === VEGETATION_PRESETS.isolated.density));
    assert.ok(vegetation.some(feature => feature.density === VEGETATION_PRESETS.grove.density));
    assert.ok(vegetation.some(feature => feature.density === VEGETATION_PRESETS.dense.density));
    for (const zone of vegetation) assert.ok(zone.visionDensity > 0 && zone.concealment > 0 && zone.concealment <= 1);
    const road = map.terrain.find(feature => feature.type === 'road');
    assert.equal(vegetationAt(map, road.x + road.w / 2, road.y + road.h / 2), null);
  }
});
