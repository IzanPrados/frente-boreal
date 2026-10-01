import { MAP, UNIT_TYPES, RULES, DEFAULT_DECK } from './data.mjs';
import { validateConfig } from './config.mjs';
import { getMap } from './maps.mjs';
import { vegetationAt } from './terrain.mjs';

const CELL = 40;
const EPS = 0.00001;
const TARGET_SCAN_SECONDS = 0.2;
const LOST_TARGET_GRACE_SECONDS = 0.65;
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const alive = u => u.hp > 0 && !u.loadedIn;
const pointOK = (c, map) => Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= 0 && c.x <= map.width && c.y >= 0 && c.y <= map.height;

// Immutable map definitions can share their spatial indexes between rooms. The
// room always supplies its own map; no currently selected global map exists.
const regionIndexes = new WeakMap();
const navigationIndexes = new WeakMap();

function regionsFor(map) {
  let index = regionIndexes.get(map);
  if (index) return index;
  const cols = Math.ceil(map.width / CELL), rows = Math.ceil(map.height / CELL);
  const cells = Array.from({ length: cols * rows }, () => []);
  const priority = type => type === 'road' ? 0 : type === 'water' ? 1 : 2;
  for (const region of [...map.terrain].sort((a, b) => priority(a.type) - priority(b.type))) {
    const x0 = clamp(Math.floor(region.x / CELL), 0, cols - 1), x1 = clamp(Math.floor((region.x + region.w) / CELL), 0, cols - 1);
    const y0 = clamp(Math.floor(region.y / CELL), 0, rows - 1), y1 = clamp(Math.floor((region.y + region.h) / CELL), 0, rows - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * cols + x].push(region);
  }
  const buildingCells = Array.from({ length: cols * rows }, () => []);
  for (const building of map.buildings || []) {
    for (let y = Math.max(0, Math.floor(building.y / CELL)); y <= Math.min(rows - 1, Math.floor((building.y + building.h) / CELL)); y++) {
      for (let x = Math.max(0, Math.floor(building.x / CELL)); x <= Math.min(cols - 1, Math.floor((building.x + building.w) / CELL)); x++) buildingCells[y * cols + x].push(building);
    }
  }
  index = { cols, rows, cells, buildingCells, buildings: map.buildings || [], water: map.terrain.filter(t => t.type === 'water'), roads: map.terrain.filter(t => t.type === 'road') };
  regionIndexes.set(map, index);
  return index;
}

export function terrainAt(x, y, map = MAP) {
  const p = { x, y };
  const index = regionsFor(map);
  const cell = clamp(Math.floor(y / CELL), 0, index.rows - 1) * index.cols + clamp(Math.floor(x / CELL), 0, index.cols - 1);
  return index.cells[cell].find(t => inside(p, t))?.type || 'open';
}

export function buildingAt(x, y, map = MAP) {
  const index = regionsFor(map);
  const cell = clamp(Math.floor(y / CELL), 0, index.rows - 1) * index.cols + clamp(Math.floor(x / CELL), 0, index.cols - 1);
  return index.buildingCells[cell].find(building => inside({ x, y }, building)) || null;
}

export function groundPassable(x, y, map = MAP) {
  return x >= 0 && y >= 0 && x <= map.width && y <= map.height && terrainAt(x, y, map) !== 'water' && !buildingAt(x, y, map);
}

function nearbyBuildings(a, b, map) {
  const index = regionsFor(map);
  const x0 = clamp(Math.floor(Math.min(a.x, b.x) / CELL), 0, index.cols - 1), x1 = clamp(Math.floor(Math.max(a.x, b.x) / CELL), 0, index.cols - 1);
  const y0 = clamp(Math.floor(Math.min(a.y, b.y) / CELL), 0, index.rows - 1), y1 = clamp(Math.floor(Math.max(a.y, b.y) / CELL), 0, index.rows - 1);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > index.buildings.length * 2) return index.buildings;
  const found = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const building of index.buildingCells[y * index.cols + x]) found.add(building);
  return found;
}

function navigationFor(map) {
  let grid = navigationIndexes.get(map);
  if (grid) return grid;
  const { cols, rows } = regionsFor(map);
  grid = { cols, rows, passable: new Uint8Array(cols * rows), costs: new Float32Array(cols * rows), edges: new Uint8Array(cols * rows), routes: new Map() };
  for (let i = 0; i < grid.passable.length; i++) {
    const point = cellPoint(i, grid), land = terrainAt(point.x, point.y, map);
    grid.passable[i] = groundPassable(point.x, point.y, map);
    grid.costs[i] = land === 'road' ? 0.78 : land === 'forest' ? 1.5 : 1;
  }
  for (let i = 0; i < grid.passable.length; i++) {
    if (!grid.passable[i]) continue;
    const cx = i % cols, cy = Math.floor(i / cols), from = cellPoint(i, grid);
    for (const [direction, [dx, dy]] of DIRECTIONS.entries()) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !grid.passable[ny * cols + nx]) continue;
      if (dx && dy && (!grid.passable[cy * cols + nx] || !grid.passable[ny * cols + cx])) continue;
      if (clearGround(from, cellPoint(ny * cols + nx, grid), map)) grid.edges[i] |= 1 << direction;
    }
  }
  navigationIndexes.set(map, grid);
  return grid;
}

const cellIndex = (p, grid) => clamp(Math.floor(p.y / CELL), 0, grid.rows - 1) * grid.cols + clamp(Math.floor(p.x / CELL), 0, grid.cols - 1);
const cellPoint = (i, grid) => ({ x: (i % grid.cols) * CELL + CELL / 2, y: Math.floor(i / grid.cols) * CELL + CELL / 2 });

function random(game) {
  let n = game.rng | 0;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  game.rng = n >>> 0;
  return game.rng / 4294967296;
}

function rectangleInterval(a, b, rect) {
  let enter = 0, leave = 1;
  for (const [origin, delta, low, high] of [[a.x, b.x - a.x, rect.x, rect.x + rect.w], [a.y, b.y - a.y, rect.y, rect.y + rect.h]]) {
    if (Math.abs(delta) < 1e-12) {
      if (origin < low || origin > high) return null;
      continue;
    }
    const t0 = (low - origin) / delta, t1 = (high - origin) / delta;
    enter = Math.max(enter, Math.min(t0, t1));
    leave = Math.min(leave, Math.max(t0, t1));
    if (enter > leave) return null;
  }
  return [enter, leave];
}

function clearGround(a, b, map) {
  const index = regionsFor(map);
  for (const building of nearbyBuildings(a, b, map)) if (rectangleInterval(a, b, building)) return false;
  for (const water of index.water) {
    const blocked = rectangleInterval(a, b, water);
    if (!blocked) continue;
    // Test the complete segment, including tiny clips at canal corners. Roads
    // override water only where their intervals fully cover the intersection.
    const bridges = index.roads.map(road => rectangleInterval(a, b, road)).filter(interval => interval && interval[1] >= blocked[0] && interval[0] <= blocked[1]).sort((left, right) => left[0] - right[0]);
    let covered = blocked[0], crossed = false;
    for (const interval of bridges) {
      if (interval[0] > covered + 1e-10) break;
      covered = Math.max(covered, interval[1]);
      if (covered + 1e-10 >= blocked[1]) { crossed = true; break; }
    }
    if (!crossed) return false;
  }
  return true;
}

