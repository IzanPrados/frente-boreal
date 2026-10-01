import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyCommand, stepGame, terrainAt, groundPassable } from '../shared/sim.mjs';
import { MAPS } from '../shared/maps.mjs';

function fixture(mapId) {
  const game = createGame({ mode: 'solo', config: { mapId, duration: 3600 } });
  const scout = game.units.find(unit => unit.ownerId === 'player1' && unit.type === 'recon');
  game.units = [scout];
  game.players = game.players.filter(player => !player.ai);
  return { game, scout };
}

function route(game, scout, from, to) {
  Object.assign(scout, { ...from, path: [], order: 'stop', target: null });
  assert.notEqual(terrainAt(from.x, from.y, game.map), 'water');
  assert.notEqual(terrainAt(to.x, to.y, game.map), 'water');
  const result = applyCommand(game, 'player1', { type: 'move', unitIds: [scout.id], ...to });
  assert.equal(result.ok, true, result.error);
  assert.ok(scout.path.length > 0, `No route on ${game.map.id}: ${JSON.stringify({ from, to })}`);
}

test('precise canal-corner intersections do not let smoothed paths clip into water', () => {
  const { game, scout } = fixture('frontera-de-los-siete-pasos');
  const destination = { x: 1600, y: 240 };
  route(game, scout, { x: 220, y: 1000 }, destination);
  for (let i = 0; i < 1000 && scout.path.length; i++) {
    stepGame(game, 0.1);
    assert.notEqual(terrainAt(scout.x, scout.y, game.map), 'water', `Water at ${scout.x},${scout.y}`);
  }
  assert.ok(Math.hypot(scout.x - destination.x, scout.y - destination.y) < 0.01);
});

test('dry points beside shorelines and on offset bridges connect even if their cell center is water', () => {
  const fixtures = [
    { mapId: 'valle-bruma', from: { x: 301.9278, y: 123.7865 }, to: { x: 797.8433, y: 190.9566 } },
    { mapId: 'cuenca-del-norte', from: { x: 2073.4024, y: 841.2521 }, to: { x: 1131.7840, y: 851.8805 } },
  ];
  for (const data of fixtures) for (const reverse of [false, true]) {
    const { game, scout } = fixture(data.mapId);
    const from = reverse ? data.to : data.from, to = reverse ? data.from : data.to;
    route(game, scout, from, to);
    for (let i = 0; i < 1200 && scout.path.length; i++) {
      stepGame(game, 0.1);
      assert.notEqual(terrainAt(scout.x, scout.y, game.map), 'water');
    }
    assert.ok(Math.hypot(scout.x - to.x, scout.y - to.y) < 0.01);
  }
});

test('seeded arbitrary ground endpoints have valid routes independent of other rooms map selection', () => {
  let seed = 17821;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const fixtures = MAPS.map(map => fixture(map.id));
  const point = map => {
    let p;
    do p = { x: 15 + random() * (map.width - 30), y: 15 + random() * (map.height - 30) };
    while (!groundPassable(p.x, p.y, map));
    return p;
  };
  for (let sample = 0; sample < 200; sample++) for (const { game, scout } of fixtures) {
    route(game, scout, point(game.map), point(game.map));
    let origin = { x: scout.x, y: scout.y };
    for (const destination of scout.path) {
      const samples = Math.ceil(Math.hypot(destination.x - origin.x, destination.y - origin.y) / 2);
      for (let i = 0; i <= samples; i++) {
        const t = i / Math.max(1, samples);
        assert.equal(groundPassable(origin.x + (destination.x - origin.x) * t, origin.y + (destination.y - origin.y) * t, game.map), true);
      }
      origin = destination;
    }
  }
});

test('a route cached by another room cannot change the route for the same final command', () => {
  const left = fixture('frontera-de-los-siete-pasos'), right = fixture('frontera-de-los-siete-pasos');
  // Separate immutable definition identity gives the comparison an empty cache.
  right.game.map = { ...right.game.map };
  const origin = { x: 220, y: 1000 }, destination = { x: 2465, y: 1825 };
  route(left.game, left.scout, origin, { x: 2475, y: 1835 });
  route(left.game, left.scout, origin, destination);
  route(right.game, right.scout, origin, destination);
  assert.deepEqual(left.scout.path, right.scout.path);
});
