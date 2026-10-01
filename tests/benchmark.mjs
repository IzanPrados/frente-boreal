import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createGame, applyCommand, stepGame, snapshotFor } from '../shared/sim.mjs';
import { MAPS } from '../shared/maps.mjs';

// CPU and JSON measurements, separate from rendering and actual network I/O.
// Fixtures grant purchasing credits. Deployment, orders, paths, targeting,
// visibility, damage and capture all run through the production simulation.
const PLAYERS = [{ id: 'bench0', name: 'Banco A', team: 0 }, { id: 'bench1', name: 'Banco B', team: 1 }];
const SEED = 20261001;
const BUDGETS = { simulationP95Ms: 10, snapshotAndSerializationP95Ms: 10, groupOrderP95Ms: 100 };
const round = n => Math.round(n * 1000) / 1000;
const p95 = values => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)];
const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;
const summary = values => ({ average: round(mean(values)), p95: round(p95(values)), max: round(Math.max(...values)) });

function fixture(map, stable) {
  const players = PLAYERS.map(p => ({ ...p, ...(stable ? { deck: ['aa'] } : {}) }));
  const game = createGame({ mode: 'pvp', players, seed: SEED, config: { mapId: map.id, duration: 3600, tickets: 2000 } });
  const composition = stable ? ['aa'] : ['infantry', 'tank', 'recon', 'aa', 'helicopter', 'artillery', 'transport', 'supply', 'jet'];
  for (const player of game.players) {
    player.credits = 100000;
    let i = 0;
    while (game.units.filter(u => u.ownerId === player.id).length < 60) {
      const result = applyCommand(game, player.id, { type: 'deploy', unitType: composition[i++ % composition.length] });
      assert.equal(result.ok, true, result.error);
    }
  }
  assert.equal(game.units.length, 120);
  return game;
}

function centerOrders(game, flip = false) {
  for (const player of game.players) {
    const ids = game.units.filter(u => u.ownerId === player.id && !u.loadedIn).map(u => u.id);
    if (!ids.length) continue;
    const result = applyCommand(game, player.id, { type: 'move', unitIds: ids, x: game.map.width / 2 + (player.team ? 25 : -25), y: game.map.height / 2 + (flip ? 65 : -5) });
    assert.equal(result.ok, true, result.error);
  }
}

function benchmark(map, stable) {
  const game = fixture(map, stable), initialUnits = game.units.length;
  centerOrders(game);
  const steps = [], snapshots = [], bytes = [], populations = [];
  let maxSuppression = 0, shots = 0, explosions = 0;
  const observedEvents = new Set();
  for (let i = 0; i < 1000; i++) {
    if (stable && i > 0 && i % 100 === 0) centerOrders(game, i % 200 === 0);
    const start = performance.now();
    stepGame(game, 0.1);
    steps.push(performance.now() - start);
    populations.push(game.units.length);
    maxSuppression = Math.max(maxSuppression, ...game.units.map(u => u.suppression));
    for (const event of game.events) {
      if (observedEvents.has(event.id)) continue;
      observedEvents.add(event.id);
      if (event.type === 'shot') shots++;
      if (event.type === 'explosion') explosions++;
    }
    if (i % 2 === 0) for (const player of game.players) {
      const start = performance.now();
      const encoded = JSON.stringify(snapshotFor(game, player.id));
      snapshots.push(performance.now() - start);
      bytes.push(Buffer.byteLength(encoded));
    }
  }
  if (stable) assert.equal(Math.min(...populations), 120, 'Sustained scenario must retain all 120 units');
  else {
    assert.ok(shots > 0 && maxSuppression > 0.1, 'Combined-arms scenario must exercise combat and suppression');
    assert.ok(game.units.length < initialUnits, 'Combined-arms scenario must exercise casualties');
    assert.ok(explosions > 0, 'Combined-arms scenario must exercise indirect area fire');
  }
  return {
    mapId: map.id, dimensions: `${map.width}x${map.height}`, terrainRegions: map.terrain.length,
    scenario: stable ? '120 sustained: ground AA, movement and visibility' : '120 initially: nine-class combined-arms combat',
    seed: SEED, ticks: 1000, simulatedSeconds: 100,
    units: { initial: initialUnits, minimum: Math.min(...populations), final: game.units.length, average: round(mean(populations)) },
    simulationMs: summary(steps),
    snapshotAndSerializationMsPerClient: summary(snapshots),
    snapshotBytesPerClient: { average: Math.round(mean(bytes)), p95: p95(bytes) },
    estimatedBytesPerSecondPerClientAt5Hz: { average: Math.round(mean(bytes) * 5), p95: p95(bytes) * 5 },
    combat: { shots, explosions, peakSuppression: round(maxSuppression), casualties: initialUnits - game.units.length },
    withinDesktopBudgets: { simulation: p95(steps) <= BUDGETS.simulationP95Ms, snapshot: p95(snapshots) <= BUDGETS.snapshotAndSerializationP95Ms },
  };
}

