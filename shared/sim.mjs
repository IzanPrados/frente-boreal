import { MAP, UNIT_TYPES, RULES, DEFAULT_DECK } from './data.mjs';

const CELL = 40;
const COLS = MAP.width / CELL;
const ROWS = MAP.height / CELL;
const EPS = 0.00001;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const alive = u => u.hp > 0 && !u.loadedIn;
const pointOK = c => Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= 0 && c.x <= MAP.width && c.y >= 0 && c.y <= MAP.height;

export function terrainAt(x, y) {
  const p = { x, y };
  if (MAP.terrain.some(t => t.type === 'road' && inside(p, t))) return 'road';
  if (MAP.terrain.some(t => t.type === 'water' && inside(p, t))) return 'water';
  return MAP.terrain.find(t => inside(p, t))?.type || 'open';
}

const PASSABLE = Array.from({ length: COLS * ROWS }, (_, i) => terrainAt((i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2) !== 'water');
const cellIndex = p => clamp(Math.floor(p.y / CELL), 0, ROWS - 1) * COLS + clamp(Math.floor(p.x / CELL), 0, COLS - 1);
const cellPoint = i => ({ x: (i % COLS) * CELL + CELL / 2, y: Math.floor(i / COLS) * CELL + CELL / 2 });

function random(game) {
  let n = game.rng | 0;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  game.rng = n >>> 0;
  return game.rng / 4294967296;
}

function clearGround(a, b) {
  const count = Math.ceil(dist(a, b) / 12);
  for (let i = 0; i <= count; i++) {
    const t = count ? i / count : 0;
    if (terrainAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) === 'water') return false;
  }
  return true;
}

function nearestGround(p) {
  p = { x: clamp(p.x, 15, MAP.width - 15), y: clamp(p.y, 15, MAP.height - 15) };
  if (terrainAt(p.x, p.y) !== 'water') return p;
  let best = null, bestD = Infinity;
  for (let i = 0; i < PASSABLE.length; i++) {
    if (!PASSABLE[i]) continue;
    const q = cellPoint(i), d = dist(p, q);
    if (d < bestD) { best = q; bestD = d; }
  }
  return best;
}

// Small bounded A* grid shared by solo and authoritative server simulations.
function pathTo(from, target, domain) {
  if (domain === 'air') return [{ x: target.x, y: target.y }];
  const destination = nearestGround(target);
  if (clearGround(from, destination)) return [destination];
  const start = cellIndex(from), finish = cellIndex(destination);
  const open = new Set([start]);
  const scores = new Float64Array(PASSABLE.length).fill(Infinity);
  const estimates = new Float64Array(PASSABLE.length).fill(Infinity);
  const parent = new Int16Array(PASSABLE.length).fill(-1);
  scores[start] = 0;
  estimates[start] = dist(cellPoint(start), destination);
  while (open.size) {
    let current = -1, low = Infinity;
    for (const i of open) if (estimates[i] < low) { current = i; low = estimates[i]; }
    if (current === finish) {
      const raw = [destination];
      while (current !== start) { raw.push(cellPoint(current)); current = parent[current]; }
      raw.reverse();
      const smooth = [];
      let origin = from;
      for (let i = 0; i < raw.length;) {
        let farthest = i;
        while (farthest + 1 < raw.length && clearGround(origin, raw[farthest + 1])) farthest++;
        smooth.push(raw[farthest]); origin = raw[farthest]; i = farthest + 1;
      }
      return smooth;
    }
    open.delete(current);
    const cx = current % COLS, cy = Math.floor(current / COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const ni = ny * COLS + nx;
      if (!PASSABLE[ni]) continue;
      if (dx && dy && (!PASSABLE[cy * COLS + nx] || !PASSABLE[ny * COLS + cx])) continue;
      const point = cellPoint(ni), land = terrainAt(point.x, point.y);
      const score = scores[current] + (dx && dy ? 56.57 : 40) * (land === 'road' ? 0.78 : land === 'forest' ? 1.5 : 1);
      if (score + EPS < scores[ni]) {
        parent[ni] = current; scores[ni] = score; estimates[ni] = score + dist(point, destination) * 0.75; open.add(ni);
      }
    }
  }
  return [];
}

