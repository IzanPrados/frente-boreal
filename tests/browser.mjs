import assert from 'node:assert/strict';
import { mkdir, appendFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Optional browser QA. It uses isolated browser contexts, never a personal profile.
// Install Playwright separately or set PLAYWRIGHT_MODULE to its module URL.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.GAME_URL || 'http://127.0.0.1:8787';
const screenshotDirectory = resolve(root, 'docs', 'screenshots');
const reportPath = resolve(root, 'docs', 'PRUEBAS-NAVEGADOR.md');
const results = [];
const graphics = new Set();
const offlineOnly = process.argv.includes('--offline-only');
const skipOffline = process.argv.includes('--skip-offline');
await mkdir(screenshotDirectory, { recursive: true });
const health = await fetch(`${base}/health`);
assert.equal(health.status, 200, 'El servidor debe estar ejecutándose antes de la prueba.');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const version = browser.version();

function watch(page) {
  const errors = [];
  const frames = new Map();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    try {
      const packet = JSON.parse(String(payload));
      if (packet.type === 'state') {
        frames.set(packet.state.tick, packet.state);
        if (frames.size > 100) frames.delete(frames.keys().next().value);
      }
    } catch { /* Binary or unrelated transport traffic is not a game snapshot. */ }
  }));
  return { errors, frames };
}

async function boot(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__FB__?.renderStats != null, null, { timeout: 30000 });
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('#viewport canvas')?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'Adaptador no expuesto por el navegador';
  });
  graphics.add(renderer);
  assert(!/SwiftShader|llvmpipe|Software Rasterizer/i.test(renderer), 'Se requiere GPU; no ejecutar esta prueba con rasterizador por software.');
}

async function playState(page) {
  await page.waitForFunction(() => window.__FB__?.state?.status === 'playing' && window.__FB__.state.tick > 2, null, { timeout: 20000 });
}

async function closeDeploy(page) {
  if (await page.locator('#closeDeploy').isVisible()) await page.locator('#closeDeploy').click();
}

async function ownUnitPoint(page) {
  return page.evaluate(() => {
    const diagnostic = window.__FB__;
    for (const unit of diagnostic.state.units) {
      if (unit.ownerId !== diagnostic.playerId || unit.loadedIn || unit.domain !== 'ground') continue;
      const point = diagnostic.project(unit.x, unit.y, 12);
      const hit = document.elementFromPoint(point.x, point.y);
      if (point.x > 35 && point.x < innerWidth - 35 && point.y > 120 && point.y < innerHeight - 170 && hit?.closest('#viewport')) {
        return { id: unit.id, x: unit.x, y: unit.y, screen: point };
      }
    }
    return null;
  });
}

async function selectAndMove(page) {
  await closeDeploy(page);
  const unit = await ownUnitPoint(page);
  assert(unit, 'Debe existir una unidad propia visible y accesible en el campo de batalla.');
  await page.mouse.click(unit.screen.x, unit.screen.y);
  await page.waitForFunction((id) => window.__FB__.selected.includes(id), unit.id);
  await page.locator('[data-order="move"]').click();
  const target = await page.evaluate(({ x, y }) => window.__FB__.project(x + 85, y + 20, 0), unit);
  const targetClear = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('#viewport'), target);
  assert(targetClear, 'El destino debe ser un punto de mapa accesible, sin controles superpuestos.');
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction(({ id, x, y }) => {
    const moved = window.__FB__.state.units.find((value) => value.id === id);
    return moved && Math.hypot(moved.x - x, moved.y - y) > 20;
  }, unit, { timeout: 15000 });
  const moved = await page.evaluate((id) => {
    const unit = window.__FB__.state.units.find((value) => value.id === id);
    return { id: unit.id, x: unit.x, y: unit.y, order: unit.order };
  }, unit.id);
  return { unitId: unit.id, distance: Math.round(Math.hypot(moved.x - unit.x, moved.y - unit.y) * 10) / 10 };
}