function pathOrderBenchmark(map) {
  const game = fixture(map, true), samples = [];
  let routesWithDetours = 0;
  // Each command replaces 60 routes to an opposing flank. Both banks/canals and
  // water-corner smoothing are included. There are no hand-written test paths.
  for (let repeat = 0; repeat < 12; repeat++) for (const player of game.players) {
    const units = game.units.filter(u => u.ownerId === player.id);
    const point = { x: map.width * (player.team ? 0.25 : 0.75), y: map.height * (repeat % 2 ? 0.92 : 0.08) };
    const start = performance.now();
    const result = applyCommand(game, player.id, { type: 'move', unitIds: units.map(u => u.id), ...point });
    samples.push(performance.now() - start);
    assert.equal(result.ok, true, result.error);
    assert.ok(units.every(unit => unit.path.length > 0), 'Every formation destination must have a ground route');
    routesWithDetours += units.filter(unit => unit.path.length > 1).length;
  }
  assert.ok(routesWithDetours > 0, 'Path benchmark must exercise obstacle avoidance');
  return { mapId: map.id, commands: samples.length, unitsPerCommand: 60, routesWithDetours, groupOrderMs: summary(samples), withinDesktopBudget: p95(samples) <= BUDGETS.groupOrderP95Ms };
}

function completeMatch(map) {
  const game = createGame({ mode: 'solo', seed: 72, config: { mapId: map.id, duration: 720 } });
  const troops = game.units.filter(u => u.ownerId === 'player1' && u.type !== 'supply');
  for (const [i, troop] of troops.entries()) {
    const sector = map.sectors[Math.floor(i * map.sectors.length / troops.length)];
    assert.equal(applyCommand(game, 'player1', { type: 'move', unitIds: [troop.id], x: sector.x, y: sector.y }).ok, true);
  }
  const start = performance.now();
  while (game.status === 'playing') stepGame(game, 0.1);
  assert.ok(['tickets', 'time'].includes(game.reason));
  assert.ok(game.sectors.some(sector => sector.owner !== null));
  return { mapId: map.id, winner: game.winner, reason: game.reason, simulatedSeconds: round(game.time), ticks: game.tick, executionMs: round(performance.now() - start), finalUnits: game.units.length, controlledSectors: game.sectors.filter(sector => sector.owner !== null).length };
}

// Warm up production code before measured runs. Per-map indexes are built by
// the initial deployment/route outside measured tick and snapshot intervals.
const warm = fixture(MAPS[0], true);
centerOrders(warm);
for (let i = 0; i < 150; i++) { stepGame(warm, 0.1); snapshotFor(warm, 'bench0'); }

console.log(JSON.stringify({
  runtime: process.version, platform: `${process.platform}/${process.arch}`, timestamp: new Date().toISOString(),
  note: 'CPU simulation and JSON only; no rendering, transport, mobile Safari or FPS measured. Bandwidth excludes WebSocket/TLS overhead and compression. Budgets are desktop regression targets, not device guarantees.',
  desktopBudgets: BUDGETS,
  scenarios: MAPS.flatMap(map => [benchmark(map, true), benchmark(map, false)]),
  pathOrders: MAPS.map(pathOrderBenchmark),
  completeMatches: MAPS.map(completeMatch),
}, null, 2));