function sightClear(game, from, to, domain = 'ground') {
  if (domain === 'air' || UNIT_TYPES[from.type]?.domain === 'air') return true;
  const distance = dist(from, to), count = Math.ceil(distance / 22);
  let obstruction = 0;
  for (let i = 1; i < count; i++) {
    const t = i / count, p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const land = terrainAt(p.x, p.y);
    if (land === 'forest' || land === 'town') obstruction += distance / count;
    if (game.smokes.some(s => dist(s, p) < s.radius)) obstruction += 80;
    if (obstruction > (from.type === 'recon' ? 130 : 80)) return false;
  }
  return true;
}

function sees(game, observer, target) {
  const data = UNIT_TYPES[observer.type], other = UNIT_TYPES[target.type];
  const d = dist(observer, target);
  if (d < 48) return true;
  const land = terrainAt(target.x, target.y);
  const concealment = other.domain === 'ground' && (land === 'forest' || land === 'town') ? (observer.type === 'recon' ? 0.86 : 0.61) : 1;
  const firingBonus = game.time - target.lastShot < 2.5 ? 65 : 0;
  if (d > data.vision * concealment + firingBonus) return false;
  if (game.smokes.some(s => dist(s, target) < s.radius) && d > 65) return false;
  return sightClear(game, observer, target, other.domain);
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
  const location = data.domain === 'air' ? position : nearestGround(position);
  const u = {
    id: `u${++game.unitId}`, ownerId: player.id, team: player.team, type,
    x: location.x, y: location.y, hp: data.hp, ammo: data.ammo,
    suppression: 0, heading: player.team === 0 ? 0 : Math.PI,
    cooldown: 0.2 + random(game) * 0.8, lastShot: -100, order: 'stop', target: null,
    path: [], cargo: [], loadedIn: null, smoke: data.smoke || 0,
    stock: data.stock || 0, moving: false, aiNext: 0,
  };
  game.units.push(u);
  return u;
}

export function createGame({ mode = 'solo', players = [{ id: 'player1', name: 'Comandante', team: 0 }], seed = 42, duration = RULES.defaultDuration } = {}) {
  if (mode === 'versus') mode = 'pvp';
  if (!['solo', 'coop', 'pvp'].includes(mode)) throw new Error('Modo desconocido');
  if (!Array.isArray(players) || players.length < 1 || players.length > 4) throw new Error('Jugadores no válidos');
  const used = new Set();
  const humans = players.map((p, index) => {
    if (!p || typeof p.id !== 'string' || !p.id || p.id === 'ai' || used.has(p.id)) throw new Error('Identificador de jugador no válido');
    used.add(p.id);
    return { id: p.id, name: String(p.name || `Comandante ${index + 1}`).slice(0, 32), team: mode === 'pvp' ? (p.team === 1 ? 1 : 0) : 0, deck: normalizeDeck(p.deck), credits: RULES.startCredits, ai: false, surrendered: false };
  });
  if (mode === 'pvp' && (!humans.some(p => p.team === 0) || !humans.some(p => p.team === 1))) throw new Error('El enfrentamiento necesita dos equipos');
  if (mode !== 'pvp') humans.push({ id: 'ai', name: 'Mando rival', team: 1, deck: [...DEFAULT_DECK], credits: RULES.startCredits * (mode === 'coop' ? 1.4 : 1), ai: true, surrendered: false });
  const game = {
    mode, tick: 0, time: 0, duration: Number.isFinite(duration) ? clamp(duration, 10, 3600) : RULES.defaultDuration,
    status: 'playing', winner: null, reason: null, rng: (seed >>> 0) || 42,
    players: humans, units: [], sectors: MAP.sectors.map(s => ({ ...s, owner: null, progress: 0, capturingTeam: null, contested: false })),
    tickets: [RULES.tickets, RULES.tickets], events: [], smokes: [], projectiles: [], unitId: 0, eventId: 0, aiAt: 0.5,
  };
  for (const p of humans) {
    const index = humans.filter(q => q.team === p.team).findIndex(q => q.id === p.id);
    const center = MAP.spawns[p.team];
    const starter = ['recon', 'infantry', 'tank', 'supply'].filter(t => p.deck.includes(t));
    if (!starter.length) starter.push(p.deck[0]);
    starter.forEach((type, i) => spawn(game, p, type, { x: center.x + (p.team === 0 ? 1 : -1) * ((i % 2) * 50 + 15), y: center.y - 75 + i * 45 + index * 70 }));
  }
  return game;
}