async function checkCoherence(first, second, mode) {
  let a;
  let b;
  for (let attempt = 0; attempt < 30; attempt++) {
    const tick = [...first.frames.keys()].reverse().find((value) => second.frames.has(value));
    if (tick != null) { a = first.frames.get(tick); b = second.frames.get(tick); break; }
    await new Promise((done) => setTimeout(done, 100));
  }
  assert(a && b, 'Los dos clientes deben recibir al menos un tick compartido.');
  assert.deepEqual(a.tickets, b.tickets);
  assert.deepEqual(a.sectors, b.sectors);
  assert.equal(a.time, b.time);
  if (mode === 'coop') assert.deepEqual(a.units, b.units, 'El equipo comparte exactamente la misma visibilidad en un tick común.');
  else assert.notEqual(a.team, b.team);
  return { commonTick: a.tick, visibleUnitsFirst: a.units.length, visibleUnitsSecond: b.units.length };
}

async function networkCase(mode) {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })));
  const [a, b] = await Promise.all(contexts.map((context) => context.newPage()));
  const first = watch(a);
  const second = watch(b);
  try {
    await Promise.all([boot(a), boot(b)]);
    await a.locator('#playerName').fill('Prueba Águila');
    await b.locator('#playerName').fill('Prueba Bruma');
    await a.locator(mode === 'coop' ? '#coopButton' : '#versusButton').click();
    await a.locator('#lobbyCode').waitFor({ state: 'visible' });
    const code = await a.locator('#lobbyCode').textContent();
    assert.match(code, /^[A-Z2-9]{8}$/);
    await b.locator('#roomCode').fill(code);
    await b.locator('#joinButton').click();
    await b.locator('#lobbyScreen').waitFor({ state: 'visible' });
    await a.waitForFunction(() => document.querySelectorAll('#playersList .player-row').length === 2);
    if (mode === 'versus') {
      await a.locator('#teamSelect').selectOption('0');
      await b.locator('#teamSelect').selectOption('1');
    }
    await Promise.all([a.locator('#readyButton').click(), b.locator('#readyButton').click()]);
    await a.waitForFunction(() => !document.querySelector('#startButton').disabled);
    await a.locator('#startButton').click();
    await Promise.all([playState(a), playState(b)]);
    const identities = await Promise.all([a, b].map((page) => page.evaluate(() => window.__FB__.playerId)));
    assert.notEqual(identities[0], identities[1]);
    const movement = await selectAndMove(a);
    const coherence = await checkCoherence(first, second, mode);
    const oldTick = await a.evaluate(() => window.__FB__.state.tick);
    await a.reload({ waitUntil: 'domcontentloaded' });
    await a.waitForFunction(({ id, tick }) => window.__FB__?.playerId === id && window.__FB__?.state?.tick >= tick && !window.__FB__.state.paused && window.__FB__.state.status === 'playing', { id: identities[0], tick: oldTick }, { timeout: 30000 });
    await b.waitForFunction(() => window.__FB__?.state?.status === 'playing' && !window.__FB__.state.paused);
    await a.screenshot({ path: resolve(screenshotDirectory, `${mode}-desktop.png`) });
    await a.locator('#menuButton').click();
    await a.locator('#surrenderButton').click();
    if (mode === 'coop') {
      await a.waitForFunction(() => window.__FB__.state.players.find((player) => player.id === window.__FB__.playerId).surrendered);
      assert.equal(await b.evaluate(() => window.__FB__.state.status), 'playing');
      await a.locator('#menuButton').click();
      await a.locator('#exitOnline').click();
      await b.locator('#resultScreen').waitFor({ state: 'visible' });
    } else {
      await Promise.all([a.locator('#resultScreen').waitFor({ state: 'visible' }), b.locator('#resultScreen').waitFor({ state: 'visible' })]);
    }
    assert.deepEqual([...first.errors, ...second.errors], []);
    return { contexts: 2, creationJoinReadyStart: true, movement, coherence, reloadRetainedPlayer: true, ending: mode === 'coop' ? 'Retirada permite observar; salida explícita termina sala' : 'Rendición termina para ambos', pageErrors: 0 };
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}

