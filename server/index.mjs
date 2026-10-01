import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { createGame, snapshotFor } from '../shared/sim.mjs';
import { validateConfig } from '../shared/config.mjs';
import { createMatchControl, timeControlSnapshot, pendingOrderCount, setMatchSpeed, submitMatchCommand, advanceMatch } from '../shared/match-control.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BUFFER = 512 * 1024;

function code() { return [...randomBytes(8)].map(n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join(''); }
function token() { return randomBytes(32).toString('hex'); }
function validToken(a, b) { return typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function cleanName(value) { return typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 24) || 'Comandante' : 'Comandante'; }
function cleanDeck(value) { return Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(x)))].slice(0, 16) : undefined; }

/** A single authoritative process. No relay or third-party service is used. */
export async function createServer({
  host = '127.0.0.1', port = 8787, root = PROJECT_ROOT,
  disconnectGraceMs = 90_000, idleRoomMs = 30 * 60_000,
  tickMs = 100, snapshotMs = 200, allowedOrigins = [],
  maxRooms = 8, maxConnections = 32, duration,
} = {}) {
  if (!Number.isSafeInteger(maxRooms) || maxRooms < 1 || maxRooms > 100) throw new Error('maxRooms debe estar entre 1 y 100.');
  if (!Number.isSafeInteger(maxConnections) || maxConnections < 1 || maxConnections > 512) throw new Error('maxConnections debe estar entre 1 y 512.');
  const rooms = new Map();
  let actualPort = port;
  let stopped = false;
  const explicitOrigins = new Set(allowedOrigins);
  const rootReal = await realpath(root);

  function originAllowed(origin, request) {
    // Native test clients can omit Origin. Browser requests must match the
    // actual endpoint (or an explicitly configured static frontend origin).
    if (!origin) return true;
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
      if (explicitOrigins.has(origin)) return true;
      if (parsed.host !== request.headers.host) return false;
      const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
      const localBind = ['127.0.0.1', '::1', 'localhost'].includes(host);
      return !localBind || ['127.0.0.1', 'localhost', '::1'].includes(hostname);
    } catch { return false; }
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Método no permitido'); return; }
    try {
      const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (requested === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, service: 'frente-boreal', rooms: rooms.size }));
        return;
      }
      if (requested.includes('\\') || requested.includes('\0') || requested.split('/').some(p => p.startsWith('.'))) { res.writeHead(404); res.end(); return; }
      let relative;
      if (requested === '/' || requested === '/index.html') relative = 'index.html';
      else if (['/manifest.webmanifest', '/sw.js', '/favicon.ico', '/precache.json'].includes(requested)) relative = requested.slice(1);
      else if (/^\/(client|shared|public)\//.test(requested)) relative = requested.slice(1);
      else if (/^\/(vendor|icons)\//.test(requested)) relative = `public${requested}`;
      if (!relative || !TYPES[path.extname(relative).toLowerCase()]) { res.writeHead(404); res.end(); return; }
      let candidate = path.join(rootReal, relative);
      let resolved;
      try { resolved = await realpath(candidate); }
      catch (error) {
        if (['manifest.webmanifest', 'sw.js', 'favicon.ico', 'precache.json'].includes(relative)) resolved = await realpath(path.join(rootReal, 'public', relative));
        else throw error;
      }
      const relativeReal = path.relative(rootReal, resolved);
      if (relativeReal.startsWith('..') || path.isAbsolute(relativeReal) || !(
        ['index.html', 'manifest.webmanifest', 'sw.js', 'favicon.ico', 'precache.json'].includes(relativeReal) || /^(client|shared|public)[\\/]/.test(relativeReal)
      )) { res.writeHead(404); res.end(); return; }
      const contents = await readFile(resolved);
      res.setHeader('Content-Type', TYPES[path.extname(resolved).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', /sw\.js$|\.html$|\.webmanifest$/.test(resolved) ? 'no-cache' : 'public, max-age=3600');
      if (requested === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Content-Length', contents.length);
      res.writeHead(200);
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      if (!res.headersSent) res.writeHead(error instanceof URIError ? 400 : 404);
      res.end();
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });

  function send(ws, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFER) { ws.close(1013, 'Conexión demasiado lenta; vuelve a entrar.'); return; }
    ws.send(JSON.stringify(data));
  }
  function fail(ws, message) { send(ws, { type: 'error', message }); }
  function roomView(room) {
    return { code: room.code, mode: room.mode, hostId: room.hostId, status: room.status, paused: !!room.paused,
      config: room.config, configRevision: room.configRevision,
      players: room.players.map(p => ({ id: p.id, name: p.name, team: p.team, ready: p.ready, connected: !!p.ws })) };
  }
  function roomBroadcast(room) { const payload = { type: 'room', room: roomView(room) }; for (const p of room.players) send(p.ws, payload); }
  function stateFor(room, player) {
    return { ...snapshotFor(room.game, player.id), paused: !!room.paused,
      timeControl: timeControlSnapshot(room.clock), pendingOrders: pendingOrderCount(room.clock, player.id),
      pauseReason: room.paused ? 'Esperando la reconexión de un jugador.' : null,
      reconnectDeadline: room.paused ? Math.min(...room.players.filter(p => !p.ws).map(p => p.disconnectedAt + disconnectGraceMs)) : null };
  }
  function broadcastState(room) { if (room.game) for (const p of room.players) if (p.ws) send(p.ws, { type: 'state', state: stateFor(room, p) }); }
  function setPaused(room) {
    const paused = room.status === 'playing' && room.players.some(p => !p.ws);
    if (paused !== room.paused) {
      room.paused = paused;
      room.lastStepAt = performance.now();
      if (room.clock) room.clock.accumulator = 0;
      roomBroadcast(room); broadcastState(room);
    }
  }
  function endRoom(room, message) {
    rooms.delete(room.code);
    room.status = 'ended';
    for (const p of room.players) {
      if (p.ws) { send(p.ws, { type: 'ended', message }); p.ws.context = null; }
      p.ws = null;
    }
  }
  function detach(ws, explicit = false) {
    const context = ws.context;
    ws.context = null;
    if (!context || context.player.ws !== ws) return;
    const { room, player } = context;
    player.ws = null;
    player.disconnectedAt = Date.now();
    room.lastActive = Date.now();
    if (explicit && room.status === 'playing') { endRoom(room, `${player.name} ha abandonado la partida.`); return; }
    if (explicit) {
      room.players = room.players.filter(p => p !== player);
      if (!room.players.length) { rooms.delete(room.code); return; }
      if (room.hostId === player.id) room.hostId = room.players[0].id;
    }
    setPaused(room);
    roomBroadcast(room);
  }
  function attach(ws, room, player, rotate = false) {
    const previous = player.ws;
    if (previous && previous !== ws) {
      previous.context = null;
      send(previous, { type: 'ended', message: 'La sesión se ha recuperado en otra conexión.' });
      previous.close(4001, 'Sesión recuperada');
    }
    if (rotate) player.token = token();
    player.ws = ws;
    player.disconnectedAt = null;
    ws.context = { room, player };
    room.lastActive = Date.now();
    send(ws, { type: 'welcome', playerId: player.id, token: player.token, code: room.code });
    setPaused(room);
    roomBroadcast(room);
    if (room.game) send(ws, { type: 'state', state: stateFor(room, player) });
  }
  function newPlayer(ws, room, message) {
    const player = { id: randomBytes(10).toString('hex'), token: token(), name: cleanName(message.name),
      team: room.mode === 'versus' ? room.players.length : 0, ready: false, ws: null, disconnectedAt: null,
      deck: cleanDeck(message.deck), lastSeq: -1, commandAcks: new Map() };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    attach(ws, room, player);
  }

  function onMessage(ws, raw, binary) {
    if (binary) { ws.close(1003, 'Solo JSON de texto'); return; }
    const now = Date.now();
    ws.rate.tokens = Math.min(80, ws.rate.tokens + (now - ws.rate.last) * 0.03);
    ws.rate.last = now;
    if (ws.rate.tokens < 1) { ws.close(1008, 'Demasiadas solicitudes'); return; }
    ws.rate.tokens--;
    let message;
    try { message = JSON.parse(raw.toString()); }
    catch { fail(ws, 'Mensaje JSON no válido.'); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') { fail(ws, 'Mensaje no válido.'); return; }

    if (['create', 'join', 'resume'].includes(message.type)) {
      if (ws.context) { fail(ws, 'Abandona tu sala antes de entrar en otra.'); return; }
      if (message.type === 'create') {
        if (!['solo', 'coop', 'versus'].includes(message.mode)) { fail(ws, 'Modo de juego no válido.'); return; }
        const checked = validateConfig(message.config);
        if (!checked.ok) { fail(ws, checked.error); return; }
        if (rooms.size >= maxRooms) { fail(ws, 'El servidor está lleno. Prueba más tarde.'); return; }
        let roomCode; do { roomCode = code(); } while (rooms.has(roomCode));
        const room = { code: roomCode, mode: message.mode, hostId: null, players: [], status: 'lobby', game: null, paused: false,
          config: checked.config, configRevision: 1, lastActive: now, lastSnapshot: 0 };
        rooms.set(room.code, room);
        newPlayer(ws, room, message);
        return;
      }
      const roomCode = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
      const room = rooms.get(roomCode);
      if (!room) { fail(ws, 'La sala no existe o ha caducado.'); return; }
      if (message.type === 'resume') {
        const player = room.players.find(p => validToken(message.token, p.token));
        if (!player) { fail(ws, 'No se pudo recuperar la sesión.'); return; }
        if (!player.ws && now - player.disconnectedAt >= disconnectGraceMs) { fail(ws, 'El plazo de reconexión ha terminado.'); return; }
        attach(ws, room, player, true);
        return;
      }
      if (room.status !== 'lobby') { fail(ws, 'La partida ya ha empezado.'); return; }
      if (room.players.length >= (room.mode === 'solo' ? 1 : 2)) { fail(ws, 'La sala está llena.'); return; }
      newPlayer(ws, room, message);
      return;
    }
    const context = ws.context;
    if (!context || context.player.ws !== ws) { fail(ws, 'Primero crea una sala o entra en ella.'); return; }
    const { room, player } = context;
    room.lastActive = now;
    if (message.type === 'leave') { detach(ws, true); send(ws, { type: 'ended', message: 'Has salido de la sala.' }); return; }
    if (message.type === 'configure') {
      if (player.id !== room.hostId) { fail(ws, 'Solo el anfitrión puede cambiar los ajustes.'); return; }
      if (room.status !== 'lobby') { fail(ws, 'Los ajustes quedan bloqueados al comenzar.'); return; }
      if (message.config === undefined) { fail(ws, 'Indica los ajustes de la partida.'); return; }
      const checked = validateConfig(message.config);
      if (!checked.ok) { fail(ws, checked.error); return; }
      if (JSON.stringify(checked.config) !== JSON.stringify(room.config)) {
        room.config = checked.config;
        room.configRevision++;
        for (const p of room.players) p.ready = false;
      }
      roomBroadcast(room);
      return;
    }
    if (message.type === 'team') {
      if (room.status !== 'lobby') { fail(ws, 'Los equipos se eligen antes de empezar.'); return; }
      if (![0, 1].includes(message.team) || (room.mode !== 'versus' && message.team !== 0)) { fail(ws, 'Equipo no válido para este modo.'); return; }
      player.team = message.team;
      for (const p of room.players) p.ready = false;
      roomBroadcast(room);
      return;
    }
    if (message.type === 'ready') {
      if (room.status !== 'lobby' || typeof message.ready !== 'boolean') { fail(ws, 'No se puede cambiar la preparación ahora.'); return; }
      if (message.ready && message.configRevision !== room.configRevision) { fail(ws, 'Los ajustes han cambiado. Revísalos antes de marcarte como preparado.'); return; }
      player.ready = message.ready;
      roomBroadcast(room);
      return;
    }
    if (message.type === 'start') {
      if (player.id !== room.hostId) { fail(ws, 'Solo el anfitrión puede iniciar.'); return; }
      if (room.status !== 'lobby') { fail(ws, 'La partida ya ha empezado.'); return; }
      const required = room.mode === 'solo' ? 1 : 2;
      if (room.players.length !== required || room.players.some(p => !p.ready || !p.ws)) { fail(ws, 'Todos los jugadores deben estar conectados y preparados.'); return; }
      if (room.mode === 'versus' && new Set(room.players.map(p => p.team)).size !== 2) { fail(ws, 'Elegid equipos diferentes para el duelo.'); return; }
      room.game = createGame({ mode: room.mode, players: room.players.map(({id, name, team, deck}) => ({id, name, team, deck})), config: room.config, seed: randomBytes(4).readUInt32LE(), ...(duration ? { duration } : {}) });
      room.config = room.game.config;
      room.clock = createMatchControl(room.game);
      room.lastStepAt = performance.now();
      room.status = 'playing';
      room.paused = false;
      roomBroadcast(room);
      broadcastState(room);
      return;
    }
    if (message.type === 'time') {
      if (room.status !== 'playing') { fail(ws, 'La partida no está en curso.'); return; }
      const result = setMatchSpeed(room.game, room.clock, player.id, message.speed);
      if (!result.ok) { fail(ws, result.error); return; }
      room.lastStepAt = performance.now();
      broadcastState(room);
      return;
    }
    if (message.type === 'command') {
      const seq = message.seq;
      if (!Number.isSafeInteger(seq) || seq < 0) { fail(ws, 'La orden necesita un número de secuencia válido.'); return; }
      if (player.commandAcks.has(seq)) { send(ws, player.commandAcks.get(seq)); return; }
      if (seq <= player.lastSeq) { send(ws, { type: 'ack', seq, ok: false, error: 'Orden antigua descartada.' }); return; }
      let result;
      if (room.status !== 'playing') result = { ok: false, error: 'La partida no está en curso.' };
      else if (room.paused) result = { ok: false, error: 'Partida en pausa: espera la reconexión.' };
      else if (!message.command || typeof message.command !== 'object' || Array.isArray(message.command)) result = { ok: false, error: 'Orden no válida.' };
      else result = submitMatchCommand(room.game, room.clock, player.id, message.command, seq);
      const ack = { type: 'ack', seq, ok: result?.ok === true, ...(result?.queued ? { queued: true } : {}), ...(result?.error ? { error: String(result.error) } : {}) };
      player.lastSeq = seq;
      player.commandAcks.set(seq, ack);
      while (player.commandAcks.size > 256) player.commandAcks.delete(player.commandAcks.keys().next().value);
      send(ws, ack);
      return;
    }
    fail(ws, 'Tipo de mensaje desconocido.');
  }

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; }
    catch { socket.destroy(); return; }
    if (pathname !== '/ws' || !originAllowed(req.headers.origin, req) || wss.clients.size >= maxConnections) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', ws => {
    ws.context = null;
    ws.rate = { tokens: 80, last: Date.now() };
    ws.alive = true;
    ws.connectedAt = Date.now();
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw, binary) => {
      try { onMessage(ws, raw, binary); }
      catch (error) { console.error('Error de protocolo:', error); fail(ws, 'No se pudo procesar la solicitud.'); }
    });
    ws.on('close', () => detach(ws));
    ws.on('error', () => { /* close handles player presence */ });
  });

  const loop = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      try {
        const expired = room.players.filter(p => !p.ws && now - p.disconnectedAt >= disconnectGraceMs);
        if (expired.length && room.status === 'playing') { endRoom(room, 'Partida finalizada: se agotó el plazo de reconexión.'); continue; }
        for (const p of expired) {
          room.players = room.players.filter(q => q !== p);
          if (room.hostId === p.id) room.hostId = room.players[0]?.id;
        }
        if (!room.players.length) { rooms.delete(room.code); continue; }
        if (expired.length) roomBroadcast(room);
        if (room.status !== 'playing' && now - room.lastActive > idleRoomMs) { endRoom(room, 'Sala cerrada por inactividad.'); continue; }
        if (room.status === 'playing') {
          const stepAt = performance.now();
          const elapsed = (stepAt - room.lastStepAt) / 1000;
          room.lastStepAt = stepAt;
          const advanced = advanceMatch(room.game, room.clock, elapsed, { suspended: room.paused });
          for (const result of advanced.results) {
            const player = room.players.find(value => value.id === result.playerId);
            if (!player) continue;
            const ack = { type: 'ack', seq: result.seq, ok: result.ok, queued: false, ...(result.error ? { error: result.error } : {}) };
            player.commandAcks.set(result.seq, ack);
            while (player.commandAcks.size > 256) player.commandAcks.delete(player.commandAcks.keys().next().value);
            send(player.ws, { ...ack, type: 'commandResult' });
          }
          room.lastActive = now;
          if (room.game.status === 'finished') { room.status = 'finished'; roomBroadcast(room); broadcastState(room); }
        }
        if (room.game && now - room.lastSnapshot >= snapshotMs) { broadcastState(room); room.lastSnapshot = now; }
      } catch (error) {
        console.error('Error de simulación:', error);
        endRoom(room, 'La partida se ha detenido por un error del servidor.');
      }
    }
  }, tickMs);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive || (!ws.context && Date.now() - ws.connectedAt > 60_000)) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 15_000);
  loop.unref(); heartbeat.unref();

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  actualPort = server.address().port;
  async function close() {
    if (stopped) return;
    stopped = true;
    clearInterval(loop); clearInterval(heartbeat);
    for (const room of rooms.values()) endRoom(room, 'El servidor se ha cerrado.');
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
  return { server, wss, address: { host, port: actualPort, url: `http://${host.includes(':') ? `[${host}]` : host}:${actualPort}` }, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createServer({ host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 8787), allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean), maxRooms: Number(process.env.MAX_ROOMS || 8), maxConnections: Number(process.env.MAX_CONNECTIONS || 32) });
  console.log(`Frente Boreal disponible en ${app.address.url}`);
  console.log(app.address.host === '127.0.0.1' ? 'Acceso local al ordenador. No se ha abierto el cortafuegos ni publicado en Internet.' : 'Escuchando en HOST configurado explícitamente.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
