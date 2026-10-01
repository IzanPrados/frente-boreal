import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createGame, applyCommand, stepGame, snapshotFor } from '../shared/sim.mjs';
import { RULES } from '../shared/data.mjs';

// Reproducible CPU/network-size measurements, not a rendering or phone benchmark.
// Test fixtures grant initial purchasing credits. All purchases, orders, movement,
// targeting, damage, visibility and victories run through the actual simulation.
const PLAYERS = [{ id: 'bench0', name: 'Banco A', team: 0 }, { id: 'bench1', name: 'Banco B', team: 1 }];
const round = n => Math.round(n * 1000) / 1000;
const p95 = values => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)];
const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;

function fixture(stable) {
  const players = PLAYERS.map(p => ({ ...p, ...(stable ? { deck: ['aa'] } : {}) }));
  const game = createGame({ mode: 'pvp', players, seed: 20261001, duration: 3600 });
  const composition = stable ? ['aa'] : ['infantry', 'tank', 'recon', 'aa', 'helicopter', 'artillery', 'transport', 'supply', 'jet'];
  for (const p of game.players) {
    p.credits = 100000;
    let i = 0;
    while (game.units.filter(u => u.ownerId === p.id).length < 60) {
      const result = applyCommand(game, p.id, { type: 'deploy', unitType: composition[i++ % composition.length] });
      assert.equal(result.ok, true, result.error);
    }
  }
  assert.equal(game.units.length, RULES.maxUnits);
  return game;
}

function orders(game, flip = false) {
  for (const p of game.players) {
    const ids = game.units.filter(u => u.ownerId === p.id && !u.loadedIn).map(u => u.id);
    if (ids.length) assert.equal(applyCommand(game, p.id, { type: 'attackMove', unitIds: ids, x: p.team === 0 ? 780 : 830, y: flip ? 565 : 495 }).ok, true);
  }
}

function benchmark(name, stable) {
  const game = fixture(stable);
  const initialUnits = game.units.length;
  orders(game);
  // Warm the JIT with a separate match, leaving the measured starting state intact.
  const warm = createGame({ seed: 20261001 });
  for (let i = 0; i < 150; i++) { stepGame(warm, 0.1); snapshotFor(warm, 'player1'); }
  const steps = [], snapshots = [], bytes = [], populations = [];
  let maxSuppression = 0, shots = 0, explosions = 0;
  const observedEvents = new Set();
  for (let i = 0; i < 1000; i++) {
    if (stable && i > 0 && i % 100 === 0) orders(game, i % 200 === 0);
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
    // Actual server distribution target: five snapshots each second per client.
    if (i % 2 === 0) for (const player of game.players) {
      const snapStart = performance.now();
      const snapshot = snapshotFor(game, player.id);
      const encoded = JSON.stringify(snapshot);
      snapshots.push(performance.now() - snapStart);
      bytes.push(Buffer.byteLength(encoded));
    }
  }
  if (stable) assert.equal(Math.min(...populations), 120, 'Stable scenario must retain 120 units');
  else {
    assert.ok(shots > 0 && maxSuppression > 0.1, 'Combined-arms scenario must exercise combat and suppression');
    assert.ok(game.units.length < initialUnits, 'Combined-arms scenario must exercise casualties');
    assert.ok(explosions > 0, 'Combined-arms scenario must exercise indirect area fire');
  }
  return {
    scenario: name, seed: 20261001, ticks: 1000, simulatedSeconds: 100,
    units: { initial: initialUnits, minimum: Math.min(...populations), final: game.units.length, average: round(mean(populations)) },
    simulationMs: { average: round(mean(steps)), p95: round(p95(steps)), max: round(Math.max(...steps)) },
    snapshotAndSerializationMsPerClient: { average: round(mean(snapshots)), p95: round(p95(snapshots)) },
    snapshotBytesPerClient: { average: Math.round(mean(bytes)), p95: p95(bytes) },
    estimatedBytesPerSecondPerClientAt5Hz: { average: Math.round(mean(bytes) * 5), p95: p95(bytes) * 5 },
    combat: { shots, explosions, peakSuppression: round(maxSuppression), casualties: initialUnits - game.units.length },
  };
}

function victoryCheck() {
  const game = createGame({ mode: 'pvp', players: PLAYERS, seed: 72, duration: 720 });
  const troops = game.units.filter(u => u.ownerId === 'bench0' && u.type !== 'supply');
  game.sectors.forEach((s, i) => assert.equal(applyCommand(game, 'bench0', { type: 'attackMove', unitIds: [troops[i].id], x: s.x, y: s.y }).ok, true));
  const start = performance.now();
  while (game.status === 'playing') stepGame(game, 0.1);
  const elapsed = performance.now() - start;
  assert.equal(game.winner, 0);
  assert.equal(game.reason, 'tickets');
  assert.ok(game.sectors.every(s => s.owner === 0));
  return { winner: game.winner, reason: game.reason, simulatedSeconds: round(game.time), ticks: game.tick, executionMs: round(elapsed), controlledSectors: 3 };
}

console.log(JSON.stringify({
  runtime: process.version, platform: `${process.platform}/${process.arch}`, timestamp: new Date().toISOString(),
  note: 'CPU simulation and JSON only; no rendering, network transport, mobile Safari or FPS measured. Bandwidth excludes WebSocket/TLS overhead and compression.',
  scenarios: [benchmark('120 sustained: ground AA, movement and visibility', true), benchmark('120 initially: nine-class combined-arms combat', false)],
  completeMatch: victoryCheck(),
}, null, 2));