async function touchCase(name, viewport) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  const watched = watch(page);
  try {
    await boot(page);
    await page.locator('#soloButton').tap();
    await playState(page);
    await closeDeploy(page);
    const layout = await page.evaluate(() => {
      const ids = ['hud', 'gameTools', 'selectionPanel', 'mapPanel'];
      return {
        width: innerWidth, height: innerHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        panels: ids.map((id) => { const rect = document.getElementById(id).getBoundingClientRect(); return { id, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, clipped: rect.x < -1 || rect.y < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1 }; }),
        clippedButtons: [...document.querySelectorAll('#hud button,#gameTools button,#selectionPanel button')].filter((button) => { const r = button.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1); }).map((button) => button.textContent.trim()),
      };
    });
    assert.equal(layout.horizontalOverflow, false);
    assert.equal(layout.panels.some((panel) => panel.clipped), false, JSON.stringify(layout));
    assert.deepEqual(layout.clippedButtons, []);
    const center = { x: Math.round(viewport.width / 2), y: Math.round((120 + Math.min(...layout.panels.filter((item) => item.id === 'selectionPanel').map((item) => item.y))) / 2) };
    assert(await page.evaluate((point) => !!document.elementFromPoint(point.x, point.y)?.closest('#viewport'), center), 'Los gestos necesitan un punto de mapa libre.');
    const before = await page.evaluate(() => ({ camera: window.__FB__.camera, orders: window.__FB__.state.units.filter((unit) => unit.ownerId === window.__FB__.playerId).map((unit) => ({ id: unit.id, order: unit.order, target: unit.target })) }));
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x, y: center.y, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + 45, y: center.y + 10, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const afterPan = await page.evaluate(() => window.__FB__.camera);
    assert(Math.hypot(afterPan.x - before.camera.x, afterPan.y - before.camera.y) > 1, 'Arrastrar con un contacto desplaza la cámara.');
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x - 35, y: center.y, id: 1 }, { x: center.x + 35, y: center.y, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x - 65, y: center.y, id: 1 }, { x: center.x + 65, y: center.y, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await page.evaluate(() => ({ camera: window.__FB__.camera, orders: window.__FB__.state.units.filter((unit) => unit.ownerId === window.__FB__.playerId).map((unit) => ({ id: unit.id, order: unit.order, target: unit.target })) }));
    assert(Math.abs(after.camera.zoom - afterPan.zoom) > 0.05, 'El gesto de dos dedos cambia el zoom.');
    assert.deepEqual(after.orders, before.orders, 'Los gestos de cámara no generan órdenes.');
    await page.locator('#focusButton').tap();
    const selectable = await ownUnitPoint(page);
    assert(selectable, 'Una unidad propia debe poder seleccionarse con el dedo.');
    await page.touchscreen.tap(selectable.screen.x, selectable.screen.y);
    await page.waitForFunction((id) => window.__FB__.selected.includes(id), selectable.id);
    await page.locator('#saveGroup').tap();
    await page.locator('[data-group="1"]').tap();
    await page.locator('[data-group="2"]').tap();
    assert.equal(await page.evaluate(() => window.__FB__.selected.length), 0);
    await page.locator('[data-group="1"]').tap();
    assert.deepEqual(await page.evaluate(() => window.__FB__.selected), [selectable.id]);
    await page.waitForFunction(() => window.__FB__.fps > 0, null, { timeout: 10000 });
    await page.screenshot({ path: resolve(screenshotDirectory, `${name}-touch.png`) });
    assert.deepEqual(watched.errors, []);
    return { viewport, horizontalOverflow: false, clippedPanels: 0, clippedButtons: 0, oneFingerPan: true, twoFingerZoom: true, tapSelection: true, saveRecallGroup: true, accidentalOrders: 0, emulation: 'Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari' };
  } finally { await context.close(); }
}

