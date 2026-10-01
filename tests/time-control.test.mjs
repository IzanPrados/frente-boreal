import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyCommand } from '../shared/sim.mjs';
import { createMatchControl, timeControlSnapshot, pendingOrderCount, setMatchSpeed, submitMatchCommand, advanceMatch, MAX_QUEUED_ORDERS } from '../shared/match-control.mjs';

const players = [{ id: 'a', name: 'Águila', team: 0 }, { id: 'b', name: 'Bruma', team: 0 }];
const coop = extra => createGame({ mode: 'coop', players, seed: 4242, ...extra });
function wallAdvance(game, control, seconds, dt = .05, options) {
  const results = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) results.push(...advanceMatch(game, control, dt, options).results);
  return results;
}

test('cualquiera de los dos compañeros cambia el reloj con una revisión autoritativa única', () => {
  const game = coop(), clock = createMatchControl(game);
  assert.deepEqual(timeControlSnapshot(clock), { paused: false, speed: 1, lastSpeed: 1, revision: 0, changedBy: null, changedByName: null });
  assert.equal(setMatchSpeed(game, clock, 'b', .5).ok, true);
  assert.equal(setMatchSpeed(game, clock, 'a', 2).ok, true);
  assert.equal(setMatchSpeed(game, clock, 'b', 0).ok, true);
  assert.deepEqual(timeControlSnapshot(clock), { paused: true, speed: 0, lastSpeed: 2, revision: 3, changedBy: 'b', changedByName: 'Bruma' });
  for (const invalid of [null, '2', -1, 4, Infinity, NaN]) assert.equal(setMatchSpeed(game, clock, 'a', invalid).ok, false);
  assert.equal(setMatchSpeed(game, clock, 'ai', 1).ok, false);
  assert.equal(setMatchSpeed(game, clock, 'intruso', 1).ok, false);
  assert.equal(clock.revision, 3);
  const pvp = createGame({ mode: 'pvp', players: [{ ...players[0], team: 0 }, { ...players[1], team: 1 }] });
  const versusClock = createMatchControl(pvp);
  assert.equal(setMatchSpeed(pvp, versusClock, 'a', 0).ok, false);
  assert.equal(timeControlSnapshot(versusClock), null);
});

test('0,5× / 1× / 2× avanzan toda la simulación en pasos constantes de 0,1 segundos', () => {
  for (const speed of [.5, 1, 2]) {
    const game = coop(), clock = createMatchControl(game);
    setMatchSpeed(game, clock, 'b', speed);
    wallAdvance(game, clock, 10);
    assert.equal(game.tick, 100 * speed);
    assert.ok(Math.abs(game.time - 10 * speed) < 1e-8);
  }
});

function activeScenario() {
  const game = createGame({ mode: 'solo', players: [players[0]], seed: 77, config: { startingResources: 1000, incomeMultiplier: 3, duration: 3600 } });
  const infantry = game.units.find(unit => unit.ownerId === 'a' && unit.type === 'infantry');
  const supply = game.units.find(unit => unit.ownerId === 'a' && unit.type === 'supply');
  const objective = game.sectors[0];
  Object.assign(infantry, { x: objective.x, y: objective.y, hp: 70, ammo: 5, cooldown: 2.5 });
  Object.assign(supply, { x: objective.x - 45, y: objective.y + 5 });
  assert.equal(applyCommand(game, 'a', { type: 'smoke', unitIds: [infantry.id], x: objective.x, y: objective.y }).ok, true);
  const deployed = applyCommand(game, 'a', { type: 'deploy', unitType: 'artillery' });
  assert.equal(deployed.ok, true);
  const artillery = game.units.find(unit => unit.id === deployed.unitId);
  assert.equal(applyCommand(game, 'a', { type: 'fire', unitIds: [artillery.id], x: artillery.x + 260, y: artillery.y }).ok, true);
  return game;
}

test('un minuto de partida produce idénticos ingresos, IA, proyectiles, recargas, suministros, humo y captura a las tres velocidades', () => {
  const games = [];
  for (const speed of [.5, 1, 2]) {
    const game = activeScenario(), clock = createMatchControl(game);
    setMatchSpeed(game, clock, 'a', speed);
    wallAdvance(game, clock, 60 / speed);
    assert.equal(game.tick, 600);
    assert.ok(Math.abs(game.time - 60) < 1e-8);
    assert.ok(game.unitId > 9, 'La IA ha desplegado refuerzos durante el minuto.');
    assert.ok(game.eventId > 20, 'Se han producido disparos y otros efectos temporizados.');
    assert.ok(game.sectors.some(sector => sector.owner !== null), 'Ha progresado la captura.');
    assert.equal(game.smokes.length, 0, 'El humo ha agotado su duración de juego.');
    assert.ok(Math.abs(game.players.find(player => player.id === 'a').credits - (1000 - 170 + 6 * 3 * 60)) < 1e-6, 'El multiplicador económico se aplica una vez por segundo de juego.');
    games.push(game);
  }
  assert.deepEqual(games[0], games[1]);
  assert.deepEqual(games[1], games[2]);
});