function nearestGround(p, map) {
  p = { x: clamp(p.x, 15, map.width - 15), y: clamp(p.y, 15, map.height - 15) };
  if (groundPassable(p.x, p.y, map)) return p;
  const grid = navigationFor(map);
  let best = null, bestD = Infinity;
  for (let i = 0; i < grid.passable.length; i++) {
    if (!grid.passable[i]) continue;
    const q = cellPoint(i, grid), d = dist(p, q);
    if (d < bestD) { best = q; bestD = d; }
  }
  return best;
}

function reachableCell(point, grid, map) {
  const direct = cellIndex(point, grid);
  if (grid.passable[direct] && clearGround(point, cellPoint(direct, grid), map)) return direct;
  // Shorelines and bridges do not necessarily align with the navigation grid.
  // Connect the exact point to a visible dry cell rather than assuming the
  // center of its containing cell is usable.
  const cx = direct % grid.cols, cy = Math.floor(direct / grid.cols);
  for (const radius of [1, 2, 4, Math.max(grid.cols, grid.rows)]) {
    let best = -1, bestDistance = Infinity;
    for (let y = Math.max(0, cy - radius); y <= Math.min(grid.rows - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(grid.cols - 1, cx + radius); x++) {
        const index = y * grid.cols + x;
        if (!grid.passable[index]) continue;
        const candidate = cellPoint(index, grid), distance = dist(point, candidate);
        if (distance < bestDistance && clearGround(point, candidate, map)) { best = index; bestDistance = distance; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function queueBefore(a, b) { return a.score < b.score || (a.score === b.score && a.index < b.index); }
function queuePush(heap, entry) {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (!queueBefore(entry, heap[parent])) break;
    heap[index] = heap[parent]; index = parent;
  }
  heap[index] = entry;
}
function queuePop(heap) {
  const first = heap[0], last = heap.pop();
  if (heap.length) {
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      const left = index * 2 + 1, right = left + 1;
      const child = right < heap.length && queueBefore(heap[right], heap[left]) ? right : left;
      if (!queueBefore(heap[child], last)) break;
      heap[index] = heap[child]; index = child;
    }
    heap[index] = last;
  }
  return first;
}

// Small bounded A* grid shared by solo and authoritative server simulations.
function smoothRoute(from, cells, destination, grid, map) {
  const raw = cells.map(index => cellPoint(index, grid));
  raw.push(destination);
  const smooth = [];
  let origin = from;
  for (let i = 0; i < raw.length;) {
    let farthest = i;
    while (farthest + 1 < raw.length && clearGround(origin, raw[farthest + 1], map)) farthest++;
    if (!clearGround(origin, raw[farthest], map)) return [];
    smooth.push(raw[farthest]); origin = raw[farthest]; i = farthest + 1;
  }
  return smooth;
}

function pathTo(from, target, domain, map) {
  if (domain === 'air') return [{ x: target.x, y: target.y }];
  const destination = nearestGround(target, map);
  if (!destination) return [];
  if (clearGround(from, destination, map)) return [destination];
  const grid = navigationFor(map), { cols, passable } = grid;
  const start = reachableCell(from, grid, map), finish = reachableCell(destination, grid, map);
  if (start < 0 || finish < 0) return [];
  const finishPoint = cellPoint(finish, grid);
  const key = start * passable.length + finish;
  const cached = grid.routes.get(key);
  if (cached) return smoothRoute(from, cached, destination, grid, map);
  const open = [];
  const scores = new Float64Array(passable.length).fill(Infinity);
  const estimates = new Float64Array(passable.length).fill(Infinity);
  const parent = new Int32Array(passable.length).fill(-1);
  scores[start] = 0;
  estimates[start] = dist(cellPoint(start, grid), finishPoint);
  queuePush(open, { index: start, score: estimates[start] });
  while (open.length) {
    const entry = queuePop(open);
    let current = entry.index;
    if (entry.score > estimates[current] + EPS) continue;
    if (current === finish) {
      const cells = [];
      while (current !== start) { cells.push(current); current = parent[current]; }
      cells.push(start); cells.reverse();
      // Cache only immutable cell routes, never mutable unit paths. Exact
      // start/end connectors and all smoothed segments are checked each time.
      if (grid.routes.size >= 1024) grid.routes.delete(grid.routes.keys().next().value);
      grid.routes.set(key, cells);
      return smoothRoute(from, cells, destination, grid, map);
    }
    const cx = current % cols, cy = Math.floor(current / cols);
    for (const [direction, [dx, dy]] of DIRECTIONS.entries()) {
      if (!(grid.edges[current] & (1 << direction))) continue;
      const nx = cx + dx, ny = cy + dy;
      const ni = ny * cols + nx;
      const point = cellPoint(ni, grid);
      const score = scores[current] + (dx && dy ? 56.57 : 40) * grid.costs[ni];
      if (score + EPS < scores[ni]) {
        parent[ni] = current; scores[ni] = score; estimates[ni] = score + dist(point, finishPoint) * 0.75;
        queuePush(open, { index: ni, score: estimates[ni] });
      }
    }
  }
  return [];
}

const buildingFor = (game, id) => id ? (game.map.buildings || []).find(building => building.id === id) : null;

function rayPoints(game, unit) {
  const building = buildingFor(game, unit.garrisonedIn);
  if (building) return building.firePoints.map(point => ({ ...point, z: Math.min(building.height - 1, 5) }));
  return [{ x: unit.x, y: unit.y, z: UNIT_TYPES[unit.type]?.domain === 'air' ? unit.type === 'jet' ? 65 : 35 : 2 }];
}

function rayObstruction(game, from, to) {
  for (const building of nearbyBuildings(from, to, game.map)) {
    const interval = rectangleInterval(from, to, building);
    if (!interval) continue;
    const z0 = from.z + (to.z - from.z) * interval[0], z1 = from.z + (to.z - from.z) * interval[1];
    if (Math.min(z0, z1) < building.height) return Infinity;
  }
  const distance = dist(from, to), count = Math.max(1, Math.ceil(distance / 8));
  let obstruction = 0;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const height = from.z + (to.z - from.z) * t;
    if (height < 20) obstruction += (vegetationAt(game.map, p.x, p.y)?.visionDensity || 0) * distance / count;
    if (height < 25 && game.smokes.some(smoke => dist(smoke, p) < smoke.radius)) obstruction += 80;
  }
  return obstruction;
}

function clearRays(game, from, to, threshold) {
  const rays = [];
  // Occupants use exterior windows. The ray is then tested against every solid
  // building, including their own: a window cannot fire through its back wall.
  for (const origin of rayPoints(game, from)) for (const target of rayPoints(game, to)) {
    const obstruction = rayObstruction(game, origin, target);
    if (obstruction <= threshold) rays.push({ origin, target, obstruction, distance: dist(origin, target) });
  }
  return rays.sort((a, b) => a.distance - b.distance);
}

function sightClear(game, from, to) {
  return clearRays(game, from, to, from.type === 'recon' ? 130 : 80).length > 0;
}

function firingSolution(game, unit, target) {
  const data = UNIT_TYPES[unit.type];
  if (unit.type === 'artillery') {
    const distance = dist(unit, target);
    return distance <= data.range && distance >= data.minRange ? { origin: { x: unit.x, y: unit.y }, target: { x: target.x, y: target.y } } : null;
  }
  return clearRays(game, unit, target, 160).find(ray => ray.distance <= data.range && ray.distance >= (data.minRange || 0)) || null;
}

function sees(game, observer, target) {
  const data = UNIT_TYPES[observer.type], other = UNIT_TYPES[target.type];
  const d = dist(observer, target);
  const vegetation = vegetationAt(game.map, target.x, target.y);
  const concealment = target.garrisonedIn ? 0.72 : other.domain === 'ground' && vegetation ? (observer.type === 'recon' ? vegetation.reconConcealment : vegetation.concealment) : 1;
  const firingBonus = game.time - target.lastShot < 2.5 ? 65 : 0;
  if (d > data.vision + firingBonus + (observer.garrisonedIn || target.garrisonedIn ? 180 : 0)) return false;
  if (game.smokes.some(s => dist(s, target) < s.radius) && d > 65) return false;
  return clearRays(game, observer, target, observer.type === 'recon' ? 130 : 80).some(ray => ray.distance <= data.vision * concealment + firingBonus - ray.obstruction * 0.7);
}

function visibleSet(game, team) {
  const friends = game.units.filter(u => alive(u) && u.team === team);
  const visible = new Set(game.units.filter(u => u.team === team && u.hp > 0).map(u => u.id));
  for (const target of game.units) {
    if (!alive(target) || target.team === team) continue;
    if (friends.some(observer => sees(game, observer, target))) visible.add(target.id);
  }
  return visible;
}

function pointVisible(game, team, point) {
  return game.units.some(u => alive(u) && u.team === team && dist(u, point) <= UNIT_TYPES[u.type].vision && sightClear(game, u, point));
}

function emit(game, type, extras = {}) {
  game.events.push({ id: ++game.eventId, type, time: game.time, ...extras });
}

function normalizeDeck(deck) {
  const list = Array.isArray(deck) ? deck : Array.isArray(deck?.units) ? deck.units : DEFAULT_DECK;
  const valid = [...new Set(list)].filter(key => Object.hasOwn(UNIT_TYPES, key));
  return valid.length ? valid : [...DEFAULT_DECK];
}

function spawn(game, player, type, position) {
  const data = UNIT_TYPES[type];
  const location = data.domain === 'air' ? position : nearestGround(position, game.map);
  const u = {
    id: `u${++game.unitId}`, ownerId: player.id, team: player.team, type,
    x: location.x, y: location.y, hp: data.hp, ammo: data.ammo,
    suppression: 0, heading: player.team === 0 ? 0 : Math.PI,
    cooldown: 0.2 + random(game) * 0.8, lastShot: -100, order: 'stop', target: null,
    path: [], cargo: [], loadedIn: null, smoke: data.smoke || 0,
    stock: data.stock || 0, moving: false, aiNext: 0,
    combatTargetId: null, combatPaused: false, targetLostAt: null, nextTargetScan: 0,
    garrisonedIn: null, pendingBuildingId: null,
  };
  game.units.push(u);
  return u;
}

export function createGame({ mode = 'solo', players = [{ id: 'player1', name: 'Comandante', team: 0 }], seed = 42, duration, config } = {}) {
  if (mode === 'versus') mode = 'pvp';
  if (!['solo', 'coop', 'pvp'].includes(mode)) throw new Error('Modo desconocido');
  if (!Array.isArray(players) || players.length < 1 || players.length > 4) throw new Error('Jugadores no válidos');
  const validated = validateConfig(config);
  if (!validated.ok) throw new Error(validated.error);
  // The direct duration argument is retained for server/test fixtures. The
  // public room protocol accepts only validated pre-match configuration.
  const settings = Object.freeze({ ...validated.config, ...(Number.isFinite(duration) ? { duration: clamp(duration, 10, 3600) } : {}) });
  const map = getMap(settings.mapId);
  const used = new Set();
  const humans = players.map((p, index) => {
    if (!p || typeof p.id !== 'string' || !p.id || p.id === 'ai' || used.has(p.id)) throw new Error('Identificador de jugador no válido');
    used.add(p.id);
    return { id: p.id, name: String(p.name || `Comandante ${index + 1}`).slice(0, 32), team: mode === 'pvp' ? (p.team === 1 ? 1 : 0) : 0, deck: normalizeDeck(p.deck), credits: settings.startingResources, ai: false, surrendered: false };
  });
  if (mode === 'pvp' && (!humans.some(p => p.team === 0) || !humans.some(p => p.team === 1))) throw new Error('El enfrentamiento necesita dos equipos');
  if (mode !== 'pvp') humans.push({ id: 'ai', name: 'Mando rival', team: 1, deck: [...DEFAULT_DECK], credits: settings.startingResources, ai: true, surrendered: false });
  const game = {
    mode, config: settings, map, tick: 0, time: 0, duration: settings.duration,
    status: 'playing', winner: null, reason: null, rng: (seed >>> 0) || 42,
    players: humans, units: [], sectors: map.sectors.map(s => ({ ...s, owner: null, progress: 0, capturingTeam: null, contested: false })),
    tickets: [settings.tickets, settings.tickets], events: [], smokes: [], projectiles: [], unitId: 0, eventId: 0, aiAt: 0.5,
  };
  for (const p of humans) {
    const index = humans.filter(q => q.team === p.team).findIndex(q => q.id === p.id);
    const center = map.spawns[p.team];
    const starter = ['recon', 'infantry', 'tank', 'supply'].filter(t => p.deck.includes(t));
    if (!starter.length) starter.push(p.deck[0]);
    starter.forEach((type, i) => spawn(game, p, type, { x: center.x + (p.team === 0 ? 1 : -1) * ((i % 2) * 50 + 15), y: center.y - 75 + i * 45 + index * 70 }));
  }
  return game;
}

function setOrder(game, unit, type, target) {
  if (unit.garrisonedIn && ['move', 'attackMove', 'resupply', 'garrison'].includes(type) && !leaveBuilding(game, unit)) return false;
  unit.pendingBuildingId = null;
  unit.order = type;
  unit.target = target ? { x: target.x, y: target.y } : null;
  unit.path = target ? pathTo(unit, target, UNIT_TYPES[unit.type].domain, game.map) : [];
  unit.combatTargetId = null;
  unit.combatPaused = false;
  unit.targetLostAt = null;
  unit.nextTargetScan = 0;
  unit.moving = false;
  return true;
}

function buildingMembers(game, buildingId) {
  return game.units.filter(unit => unit.hp > 0 && (unit.garrisonedIn === buildingId || unit.pendingBuildingId === buildingId));
}

function exteriorPosition(game, unit, building, planned = []) {
  const occupied = game.units.filter(other => alive(other) && other.id !== unit.id && !other.garrisonedIn && UNIT_TYPES[other.type].domain === 'ground');
  const doors = [...building.doors].sort((a, b) => dist(unit, a) - dist(unit, b));
  for (const door of doors) {
    const horizontal = door.y < building.y || door.y > building.y + building.h;
    for (const offset of [0, 14, -14, 28, -28, 42, -42, 56, -56]) {
      const point = { x: door.x + (horizontal ? offset : 0), y: door.y + (horizontal ? 0 : offset) };
      if (!groundPassable(point.x, point.y, game.map) || !clearGround(door, point, game.map)) continue;
      if (occupied.some(other => dist(other, point) < 10) || planned.some(other => dist(other, point) < 10)) continue;
      return point;
    }
  }
  return null;
}

function leaveBuilding(game, unit, position) {
  const building = buildingFor(game, unit.garrisonedIn);
  if (!building) { unit.garrisonedIn = null; return true; }
  const exterior = position || exteriorPosition(game, unit, building);
  if (!exterior) return false;
  unit.garrisonedIn = null;
  unit.x = exterior.x; unit.y = exterior.y;
  emit(game, 'exit', { unitId: unit.id, buildingId: building.id, team: unit.team, x: unit.x, y: unit.y });
  return true;
}

function garrisonCommand(game, units, buildingId) {
  const building = buildingFor(game, buildingId);
  if (!building?.capacity || building.occupiable === false || units.some(unit => unit.type !== 'infantry')) return { ok: false, error: 'Selecciona infantería y un edificio ocupable.' };
  const selected = new Set(units.map(unit => unit.id));
  const existing = buildingMembers(game, buildingId).filter(unit => !selected.has(unit.id));
  // The same generic response covers obstruction, capacity and hostile claims;
  // an unobserved building never reveals enemy counts through a rejected order.
  const unavailable = { ok: false, error: 'No hay un acceso y plazas disponibles para esa orden.' };
  if (existing.some(unit => unit.team !== units[0].team) || existing.length + units.length > building.capacity) return unavailable;
  const plans = [], exits = [];
  for (const unit of units) {
    if (unit.garrisonedIn === building.id) { plans.push({ unit, alreadyInside: true }); continue; }
    const previousBuilding = buildingFor(game, unit.garrisonedIn);
    const origin = previousBuilding ? exteriorPosition(game, unit, previousBuilding, exits) : { x: unit.x, y: unit.y };
    if (!origin) return unavailable;
    if (previousBuilding) exits.push(origin);
    let best = null;
    for (const door of building.doors) {
      if (!groundPassable(door.x, door.y, game.map)) continue;
      const path = pathTo(origin, door, 'ground', game.map);
      if (!path.length) continue;
      let length = 0, from = origin;
      for (const to of path) { length += dist(from, to); from = to; }
      if (!best || length < best.length) best = { path, door, length };
    }
    if (!best) return unavailable;
    plans.push({ unit, origin, previousBuilding, ...best });
  }
  // Commit only after every unit has a valid route and a reserved slot. The
  // authority handles commands sequentially, so simultaneous requests cannot
  // both reserve the final place.
  for (const plan of plans) {
    if (plan.alreadyInside) continue;
    if (plan.previousBuilding) leaveBuilding(game, plan.unit, plan.origin);
    setOrder(game, plan.unit, 'garrison');
    plan.unit.pendingBuildingId = building.id;
    plan.unit.target = { ...plan.door };
    plan.unit.path = plan.path;
  }
  return { ok: true };
}

function arriveAtBuilding(game, unit) {
  if (!unit.pendingBuildingId || unit.path.length || unit.order !== 'garrison') return;
  const building = buildingFor(game, unit.pendingBuildingId);
  if (!building || !unit.target || dist(unit, unit.target) > 2) { setOrder(game, unit, 'stop'); return; }
  const members = buildingMembers(game, building.id);
  if (members.length > building.capacity || members.some(other => other.team !== unit.team)) { setOrder(game, unit, 'stop'); return; }
  unit.garrisonedIn = building.id;
  unit.pendingBuildingId = null;
  unit.x = building.x + building.w / 2; unit.y = building.y + building.h / 2;
  unit.order = 'stop'; unit.target = null; unit.path = []; unit.moving = false;
  unit.combatPaused = false; unit.combatTargetId = null; unit.nextTargetScan = 0;
  emit(game, 'garrison', { unitId: unit.id, buildingId: building.id, team: unit.team, x: unit.x, y: unit.y });
}

function finish(game, winner, reason) {
  if (game.status === 'finished') return;
  game.status = 'finished'; game.winner = winner; game.reason = reason;
  emit(game, 'victory', { winner, reason });
}

export function applyCommand(game, playerId, command) {
  if (game.status !== 'playing') return { ok: false, error: 'La partida ha terminado.' };
  const player = game.players.find(p => p.id === playerId);
  if (!player || player.surrendered) return { ok: false, error: 'Jugador no autorizado.' };
  if (!command || typeof command.type !== 'string') return { ok: false, error: 'Orden no válida.' };
  const { type } = command;
  if (type === 'surrender') {
    player.surrendered = true;
    if (!game.players.some(p => p.team === player.team && !p.surrendered)) finish(game, 1 - player.team, 'surrender');
    return { ok: true };
  }
  if (type === 'deploy') {
    const data = Object.hasOwn(UNIT_TYPES, command.unitType) && UNIT_TYPES[command.unitType];
    if (!data || !player.deck.includes(command.unitType)) return { ok: false, error: 'La unidad no pertenece a tu grupo de combate.' };
    if (game.units.filter(u => u.hp > 0).length >= game.config.maxUnits) return { ok: false, error: `Se ha alcanzado el límite de ${game.config.maxUnits} unidades de esta partida.` };
    if (player.credits + EPS < data.cost) return { ok: false, error: 'Presupuesto insuficiente.' };
    const point = { x: command.x ?? game.map.spawns[player.team].x, y: command.y ?? game.map.spawns[player.team].y };
    if (!pointOK(point, game.map) || dist(point, game.map.spawns[player.team]) > RULES.deploymentRadius) return { ok: false, error: 'Despliega dentro del círculo de tu base.' };
    if (data.domain === 'ground' && !groundPassable(point.x, point.y, game.map)) return { ok: false, error: 'El punto de despliegue está ocupado por agua o un edificio.' };
    player.credits -= data.cost;
    const unit = spawn(game, player, command.unitType, point);
    emit(game, 'deploy', { unitId: unit.id, team: player.team, x: unit.x, y: unit.y });
    return { ok: true, unitId: unit.id };
  }
  const supported = ['move', 'attackMove', 'stop', 'unload', 'load', 'resupply', 'smoke', 'fire', 'garrison', 'exit'];
  if (!supported.includes(type)) return { ok: false, error: 'Orden desconocida.' };
  if (!Array.isArray(command.unitIds) || !command.unitIds.length || command.unitIds.length > game.config.maxUnits || command.unitIds.some(id => typeof id !== 'string')) return { ok: false, error: 'Selecciona tus unidades.' };
  const ids = [...new Set(command.unitIds)];
  const units = ids.map(id => game.units.find(u => u.id === id && u.hp > 0));
  if (units.some(u => !u || u.ownerId !== playerId)) return { ok: false, error: 'Solo puedes dar órdenes a tus propias unidades.' };
  if (['move', 'attackMove', 'smoke', 'fire'].includes(type) && !pointOK(command, game.map)) return { ok: false, error: 'Destino no válido.' };
  if (units.some(u => u.loadedIn) && type !== 'unload') return { ok: false, error: 'Desembarca primero a la infantería.' };
  if (['move', 'attackMove', 'resupply'].includes(type)) {
    const exits = [];
    for (const unit of units.filter(unit => unit.garrisonedIn)) {
      const point = exteriorPosition(game, unit, buildingFor(game, unit.garrisonedIn), exits.map(exit => exit.point));
      if (!point) return { ok: false, error: 'Los accesos de salida están bloqueados por otras unidades.' };
      exits.push({ unit, point });
    }
    for (const { unit, point } of exits) leaveBuilding(game, unit, point);
  }
  if (type === 'garrison') return garrisonCommand(game, units, command.buildingId);
  if (type === 'exit') {
    if (units.some(unit => !unit.garrisonedIn && !unit.pendingBuildingId)) return { ok: false, error: 'Selecciona las tropas que ocupan un edificio o se dirigen a él.' };
    const plans = [];
    for (const unit of units) {
      const building = buildingFor(game, unit.garrisonedIn);
      const point = building ? exteriorPosition(game, unit, building, plans.map(plan => plan.point).filter(Boolean)) : null;
      if (building && !point) return { ok: false, error: 'Los accesos de salida están bloqueados por otras unidades.' };
      plans.push({ unit, point });
    }
    for (const { unit, point } of plans) { if (unit.garrisonedIn) leaveBuilding(game, unit, point); setOrder(game, unit, 'stop'); }
    return { ok: true };
  }
  if (type === 'load') {
    if (units.some(unit => unit.garrisonedIn)) return { ok: false, error: 'Sal del edificio antes de embarcar.' };
    const transport = game.units.find(u => u.id === command.transportId && alive(u));
    if (!transport || transport.ownerId !== playerId || !UNIT_TYPES[transport.type].capacity) return { ok: false, error: 'Selecciona un transporte propio.' };
    if (units.some(u => u.type !== 'infantry') || units.length + transport.cargo.length > UNIT_TYPES[transport.type].capacity) return { ok: false, error: 'Solo caben dos escuadras de infantería.' };
    if (units.some(u => dist(u, transport) > 95)) return { ok: false, error: 'Acerca la infantería al transporte (95 m).' };
    for (const u of units) { u.loadedIn = transport.id; transport.cargo.push(u.id); setOrder(game, u, 'stop'); u.x = transport.x; u.y = transport.y; }
    return { ok: true };
  }
  if (type === 'unload') {
    const carriers = [...new Set(units.map(u => u.loadedIn ? game.units.find(t => t.id === u.loadedIn) : u))].filter(u => u?.cargo.length);
    if (!carriers.length) return { ok: false, error: 'No hay tropas embarcadas en la selección.' };
    for (const transport of carriers) {
      transport.cargo.forEach((id, i) => {
        const u = game.units.find(candidate => candidate.id === id);
        if (!u) return;
        const point = nearestGround({ x: transport.x + 24 * (transport.team === 0 ? 1 : -1), y: transport.y + (i ? 28 : -28) }, game.map);
        u.loadedIn = null; u.x = point.x; u.y = point.y; setOrder(game, u, 'stop');
      });
      transport.cargo = [];
    }
    return { ok: true };
  }
  if (type === 'smoke') {
    const selected = units.find(u => u.smoke > 0 && dist(u, command) <= 240);
    if (!selected) return { ok: false, error: 'Sin humo disponible o destino fuera de alcance (240 m).' };
    selected.smoke--;
    const cloud = { id: `s${game.eventId + 1}`, x: command.x, y: command.y, radius: 75, until: game.time + 20, team: player.team };
    game.smokes.push(cloud); emit(game, 'smoke', cloud);
    return { ok: true };
  }
  if (type === 'fire') {
    const guns = units.filter(u => u.type === 'artillery' && u.ammo >= 1 && dist(u, command) <= UNIT_TYPES.artillery.range && dist(u, command) >= UNIT_TYPES.artillery.minRange);
    if (!guns.length) return { ok: false, error: 'Selecciona artillería con munición y objetivo a 100–510 m.' };
    for (const gun of guns) { setOrder(game, gun, 'fire'); gun.target = { x: command.x, y: command.y }; }
    return { ok: true };
  }
  if (type === 'resupply') {
    for (const u of units) {
      const suppliers = game.units.filter(s => alive(s) && s.team === u.team && s.type === 'supply' && s.id !== u.id && s.stock > 1).sort((a, b) => dist(u, a) - dist(u, b));
      const base = game.map.spawns[u.team], supplier = suppliers[0];
      const target = supplier && dist(u, supplier) < dist(u, base) ? supplier : base;
      setOrder(game, u, 'resupply', target);
    }
    return { ok: true };
  }
  units.forEach((u, i) => {
    if (type === 'stop') { setOrder(game, u, 'stop'); return; }
    const cols = Math.ceil(Math.sqrt(units.length));
    const spacing = units.length > 1 ? 25 : 0;
    const target = { x: clamp(command.x + (i % cols - (cols - 1) / 2) * spacing, 10, game.map.width - 10), y: clamp(command.y + (Math.floor(i / cols) - (Math.ceil(units.length / cols) - 1) / 2) * spacing, 10, game.map.height - 10) };
    setOrder(game, u, type, target);
  });
  return { ok: true };
}

function targetAllowed(unit, target) {
  return UNIT_TYPES[unit.type].targets.includes(UNIT_TYPES[target.type].domain);
}

function validTarget(game, unit, target, visibility) {
  if (!target || !alive(target) || target.team === unit.team || !visibility.has(target.id) || !targetAllowed(unit, target)) return false;
  if (dist(unit, target) > UNIT_TYPES[unit.type].range + (unit.garrisonedIn || target.garrisonedIn ? 180 : 0)) return false;
  return Boolean(firingSolution(game, unit, target));
}

function chooseTarget(game, unit, visibility) {
  const data = UNIT_TYPES[unit.type];
  if (!data.damage || unit.ammo < 1 || unit.suppression >= 0.97) {
    unit.combatTargetId = null;
    return null;
  }
  // Keep the same opponent while it remains attackable. A closer arrival does
  // not cause a target switch on every tick, and no target is ever chased.
  const retained = game.units.find(candidate => candidate.id === unit.combatTargetId);
  if (validTarget(game, unit, retained, visibility)) return retained;
  unit.combatTargetId = null;
  if (game.time + EPS < unit.nextTargetScan) return null;
  unit.nextTargetScan = game.time + TARGET_SCAN_SECONDS;
  let chosen = null, best = Infinity;
  for (const target of game.units) {
    if (!validTarget(game, unit, target, visibility)) continue;
    const distance = dist(unit, target);
    const priority = distance + (target.type === 'supply' ? 40 : target.type === 'recon' ? -20 : 0);
    if (priority < best || (priority === best && target.id.localeCompare(chosen.id, 'en') < 0)) { best = priority; chosen = target; }
  }
  unit.combatTargetId = chosen?.id || null;
  return chosen;
}

function updateEngagement(game, unit, enemy) {
  if (!unit.path.length || !['move', 'attackMove'].includes(unit.order)) {
    unit.combatPaused = false;
    unit.targetLostAt = null;
    return;
  }
  if (enemy) {
    unit.combatPaused = true;
    unit.targetLostAt = null;
    return;
  }
  if (!unit.combatPaused) return;
  // A brief loss of sight/range must not produce stop-go jitter. Invalid
  // targets cannot be fired at; after this bounded grace the route resumes.
  unit.targetLostAt ??= game.time;
  if (game.time - unit.targetLostAt + EPS >= LOST_TARGET_GRACE_SECONDS) {
    unit.combatPaused = false;
    unit.targetLostAt = null;
  }
}

function damageUnit(game, unit, raw, attacker, area = false) {
  if (unit.hp <= 0) return;
  const data = UNIT_TYPES[unit.type], land = terrainAt(unit.x, unit.y, game.map), vegetation = vegetationAt(game.map, unit.x, unit.y);
  const occupied = buildingFor(game, unit.garrisonedIn);
  const cover = occupied ? clamp(occupied.protection, 0.1, 1) : data.domain === 'air' ? 1 : vegetation ? vegetation.cover[unit.type === 'infantry' ? 'infantry' : 'ground'] : land === 'town' ? (unit.type === 'infantry' ? 0.85 : 0.92) : 1;
  const antiArmor = ['tank', 'helicopter', 'jet', 'artillery'].includes(attacker.type) ? 0.58 : attacker.type === 'infantry' && dist(unit, attacker) < 100 ? 0.65 : 1;
  const impact = Math.max(raw * 0.13, raw - data.armor * antiArmor) * cover;
  unit.hp = Math.max(0, unit.hp - impact);
  unit.suppression = clamp(unit.suppression + (area ? 0.39 : 0.11 + impact / data.hp * 0.3), 0, 1);
  emit(game, 'hit', { x: unit.x, y: unit.y, team: unit.team, unitId: unit.id, damage: Math.round(impact), sourceType: attacker.type });
  if (unit.hp <= 0) {
    unit.garrisonedIn = null; unit.pendingBuildingId = null;
    emit(game, 'destroy', { x: unit.x, y: unit.y, team: unit.team, unitId: unit.id, unitType: unit.type });
    for (const id of unit.cargo) {
      const passenger = game.units.find(u => u.id === id);
      if (passenger) { passenger.hp = 0; emit(game, 'destroy', { x: unit.x, y: unit.y, team: unit.team, unitId: passenger.id, unitType: passenger.type }); }
    }
    unit.cargo = [];
  }
}

function shoot(game, unit, target, coordinate = false) {
  const data = UNIT_TYPES[unit.type];
  const solution = coordinate ? { origin: unit, target } : firingSolution(game, unit, target);
  if (!solution) return;
  unit.ammo = Math.max(0, unit.ammo - 1);
  unit.cooldown = data.reload * (1 + unit.suppression * 1.8);
  unit.lastShot = game.time;
  unit.heading = Math.atan2(solution.target.y - solution.origin.y, solution.target.x - solution.origin.x);
  if (unit.type === 'artillery') {
    const angle = random(game) * Math.PI * 2, spread = 12 + random(game) * 30;
    const x = clamp(target.x + Math.cos(angle) * spread, 0, game.map.width), y = clamp(target.y + Math.sin(angle) * spread, 0, game.map.height);
    game.projectiles.push({ x, y, due: game.time + 1.25, team: unit.team, ownerId: unit.ownerId, type: unit.type, damage: data.damage, radius: data.blast });
    emit(game, 'shot', { x: unit.x, y: unit.y, tx: x, ty: y, team: unit.team, unitType: unit.type, indirect: true });
    return;
  }
  const accuracy = clamp(0.9 - unit.suppression * 0.5 - (unit.moving ? 0.19 : 0) - (target.moving && UNIT_TYPES[target.type].domain === 'air' ? 0.08 : 0), 0.18, 0.94);
  const hit = random(game) < accuracy;
  emit(game, 'shot', { x: solution.origin.x, y: solution.origin.y, tx: solution.target.x, ty: solution.target.y, team: unit.team, unitType: unit.type, hit });
  if (hit && !coordinate) damageUnit(game, target, data.damage * (0.9 + random(game) * 0.2), unit);
  else if (!coordinate) target.suppression = clamp(target.suppression + 0.055, 0, 1);
}

function updateMovement(game, unit, dt) {
  const data = UNIT_TYPES[unit.type];
  unit.moving = false;
  if (!unit.path.length || unit.combatPaused || unit.garrisonedIn) return;
  let point = unit.path[0], distance = dist(unit, point);
  if (unit.order === 'resupply' && unit.path.length === 1 && distance < 58) { unit.path = []; return; }
  const land = terrainAt(unit.x, unit.y, game.map), vegetation = vegetationAt(game.map, unit.x, unit.y);
  const modifier = data.domain === 'air' ? 1 : land === 'road' ? 1.38 : vegetation ? vegetation.movement[unit.type === 'infantry' ? 'infantry' : 'ground'] : land === 'town' ? (unit.type === 'infantry' ? 0.9 : 0.65) : 1;
  const speed = data.speed * modifier * (1 - unit.suppression * 0.77);
  let remaining = speed * dt;
  unit.moving = true;
  while (remaining > 0 && unit.path.length) {
    point = unit.path[0]; distance = dist(unit, point);
    unit.heading = Math.atan2(point.y - unit.y, point.x - unit.x);
    if (distance <= remaining + EPS) { unit.x = point.x; unit.y = point.y; remaining -= distance; unit.path.shift(); }
    else { unit.x += (point.x - unit.x) / distance * remaining; unit.y += (point.y - unit.y) / distance * remaining; remaining = 0; }
  }
  if (!unit.path.length && ['move', 'attackMove'].includes(unit.order)) { unit.order = 'stop'; unit.target = null; }
}

function updateSupply(game, dt) {
  const suppliers = game.units.filter(u => alive(u) && u.type === 'supply' && u.stock > 0);
  for (const unit of game.units) {
    if (!alive(unit)) continue;
    const data = UNIT_TYPES[unit.type];
    const inBase = dist(unit, game.map.spawns[unit.team]) < 175;
    if (unit.type === 'supply' && inBase) unit.stock = Math.min(data.stock, unit.stock + 18 * dt);
    if (unit.moving || game.time - unit.lastShot < 3) continue;
    let supplier = suppliers.find(s => s.id !== unit.id && s.team === unit.team && dist(unit, s) < RULES.supplyRadius && !s.moving && s.stock > 0);
    if (data.domain === 'air' && unit.type === 'jet') supplier = null;
    if (!inBase && !supplier) continue;
    const available = supplier ? supplier.stock : Infinity;
    const ammo = Math.min(data.ammo - unit.ammo, 2.2 * dt, available);
    const repair = Math.min(data.hp - unit.hp, (inBase ? 3 : 7) * dt, Math.max(0, available - ammo) / 0.18);
    unit.ammo = Math.min(data.ammo, unit.ammo + ammo);
    unit.hp = Math.min(data.hp, unit.hp + repair);
    if (supplier) supplier.stock = Math.max(0, supplier.stock - ammo - repair * 0.18);
    unit.suppression = Math.max(0, unit.suppression - dt * 0.12);
  }
}

function updateSectors(game, dt) {
  for (const sector of game.sectors) {
    const power = [0, 0];
    for (const unit of game.units) {
      if (!alive(unit) || unit.suppression > 0.85 || dist(unit, sector) > sector.radius) continue;
      power[unit.team] += UNIT_TYPES[unit.type].capture;
    }
    sector.contested = power[0] > 0 && power[1] > 0;
    const team = power[0] > 0 && power[1] === 0 ? 0 : power[1] > 0 && power[0] === 0 ? 1 : null;
    if (team === null || team === sector.owner) {
      sector.progress = Math.max(0, sector.progress - dt / RULES.captureSeconds * 0.45);
      if (!sector.progress) sector.capturingTeam = null;
      continue;
    }
    if (sector.capturingTeam !== team) { sector.capturingTeam = team; sector.progress = 0; }
    sector.progress += dt / RULES.captureSeconds * Math.min(2, power[team]);
    if (sector.progress >= 1) {
      sector.owner = team; sector.progress = 0; sector.capturingTeam = null;
      emit(game, 'capture', { sectorId: sector.id, name: sector.name, team, x: sector.x, y: sector.y });
    }
  }
  const counts = [0, 0];
  for (const s of game.sectors) if (s.owner !== null) counts[s.owner]++;
  const advantage = counts[0] - counts[1];
  if (advantage) {
    const loser = advantage > 0 ? 1 : 0;
    game.tickets[loser] = Math.max(0, game.tickets[loser] - dt * Math.abs(advantage) * 0.6);
    if (game.tickets[loser] <= 0) finish(game, 1 - loser, 'tickets');
  }
}

function updateAI(game) {
  const ai = game.players.find(p => p.ai && !p.surrendered);
  if (!ai) return;
  const visible = visibleSet(game, ai.team);
  const enemies = game.units.filter(u => alive(u) && u.team !== ai.team && visible.has(u.id));
  const friends = game.units.filter(u => alive(u) && u.ownerId === ai.id);
  if (friends.length < (game.mode === 'coop' ? 38 : 28)) {
    let type;
    if (enemies.some(u => UNIT_TYPES[u.type].domain === 'air') && friends.filter(u => u.type === 'aa').length < 3) type = 'aa';
    else if (!friends.some(u => u.type === 'supply')) type = 'supply';
    else if (!friends.some(u => u.type === 'recon')) type = 'recon';
    else {
      const choices = ['infantry', 'tank', 'infantry', 'recon', 'helicopter', 'artillery', 'aa', 'transport', 'jet'];
      type = choices[Math.floor(random(game) * choices.length)];
    }
    if (ai.credits >= UNIT_TYPES[type].cost) applyCommand(game, ai.id, { type: 'deploy', unitType: type, x: game.map.spawns[ai.team].x + random(game) * 70 - 35, y: game.map.spawns[ai.team].y + random(game) * 190 - 95 });
  }
  for (const unit of friends) {
    if (game.time < unit.aiNext) continue;
    unit.aiNext = game.time + 4 + random(game) * 4;
    const data = UNIT_TYPES[unit.type];
    if (unit.hp < data.hp * 0.3 || (data.ammo && unit.ammo < 1)) {
      applyCommand(game, ai.id, { type: 'resupply', unitIds: [unit.id] });
      if (unit.suppression > 0.55 && unit.smoke) applyCommand(game, ai.id, { type: 'smoke', unitIds: [unit.id], x: unit.x, y: unit.y });
      continue;
    }
    if (unit.order === 'resupply' && (unit.hp < data.hp * 0.75 || unit.ammo < data.ammo * 0.65)) continue;
    if (unit.type === 'infantry') {
      const occupied = buildingFor(game, unit.garrisonedIn);
      if (occupied && (enemies.some(enemy => dist(unit, enemy) < data.range + 80) || game.sectors.some(sector => dist(unit, sector) < sector.radius + 80 && (sector.owner !== ai.team || sector.contested)))) continue;
      if (unit.pendingBuildingId && unit.path.length) continue;
      const positions = (game.map.buildings || []).filter(building => {
        if (!building.capacity || building.occupiable === false) return false;
        const center = { x: building.x + building.w / 2, y: building.y + building.h / 2 };
        if (dist(unit, center) > 360) return false;
        const useful = game.sectors.some(sector => dist(center, sector) < sector.radius + 70 && (sector.owner !== ai.team || sector.contested)) || enemies.some(enemy => dist(center, enemy) < data.range);
        const members = buildingMembers(game, building.id).filter(other => other.id !== unit.id);
        return useful && members.length < building.capacity && members.every(other => other.team === unit.team);
      }).sort((a, b) => dist(unit, { x: a.x + a.w / 2, y: a.y + a.h / 2 }) - dist(unit, { x: b.x + b.w / 2, y: b.y + b.h / 2 }));
      if (positions[0] && applyCommand(game, ai.id, { type: 'garrison', unitIds: [unit.id], buildingId: positions[0].id }).ok) continue;
    }
    if (unit.combatPaused) continue;
    if (unit.type === 'supply') {
      if (unit.stock < 50) { setOrder(game, unit, 'move', game.map.spawns[unit.team]); continue; }
      const soldiers = friends.filter(u => !['supply', 'jet', 'helicopter'].includes(u.type));
      if (soldiers.length) {
        const average = soldiers.reduce((p, u) => ({ x: p.x + u.x / soldiers.length, y: p.y + u.y / soldiers.length }), { x: 0, y: 0 });
        const target = { x: clamp(average.x + 90, 30, game.map.width - 30), y: clamp(average.y, 30, game.map.height - 30) };
        if (dist(unit, target) > 75) setOrder(game, unit, 'move', target); else setOrder(game, unit, 'stop');
      }
      continue;
    }
    if (unit.type === 'artillery') {
      const target = enemies.find(e => dist(unit, e) < data.range && dist(unit, e) > data.minRange);
      if (target) { applyCommand(game, ai.id, { type: 'fire', unitIds: [unit.id], x: target.x, y: target.y }); continue; }
    }
    const objectives = game.sectors.map(s => {
      const assigned = friends.filter(other => other.id !== unit.id && UNIT_TYPES[other.type].capture > 0 && dist(other.target || other, s) < s.radius * 1.6).length;
      return { sector: s, score: dist(unit, s) + assigned * 160 + (s.owner === ai.team ? 300 : 0) + (s.contested ? -180 : 0) + random(game) * 290 };
    }).sort((a, b) => a.score - b.score);
    const sector = objectives[0].sector;
    const offset = unit.type === 'artillery' ? 260 : unit.type === 'aa' ? 140 : unit.type === 'recon' ? 65 : 0;
    const flank = unit.type === 'recon' || unit.type === 'helicopter' ? (random(game) < 0.5 ? -65 : 65) : random(game) * 60 - 30;
    if (dist(unit, sector) > sector.radius * 0.6 || sector.owner !== ai.team) setOrder(game, unit, 'attackMove', { x: clamp(sector.x + offset, 30, game.map.width - 30), y: clamp(sector.y + flank, 30, game.map.height - 30) });
  }
}

export function stepGame(game, dt = 0.1) {
  if (game.status !== 'playing') return game;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1) throw new Error('El paso de simulación debe estar entre 0 y 1 segundo');
  game.tick++; game.time += dt;
  game.events = game.events.filter(e => game.time - e.time < 2.8);
  game.smokes = game.smokes.filter(s => s.until > game.time);
  for (const player of game.players) if (!player.surrendered) player.credits = Math.min(1000000, player.credits + RULES.incomePerSecond * game.config.incomeMultiplier * dt);
  if (game.time >= game.aiAt) { updateAI(game); game.aiAt = game.time + 2.1; }
  const views = [visibleSet(game, 0), visibleSet(game, 1)];
  for (const unit of game.units) {
    if (!alive(unit)) continue;
    unit.suppression = Math.max(0, unit.suppression - dt * 0.075);
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    const target = chooseTarget(game, unit, views[unit.team]);
    updateEngagement(game, unit, target);
    updateMovement(game, unit, dt);
    arriveAtBuilding(game, unit);
    if (unit.cooldown <= 0 && unit.ammo >= 1 && unit.suppression < 0.97) {
      if (unit.type === 'artillery' && unit.order === 'fire' && unit.target) {
        const range = dist(unit, unit.target);
        if (range <= UNIT_TYPES.artillery.range && range >= UNIT_TYPES.artillery.minRange) shoot(game, unit, unit.target, true);
      } else if (validTarget(game, unit, target, views[unit.team])) shoot(game, unit, target);
    }
    for (const id of unit.cargo) { const carried = game.units.find(u => u.id === id); if (carried) { carried.x = unit.x; carried.y = unit.y; } }
  }
  for (const shell of game.projectiles.filter(p => p.due <= game.time)) {
    emit(game, 'explosion', { x: shell.x, y: shell.y, team: shell.team, radius: shell.radius });
    for (const unit of game.units) if (alive(unit) && UNIT_TYPES[unit.type].domain === 'ground' && dist(unit, shell) < shell.radius) damageUnit(game, unit, shell.damage * (1 - dist(unit, shell) / shell.radius * 0.65), shell, true);
  }
  game.projectiles = game.projectiles.filter(p => p.due > game.time);
  updateSupply(game, dt);
  updateSectors(game, dt);
  game.units = game.units.filter(u => u.hp > 0);
  if (game.time + EPS >= game.duration && game.status === 'playing') {
    const difference = game.tickets[0] - game.tickets[1];
    finish(game, Math.abs(difference) < 0.01 ? null : difference > 0 ? 0 : 1, 'time');
  }
  return game;
}

export function snapshotFor(game, playerId, { revealEnemies = false } = {}) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new Error('Jugador no autorizado');
  // This permission is fixed when the authoritative game is created. The
  // viewer preference changes only this projection, never game perception.
  const reveal = game.config.allowEnemyReveal === true && revealEnemies === true;
  const visible = visibleSet(game, player.team);
  const round = n => Math.round(n * 100) / 100;
  const units = game.units.filter(u => u.hp > 0 && (visible.has(u.id) || reveal) && (!u.loadedIn || u.team === player.team)).map(u => {
    const ownTeam = u.team === player.team, data = UNIT_TYPES[u.type];
    return {
      id: u.id, ownerId: u.ownerId, team: u.team, type: u.type, x: round(u.x), y: round(u.y), hp: round(u.hp), maxHp: data.hp,
      detected: visible.has(u.id), displayOnly: !ownTeam && !visible.has(u.id),
      ammo: ownTeam ? round(u.ammo) : null, maxAmmo: ownTeam ? data.ammo : null,
      suppression: round(u.suppression), heading: round(u.heading), domain: data.domain,
      order: ownTeam ? u.order : null, target: ownTeam && u.target ? { ...u.target } : null,
      combatPaused: ownTeam ? u.combatPaused : null,
      combatTargetId: ownTeam ? u.combatTargetId : null,
      cargo: ownTeam ? [...u.cargo] : [], loadedIn: ownTeam ? u.loadedIn : null,
      garrisonedIn: u.garrisonedIn || null, pendingBuildingId: ownTeam ? u.pendingBuildingId || null : null,
      stock: ownTeam ? round(u.stock) : null, smoke: ownTeam ? u.smoke : null,
      moving: u.moving, terrainType: terrainAt(u.x, u.y, game.map),
    };
  });
  const events = game.events.filter(e => ['garrison', 'exit'].includes(e.type) ? e.team === player.team || visible.has(e.unitId) : ['capture', 'victory'].includes(e.type) || e.team === player.team || (Number.isFinite(e.x) && pointVisible(game, player.team, e))).map(e => ({ ...e }));
  const buildings = (game.map.buildings || []).map(building => {
    const members = buildingMembers(game, building.id);
    const ownMembers = members.filter(unit => unit.team === player.team);
    const detected = members.filter(unit => unit.garrisonedIn === building.id && visible.has(unit.id));
    const shown = members.filter(unit => unit.garrisonedIn === building.id && (visible.has(unit.id) || reveal));
    const known = ownMembers.length > 0;
    return {
      id: building.id, team: known ? player.team : shown[0]?.team ?? null,
      known, observed: detected.length > 0, displayOnly: !known && shown.length > 0 && detected.length === 0,
      occupied: known ? ownMembers.filter(unit => unit.garrisonedIn === building.id).length : shown.length || null,
      reserved: known ? ownMembers.filter(unit => unit.pendingBuildingId === building.id).length : null,
      occupantIds: (known ? ownMembers.filter(unit => unit.garrisonedIn === building.id) : shown).map(unit => unit.id),
    };
  });
  return {
    tick: game.tick, time: round(game.time), duration: game.duration, mode: game.mode,
    config: { ...game.config }, mapId: game.map.id, revealEnemies: reveal,
    status: game.status, winner: game.winner, reason: game.reason,
    playerId: player.id, team: player.team, units, buildings,
    players: game.players.map(p => ({ id: p.id, name: p.name, team: p.team, credits: p.team === player.team ? round(p.credits) : null, ai: p.ai, surrendered: p.surrendered, deck: p.id === player.id ? [...p.deck] : undefined })),
    sectors: game.sectors.map(s => ({ ...s, progress: round(s.progress) })), tickets: game.tickets.map(round), events,
    smokes: game.smokes.filter(s => s.team === player.team || pointVisible(game, player.team, s)).map(s => ({ ...s })),
    vision: game.units.filter(u => alive(u) && u.team === player.team).map(u => ({ x: round(u.x), y: round(u.y), radius: UNIT_TYPES[u.type].vision })),
    limits: { maxUnits: game.config.maxUnits, deploymentRadius: RULES.deploymentRadius },
  };
}