async function offlineCase() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const watched = watch(page);
  try {
    await boot(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller != null || document.querySelector('#bootStatus').textContent.includes('No se completó'), null, { timeout: 30000 });
    assert(await page.evaluate(() => !!navigator.serviceWorker.controller), await page.locator('#bootStatus').textContent());
    const saved = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((name) => name.startsWith('frente-boreal-'));
      const cache = await caches.open(names[names.length - 1]);
      const manifest = await (await cache.match('/precache.json')).json();
      const missing = [];
      for (const entry of manifest.files) if (!(await cache.match(entry.url))) missing.push(entry.url);
      return { files: manifest.files.length, missing, cache: names[names.length - 1] };
    });
    assert.deepEqual(saved.missing, []);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__FB__?.renderStats != null, null, { timeout: 15000 });
    await page.locator('#soloButton').click();
    await page.waitForFunction(() => window.__FB__?.state?.tick > 30, null, { timeout: 15000 });
    const tick = await page.evaluate(() => window.__FB__.state.tick);
    await page.screenshot({ path: resolve(screenshotDirectory, 'solo-offline.png') });
    assert.deepEqual(watched.errors, []);
    return { loadedInFreshContext: true, cachedFiles: saved.files, missing: 0, offlineReload: true, soloTick: tick, pageErrors: 0, limitation: 'Desconexión emulada con Playwright; no modo avión físico' };
  } finally { await context.close(); }
}

async function run(name, action) {
  const start = Date.now();
  try {
    const evidence = await action();
    results.push({ name, passed: true, seconds: Math.round((Date.now() - start) / 100) / 10, evidence });
  } catch (error) {
    results.push({ name, passed: false, seconds: Math.round((Date.now() - start) / 100) / 10, error: error.message });
    process.exitCode = 1;
  }
  console.log(JSON.stringify(results[results.length - 1]));
}

try {
  if (!offlineOnly) {
    await run('UI multijugador 1 contra 1', () => networkCase('versus'));
    await run('UI multijugador cooperativo', () => networkCase('coop'));
    await run('Viewport teléfono 844×390 y gestos táctiles emulados', () => touchCase('phone', { width: 844, height: 390 }));
    await run('Viewport tableta 1024×768 y gestos táctiles emulados', () => touchCase('tablet', { width: 1024, height: 768 }));
  }
  if (!skipOffline) await run('PWA individual tras recarga sin red', offlineCase);
} finally {
  await browser.close();
  let exists = true;
  try { await access(reportPath); } catch { exists = false; }
  if (!exists) await appendFile(reportPath, '# Pruebas de navegador\n\nPruebas automatizadas en contextos nuevos y aislados: no se reutilizaron perfiles personales, cookies ni historial. Se controló la interfaz y se leyó `window.__FB__` para observar estado/cámara, sin modificar reglas mediante API de depuración.\n\nEjecución reproducible: inicia `npm start` y ejecuta `node tests/browser.mjs`. Requiere Playwright instalado o `PLAYWRIGHT_MODULE` con su URL de módulo. `GAME_URL` permite cambiar el servidor local. `--skip-offline` y `--offline-only` separan las comprobaciones cuando se están editando recursos. Ejecuta `npm run prepare:assets` antes de probar offline.\n\n');
  const title = `## Ejecución ${new Date().toISOString()}\n\nServidor: ${base}. Navegador: Microsoft Edge/Chromium ${version}, headless, sin forzar SwiftShader. Adaptador WebGL comunicado: ${[...graphics].join('; ')}.\n\n`;
  const lines = results.map((result) => `### ${result.passed ? 'Pasó' : 'Falló'}: ${result.name}\n\nDuración: ${result.seconds} s.\n\n\`\`\`json\n${JSON.stringify(result.evidence || { error: result.error }, null, 2)}\n\`\`\`\n`).join('\n');
  await appendFile(reportPath, title + lines + '\n**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.\n\n');
}

