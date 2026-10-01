import { applyCommand, stepGame } from './sim.mjs';
import { UNIT_TYPES } from './data.mjs';

export const GAME_STEP = 0.1;
export const MAX_QUEUED_ORDERS = 64;
const SPEEDS = [0, 0.5, 1, 2];
const COMMANDS = new Set(['deploy', 'move', 'attackMove', 'stop', 'unload', 'load', 'resupply', 'smoke', 'fire', 'garrison', 'exit', 'surrender']);

export function createMatchControl(game) {
  return {
    enabled: game.mode === 'solo' || game.mode === 'coop',
    paused: false, speed: 1, lastSpeed: 1, revision: 0,
    changedBy: null, changedByName: null, accumulator: 0, pending: [],
  };
}

export function timeControlSnapshot(control) {
  if (!control.enabled) return null;
  const { paused, speed, lastSpeed, revision, changedBy, changedByName } = control;
  return { paused, speed, lastSpeed, revision, changedBy, changedByName };
}

export function pendingOrderCount(control, playerId) {
  return control.pending.filter(order => order.playerId === playerId).length;
}

export function setMatchSpeed(game, control, playerId, speed) {
  if (!control.enabled) return { ok: false, error: 'El control del tiempo solo está disponible contra la IA y en cooperativo.' };
  if (game.status !== 'playing') return { ok: false, error: 'La partida ha terminado.' };
  const player = game.players.find(value => value.id === playerId && !value.ai && !value.surrendered);
  if (!player) return { ok: false, error: 'Jugador no autorizado para cambiar el tiempo.' };
  if (!SPEEDS.includes(speed)) return { ok: false, error: 'Usa Pausa, 0,5×, 1× o 2×.' };
  control.paused = speed === 0;
  control.speed = speed;
  if (speed > 0) control.lastSpeed = speed;
  control.revision++;
  control.changedBy = player.id;
  control.changedByName = player.name;
  // A change starts a new wall-time interval. Fractional time from before a
  // pause or a different speed must never spill into the resumed simulation.
  control.accumulator = 0;
  return { ok: true, timeControl: timeControlSnapshot(control) };
}

function validateEnvelope(game, playerId, command) {
  if (game.status !== 'playing') return { ok: false, error: 'La partida ha terminado.' };
  const player = game.players.find(value => value.id === playerId && !value.ai && !value.surrendered);
  if (!player) return { ok: false, error: 'Jugador no autorizado.' };
  if (!command || typeof command !== 'object' || Array.isArray(command) || !COMMANDS.has(command.type)) return { ok: false, error: 'Orden no válida.' };
  const pointOK = value => Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= 0 && value.y >= 0 && value.x <= game.map.width && value.y <= game.map.height;
  if (command.type === 'surrender') return { ok: true };
  if (command.type === 'deploy') {
    if (!Object.hasOwn(UNIT_TYPES, command.unitType) || !player.deck.includes(command.unitType)) return { ok: false, error: 'La unidad no pertenece a tu grupo de combate.' };
    if (!pointOK({ x: command.x ?? game.map.spawns[player.team].x, y: command.y ?? game.map.spawns[player.team].y })) return { ok: false, error: 'Destino no válido.' };
    return { ok: true };
  }
  if (!Array.isArray(command.unitIds) || !command.unitIds.length || command.unitIds.length > game.config.maxUnits || command.unitIds.some(id => typeof id !== 'string' || id.length > 128)) return { ok: false, error: 'Selecciona tus unidades.' };
  if (command.unitIds.some(id => !game.units.some(unit => unit.id === id && unit.ownerId === playerId && unit.hp > 0))) return { ok: false, error: 'Solo puedes dar órdenes a tus propias unidades.' };
  if (['move', 'attackMove', 'smoke', 'fire'].includes(command.type) && !pointOK(command)) return { ok: false, error: 'Destino no válido.' };
  if (command.type === 'load' && !game.units.some(unit => unit.id === command.transportId && unit.ownerId === playerId && unit.hp > 0 && UNIT_TYPES[unit.type].capacity)) return { ok: false, error: 'Selecciona un transporte propio.' };
  if (command.type === 'garrison' && (typeof command.buildingId !== 'string' || !game.map.buildings?.some(building => building.id === command.buildingId && building.capacity > 0))) return { ok: false, error: 'Selecciona un edificio ocupable.' };
  return { ok: true };
}

export function submitMatchCommand(game, control, playerId, command, seq = null, { suspended = false } = {}) {
  const validation = validateEnvelope(game, playerId, command);
  if (!validation.ok) return validation;
  // Surrender ends participation explicitly; it is a session decision, unlike
  // a deployment or combat order. It stays available while planning is paused.
  if (command.type === 'surrender') return applyCommand(game, playerId, command);
  if (control.paused || suspended || control.pending.length) {
    if (pendingOrderCount(control, playerId) >= MAX_QUEUED_ORDERS) return { ok: false, error: 'Ya tienes 64 órdenes preparadas. Reanuda para aplicarlas.' };
    control.pending.push({ playerId, command: structuredClone(command), seq });
    return { ok: true, queued: true };
  }
  return applyCommand(game, playerId, command);
}

export function advanceMatch(game, control, wallSeconds, { suspended = false } = {}) {
  const results = [];
  if (game.status !== 'playing') {
    for (const order of control.pending.splice(0)) results.push({ playerId: order.playerId, seq: order.seq, ok: false, error: 'La partida ha terminado.' });
    control.accumulator = 0;
    return { steps: 0, results };
  }
  if (control.paused || suspended || !Number.isFinite(wallSeconds) || wallSeconds <= 0 || wallSeconds > 1) {
    control.accumulator = 0;
    return { steps: 0, results };
  }
  // Bound work after scheduling delays. A long background gap is discarded
  // entirely above; shorter stalls never create an unbounded catch-up loop.
  control.accumulator += Math.min(wallSeconds, .25) * control.speed;
  let steps = 0;
  while (control.accumulator + 1e-9 >= GAME_STEP && steps < 5 && game.status === 'playing') {
    for (const order of control.pending.splice(0)) results.push({ playerId: order.playerId, seq: order.seq, ...applyCommand(game, order.playerId, order.command) });
    if (game.status !== 'playing') break;
    stepGame(game, GAME_STEP);
    control.accumulator = Math.max(0, control.accumulator - GAME_STEP);
    steps++;
  }
  return { steps, results };
}