test('pausar congela todos los efectos; órdenes y despliegues esperan a reanudar y se validan entonces', () => {
  const game = coop({ config: { startingResources: 100 } }), clock = createMatchControl(game);
  const own = game.units.find(unit => unit.ownerId === 'a' && unit.type === 'infantry');
  const foreign = game.units.find(unit => unit.ownerId === 'b');
  setMatchSpeed(game, clock, 'b', 0);
  const before = structuredClone(game);
  assert.equal(submitMatchCommand(game, clock, 'a', { type: 'move', unitIds: [foreign.id], x: 400, y: 500 }, 1).ok, false);
  assert.equal(submitMatchCommand(game, clock, 'a', { type: 'move', unitIds: [own.id], x: NaN, y: 500 }, 2).ok, false);
  for (const seq of [3, 4]) assert.deepEqual(submitMatchCommand(game, clock, 'a', { type: 'deploy', unitType: 'infantry' }, seq), { ok: true, queued: true });
  assert.equal(submitMatchCommand(game, clock, 'a', { type: 'move', unitIds: [own.id], x: 420, y: 500 }, 5).queued, true);
  assert.equal(submitMatchCommand(game, clock, 'a', { type: 'stop', unitIds: [own.id] }, 6).queued, true);
  assert.equal(pendingOrderCount(clock, 'a'), 4);
  assert.equal(pendingOrderCount(clock, 'b'), 0);
  wallAdvance(game, clock, 60);
  assert.deepEqual(game, before, 'No cambian tiempo, movimiento, economía, daño, capturas ni entidades durante la pausa.');
  setMatchSpeed(game, clock, 'a', .5);
  assert.equal(advanceMatch(game, clock, .1).results.length, 0, 'Las órdenes esperan al primer paso real de simulación.');
  const { results } = advanceMatch(game, clock, .1);
  assert.deepEqual(results.map(result => [result.seq, result.ok]), [[3, true], [4, false], [5, true], [6, true]]);
  assert.match(results[1].error, /Presupuesto/);
  assert.equal(game.units.filter(unit => unit.ownerId === 'a').length, 5);
  assert.equal(own.order, 'stop');
  assert.equal(own.target, null, 'Una orden posterior sustituye al movimiento anterior.');
  assert.equal(pendingOrderCount(clock, 'a'), 0);
  assert.ok(Math.abs(game.players[0].credits - 10.6) < 1e-8);
});

test('cola acotada por jugador y sin adelantar una orden nueva sobre las ya preparadas', () => {
  const game = coop(), clock = createMatchControl(game);
  const own = game.units.find(unit => unit.ownerId === 'a');
  setMatchSpeed(game, clock, 'a', 0);
  for (let i = 0; i < MAX_QUEUED_ORDERS; i++) assert.equal(submitMatchCommand(game, clock, 'a', { type: 'stop', unitIds: [own.id] }, i).queued, true);
  assert.equal(submitMatchCommand(game, clock, 'a', { type: 'stop', unitIds: [own.id] }, 100).ok, false);
  assert.equal(pendingOrderCount(clock, 'a'), 64);
  setMatchSpeed(game, clock, 'b', 1);
  advanceMatch(game, clock, .1);
  setMatchSpeed(game, clock, 'a', 0);
  submitMatchCommand(game, clock, 'a', { type: 'move', unitIds: [own.id], x: 400, y: 500 }, 101);
  setMatchSpeed(game, clock, 'b', 1);
  assert.equal(submitMatchCommand(game, clock, 'a', { type: 'stop', unitIds: [own.id] }, 102).queued, true);
  assert.deepEqual(advanceMatch(game, clock, .1).results.map(result => result.seq), [101, 102]);
  assert.equal(own.order, 'stop');
});

test('desconexión o segundo plano no acumulan tiempo; al volver se conserva la pausa y última velocidad', () => {
  const game = coop(), clock = createMatchControl(game);
  setMatchSpeed(game, clock, 'a', 2);
  wallAdvance(game, clock, .5);
  const tick = game.tick;
  wallAdvance(game, clock, 20, .1, { suspended: true });
  assert.equal(game.tick, tick);
  advanceMatch(game, clock, 80);
  assert.equal(game.tick, tick, 'Un retraso largo de planificación se descarta entero.');
  advanceMatch(game, clock, .1);
  assert.equal(game.tick, tick + 2);
  setMatchSpeed(game, clock, 'b', 0);
  wallAdvance(game, clock, 20, .1, { suspended: true });
  advanceMatch(game, clock, .1);
  assert.equal(game.tick, tick + 2, 'Reconectar no reanuda una pausa manual.');
  assert.equal(clock.lastSpeed, 2);
  setMatchSpeed(game, clock, 'a', clock.lastSpeed);
  advanceMatch(game, clock, .1);
  assert.equal(game.tick, tick + 4);
});