function setOrder(unit, type, target) {
  unit.order = type;
  unit.target = target ? { x: target.x, y: target.y } : null;
  unit.path = target ? pathTo(unit, target, UNIT_TYPES[unit.type].domain) : [];
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
    if (game.units.filter(u => u.hp > 0).length >= RULES.maxUnits) return { ok: false, error: 'Se ha alcanzado el límite de 120 unidades de esta versión.' };
    if (player.credits + EPS < data.cost) return { ok: false, error: 'Presupuesto insuficiente.' };
    const point = { x: command.x ?? MAP.spawns[player.team].x, y: command.y ?? MAP.spawns[player.team].y };
    if (!pointOK(point) || dist(point, MAP.spawns[player.team]) > RULES.deploymentRadius) return { ok: false, error: 'Despliega dentro del círculo de tu base.' };
    if (data.domain === 'ground' && terrainAt(point.x, point.y) === 'water') return { ok: false, error: 'No puedes desplegar en el agua.' };
    player.credits -= data.cost;
    const unit = spawn(game, player, command.unitType, point);
    emit(game, 'deploy', { unitId: unit.id, team: player.team, x: unit.x, y: unit.y });
    return { ok: true, unitId: unit.id };
  }
  const supported = ['move', 'attackMove', 'stop', 'unload', 'load', 'resupply', 'smoke', 'fire'];
  if (!supported.includes(type)) return { ok: false, error: 'Orden desconocida.' };
  if (!Array.isArray(command.unitIds) || !command.unitIds.length || command.unitIds.length > RULES.maxUnits || command.unitIds.some(id => typeof id !== 'string')) return { ok: false, error: 'Selecciona tus unidades.' };
  const ids = [...new Set(command.unitIds)];
  const units = ids.map(id => game.units.find(u => u.id === id && u.hp > 0));
  if (units.some(u => !u || u.ownerId !== playerId)) return { ok: false, error: 'Solo puedes dar órdenes a tus propias unidades.' };
  if (['move', 'attackMove', 'smoke', 'fire'].includes(type) && !pointOK(command)) return { ok: false, error: 'Destino no válido.' };
  if (units.some(u => u.loadedIn) && type !== 'unload') return { ok: false, error: 'Desembarca primero a la infantería.' };
  if (type === 'load') {
    const transport = game.units.find(u => u.id === command.transportId && alive(u));
    if (!transport || transport.ownerId !== playerId || !UNIT_TYPES[transport.type].capacity) return { ok: false, error: 'Selecciona un transporte propio.' };
    if (units.some(u => u.type !== 'infantry') || units.length + transport.cargo.length > UNIT_TYPES[transport.type].capacity) return { ok: false, error: 'Solo caben dos escuadras de infantería.' };
    if (units.some(u => dist(u, transport) > 95)) return { ok: false, error: 'Acerca la infantería al transporte (95 m).' };
    for (const u of units) { u.loadedIn = transport.id; transport.cargo.push(u.id); setOrder(u, 'stop'); u.x = transport.x; u.y = transport.y; }
    return { ok: true };
  }
  if (type === 'unload') {
    const carriers = [...new Set(units.map(u => u.loadedIn ? game.units.find(t => t.id === u.loadedIn) : u))].filter(u => u?.cargo.length);
    if (!carriers.length) return { ok: false, error: 'No hay tropas embarcadas en la selección.' };
    for (const transport of carriers) {
      transport.cargo.forEach((id, i) => {
        const u = game.units.find(candidate => candidate.id === id);
        if (!u) return;
        const point = nearestGround({ x: transport.x + 24 * (transport.team === 0 ? 1 : -1), y: transport.y + (i ? 28 : -28) });
        u.loadedIn = null; u.x = point.x; u.y = point.y; setOrder(u, 'stop');
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
    for (const gun of guns) { setOrder(gun, 'fire'); gun.target = { x: command.x, y: command.y }; }
    return { ok: true };
  }
  if (type === 'resupply') {
    for (const u of units) {
      const suppliers = game.units.filter(s => alive(s) && s.team === u.team && s.type === 'supply' && s.id !== u.id && s.stock > 1).sort((a, b) => dist(u, a) - dist(u, b));
      const base = MAP.spawns[u.team], supplier = suppliers[0];
      const target = supplier && dist(u, supplier) < dist(u, base) ? supplier : base;
      setOrder(u, 'resupply', target);
    }
    return { ok: true };
  }
  units.forEach((u, i) => {
    if (type === 'stop') { setOrder(u, 'stop'); return; }
    const cols = Math.ceil(Math.sqrt(units.length));
    const spacing = units.length > 1 ? 25 : 0;
    const target = { x: clamp(command.x + (i % cols - (cols - 1) / 2) * spacing, 10, MAP.width - 10), y: clamp(command.y + (Math.floor(i / cols) - (Math.ceil(units.length / cols) - 1) / 2) * spacing, 10, MAP.height - 10) };
    setOrder(u, type, target);
  });
  return { ok: true };
}

function targetAllowed(unit, target) {
  return UNIT_TYPES[unit.type].targets.includes(UNIT_TYPES[target.type].domain);
}

function chooseTarget(game, unit, visibility) {
  const data = UNIT_TYPES[unit.type];
  if (!data.damage || unit.ammo < 1) return null;
  let chosen = null, best = Infinity;
  for (const target of game.units) {
    if (!alive(target) || target.team === unit.team || !visibility.has(target.id) || !targetAllowed(unit, target)) continue;
    const distance = dist(unit, target);
    if (distance > data.range || distance < (data.minRange || 0)) continue;
    if (unit.type !== 'artillery' && !sightClear(game, unit, target, UNIT_TYPES[target.type].domain)) continue;
    const priority = distance + (target.type === 'supply' ? 40 : target.type === 'recon' ? -20 : 0);
    if (priority < best) { best = priority; chosen = target; }
  }
  return chosen;
}

function damageUnit(game, unit, raw, attacker, area = false) {
  if (unit.hp <= 0) return;
  const data = UNIT_TYPES[unit.type], land = terrainAt(unit.x, unit.y);
  const cover = data.domain === 'air' ? 1 : land === 'forest' ? (unit.type === 'infantry' ? 0.5 : 0.78) : land === 'town' ? (unit.type === 'infantry' ? 0.4 : 0.72) : 1;
  const antiArmor = ['tank', 'helicopter', 'jet', 'artillery'].includes(attacker.type) ? 0.58 : attacker.type === 'infantry' && dist(unit, attacker) < 100 ? 0.65 : 1;
  const impact = Math.max(raw * 0.13, raw - data.armor * antiArmor) * cover;
  unit.hp = Math.max(0, unit.hp - impact);
  unit.suppression = clamp(unit.suppression + (area ? 0.39 : 0.11 + impact / data.hp * 0.3), 0, 1);
  emit(game, 'hit', { x: unit.x, y: unit.y, team: unit.team, unitId: unit.id, damage: Math.round(impact), sourceType: attacker.type });
  if (unit.hp <= 0) {
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
  unit.ammo = Math.max(0, unit.ammo - 1);
  unit.cooldown = data.reload * (1 + unit.suppression * 1.8);
  unit.lastShot = game.time;
  unit.heading = Math.atan2(target.y - unit.y, target.x - unit.x);
  if (unit.type === 'artillery') {
    const angle = random(game) * Math.PI * 2, spread = 12 + random(game) * 30;
    const x = clamp(target.x + Math.cos(angle) * spread, 0, MAP.width), y = clamp(target.y + Math.sin(angle) * spread, 0, MAP.height);
    game.projectiles.push({ x, y, due: game.time + 1.25, team: unit.team, ownerId: unit.ownerId, type: unit.type, damage: data.damage, radius: data.blast });
    emit(game, 'shot', { x: unit.x, y: unit.y, tx: x, ty: y, team: unit.team, unitType: unit.type, indirect: true });
    return;
  }
  const accuracy = clamp(0.9 - unit.suppression * 0.5 - (unit.moving ? 0.19 : 0) - (target.moving && UNIT_TYPES[target.type].domain === 'air' ? 0.08 : 0), 0.18, 0.94);
  const hit = random(game) < accuracy;
  emit(game, 'shot', { x: unit.x, y: unit.y, tx: target.x, ty: target.y, team: unit.team, unitType: unit.type, hit });
  if (hit && !coordinate) damageUnit(game, target, data.damage * (0.9 + random(game) * 0.2), unit);
  else if (!coordinate) target.suppression = clamp(target.suppression + 0.055, 0, 1);
}

function updateMovement(unit, dt, enemy) {
  const data = UNIT_TYPES[unit.type];
  unit.moving = false;
  if (!unit.path.length || (unit.order === 'attackMove' && enemy && unit.ammo >= 1)) return;
  let point = unit.path[0], distance = dist(unit, point);
  if (unit.order === 'resupply' && unit.path.length === 1 && distance < 58) { unit.path = []; return; }
  const land = terrainAt(unit.x, unit.y);
  const modifier = data.domain === 'air' ? 1 : land === 'road' ? 1.38 : land === 'forest' ? (unit.type === 'infantry' ? 0.82 : 0.5) : land === 'town' ? (unit.type === 'infantry' ? 0.9 : 0.65) : 1;
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
    const inBase = dist(unit, MAP.spawns[unit.team]) < 175;
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
    if (ai.credits >= UNIT_TYPES[type].cost) applyCommand(game, ai.id, { type: 'deploy', unitType: type, x: MAP.spawns[ai.team].x + random(game) * 70 - 35, y: MAP.spawns[ai.team].y + random(game) * 190 - 95 });
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
    if (unit.type === 'supply') {
      if (unit.stock < 50) { setOrder(unit, 'move', MAP.spawns[unit.team]); continue; }
      const soldiers = friends.filter(u => !['supply', 'jet', 'helicopter'].includes(u.type));
      if (soldiers.length) {
        const average = soldiers.reduce((p, u) => ({ x: p.x + u.x / soldiers.length, y: p.y + u.y / soldiers.length }), { x: 0, y: 0 });
        const target = { x: clamp(average.x + 90, 30, 1450), y: clamp(average.y, 30, 970) };
        if (dist(unit, target) > 75) setOrder(unit, 'move', target); else setOrder(unit, 'stop');
      }
      continue;
    }
    if (unit.type === 'artillery') {
      const target = enemies.find(e => dist(unit, e) < data.range && dist(unit, e) > data.minRange);
      if (target) { applyCommand(game, ai.id, { type: 'fire', unitIds: [unit.id], x: target.x, y: target.y }); continue; }
    }
    const danger = enemies.filter(e => dist(unit, e) < data.range * 0.88 && targetAllowed(unit, e)).sort((a, b) => dist(unit, a) - dist(unit, b))[0];
    if (danger && unit.type !== 'recon') { setOrder(unit, 'stop'); continue; }
    const objectives = game.sectors.map(s => ({ sector: s, score: dist(unit, s) + (s.owner === ai.team ? 300 : 0) + (s.contested ? -180 : 0) + random(game) * 290 })).sort((a, b) => a.score - b.score);
    const sector = objectives[0].sector;
    const offset = unit.type === 'artillery' ? 260 : unit.type === 'aa' ? 140 : unit.type === 'recon' ? 65 : 0;
    const flank = unit.type === 'recon' || unit.type === 'helicopter' ? (random(game) < 0.5 ? -65 : 65) : random(game) * 60 - 30;
    if (dist(unit, sector) > sector.radius * 0.6 || sector.owner !== ai.team) setOrder(unit, 'attackMove', { x: clamp(sector.x + offset, 30, MAP.width - 30), y: clamp(sector.y + flank, 30, MAP.height - 30) });
  }
}

export function stepGame(game, dt = 0.1) {
  if (game.status !== 'playing') return game;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1) throw new Error('El paso de simulación debe estar entre 0 y 1 segundo');
  game.tick++; game.time += dt;
  game.events = game.events.filter(e => game.time - e.time < 2.8);
  game.smokes = game.smokes.filter(s => s.until > game.time);
  for (const player of game.players) if (!player.surrendered) player.credits = Math.min(9999, player.credits + RULES.incomePerSecond * (player.ai && game.mode === 'coop' ? 1.5 : 1) * dt);
  if (game.time >= game.aiAt) { updateAI(game); game.aiAt = game.time + 2.1; }
  const views = [visibleSet(game, 0), visibleSet(game, 1)];
  for (const unit of game.units) {
    if (!alive(unit)) continue;
    unit.suppression = Math.max(0, unit.suppression - dt * 0.075);
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    const target = chooseTarget(game, unit, views[unit.team]);
    updateMovement(unit, dt, target);
    if (unit.cooldown <= 0 && unit.ammo >= 1 && unit.suppression < 0.97) {
      if (unit.type === 'artillery' && unit.order === 'fire' && unit.target) {
        const range = dist(unit, unit.target);
        if (range <= UNIT_TYPES.artillery.range && range >= UNIT_TYPES.artillery.minRange) shoot(game, unit, unit.target, true);
      } else if (target && alive(target)) shoot(game, unit, target);
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

export function snapshotFor(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new Error('Jugador no autorizado');
  const visible = visibleSet(game, player.team);
  const round = n => Math.round(n * 100) / 100;
  const units = game.units.filter(u => u.hp > 0 && visible.has(u.id) && (!u.loadedIn || u.team === player.team)).map(u => {
    const ownTeam = u.team === player.team, data = UNIT_TYPES[u.type];
    return {
      id: u.id, ownerId: u.ownerId, team: u.team, type: u.type, x: round(u.x), y: round(u.y), hp: round(u.hp), maxHp: data.hp,
      ammo: ownTeam ? round(u.ammo) : null, maxAmmo: ownTeam ? data.ammo : null,
      suppression: round(u.suppression), heading: round(u.heading), domain: data.domain,
      order: ownTeam ? u.order : null, target: ownTeam && u.target ? { ...u.target } : null,
      cargo: ownTeam ? [...u.cargo] : [], loadedIn: ownTeam ? u.loadedIn : null,
      stock: ownTeam ? round(u.stock) : null, smoke: ownTeam ? u.smoke : null,
      moving: u.moving, terrainType: terrainAt(u.x, u.y),
    };
  });
  const events = game.events.filter(e => ['capture', 'victory'].includes(e.type) || e.team === player.team || (Number.isFinite(e.x) && pointVisible(game, player.team, e))).map(e => ({ ...e }));
  return {
    tick: game.tick, time: round(game.time), duration: game.duration, mode: game.mode,
    status: game.status, winner: game.winner, reason: game.reason,
    playerId: player.id, team: player.team, units,
    players: game.players.map(p => ({ id: p.id, name: p.name, team: p.team, credits: p.team === player.team ? round(p.credits) : null, ai: p.ai, surrendered: p.surrendered, deck: p.id === player.id ? [...p.deck] : undefined })),
    sectors: game.sectors.map(s => ({ ...s, progress: round(s.progress) })), tickets: game.tickets.map(round), events,
    smokes: game.smokes.filter(s => s.team === player.team || pointVisible(game, player.team, s)).map(s => ({ ...s })),
    vision: game.units.filter(u => alive(u) && u.team === player.team).map(u => ({ x: round(u.x), y: round(u.y), radius: UNIT_TYPES[u.type].vision })),
    limits: { maxUnits: RULES.maxUnits, deploymentRadius: RULES.deploymentRadius },
  };
}
