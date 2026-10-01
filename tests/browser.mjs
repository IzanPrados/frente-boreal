import assert from 'node:assert/strict';
import { mkdir, appendFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMap } from '../shared/maps.mjs';

// Optional browser QA. It uses isolated browser contexts, never a personal profile.
// Install Playwright separately or set PLAYWRIGHT_MODULE to its module URL.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.GAME_URL || 'http://127.0.0.1:8787';
const screenshotDirectory = process.env.BROWSER_ARTIFACT_DIR ? resolve(process.env.BROWSER_ARTIFACT_DIR) : resolve(root, 'docs', 'screenshots');
const reportPath = process.env.BROWSER_ARTIFACT_DIR ? resolve(process.env.BROWSER_ARTIFACT_DIR, 'PRUEBAS-NAVEGADOR.md') : resolve(root, 'docs', 'PRUEBAS-NAVEGADOR.md');
const results = [];
const graphics = new Set();
const offlineOnly = process.argv.includes('--offline-only');
const skipOffline = process.argv.includes('--skip-offline');
const terrainOnly = process.argv.includes('--terrain-only');
const networkOnly = process.argv.includes('--network-only');
await mkdir(screenshotDirectory, { recursive: true });
const health = await fetch(`${base}/health`);
assert.equal(health.status, 200, 'El servidor debe estar ejecutándose antes de la prueba.');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const version = browser.version();

function watch(page) {
  const errors = [];
  const frames = new Map();
  let room = null;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    try {
      const packet = JSON.parse(String(payload));
      if (packet.type === 'room') room = packet.room;
      if (packet.type === 'state') {
        frames.set(packet.state.tick, packet.state);
        if (frames.size > 100) frames.delete(frames.keys().next().value);
      }
    } catch { /* Binary or unrelated transport traffic is not a game snapshot. */ }
  }));
  return { errors, frames, get room() { return room; } };
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

async function configure(page, { mapId = 'valle-bruma', resources = 410, income = 1, maxUnits = 120, minutes = 12, tickets = 300 } = {}) {
  await page.locator('#configScreen').waitFor({ state: 'visible' });
  await page.locator('#configMap').selectOption(mapId);
  await page.locator('#configResources').fill(String(resources));
  await page.locator('#configIncome').selectOption(String(income));
  await page.locator('#configUnits').fill(String(maxUnits));
  await page.locator('#configDuration').fill(String(minutes));
  await page.locator('#configTickets').fill(String(tickets));
  await page.locator('#confirmConfig').click();
}

async function selectedOrders(page) {
  return page.evaluate(() => window.__FB__.state.units.filter(unit => unit.ownerId === window.__FB__.playerId).map(unit => ({ id: unit.id, order: unit.order, target: unit.target })));
}

async function assertPanelsFolded(page) {
  for (const id of ['deployPanel', 'mapPanel', 'groupPanel', 'unitPanel', 'buildingPanel']) assert.equal(await page.locator('#' + id).isVisible(), false, `${id} empieza cerrado.`);
}

async function ownUnitPoint(page) {
  return page.evaluate(() => {
    const diagnostic = window.__FB__;
    for (const unit of diagnostic.state.units) {
      if (unit.ownerId !== diagnostic.playerId || unit.loadedIn || unit.domain !== 'ground') continue;
      const point = diagnostic.project(unit.x, unit.y, 12);
      const hit = document.elementFromPoint(point.x, point.y);
      if (point.x > 35 && point.x < innerWidth - 35 && point.y > 65 && point.y < innerHeight - 120 && hit?.closest('#viewport')) {
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
  await assertPanelsFolded(page);
  await page.locator('[data-order="move"]').click();
  assert.equal(await page.locator('#selectionPanel').isVisible(), false, 'La franja contextual se retira mientras eliges el destino.');
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
  assert.deepEqual(a.config, b.config, 'Ambos navegadores reciben la misma configuración de partida.');
  assert.equal(a.mapId, b.mapId);
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
    await a.locator('#configResources').fill('700');
    await a.locator('#resetConfig').click();
    assert.equal(await a.locator('#configResources').inputValue(), '410');
    assert.equal(await a.locator('#configIncome').inputValue(), '1');
    await configure(a, { mapId: 'frontera-de-los-siete-pasos', resources: 1200, income: 2 });
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
    assert.equal(await b.locator('#editConfig').isVisible(), false, 'Solo el anfitrión edita las condiciones.');
    assert.equal(await a.locator('#lobbyConfigSummary').textContent(), await b.locator('#lobbyConfigSummary').textContent());
    assert.equal(first.room.config.mapId, 'frontera-de-los-siete-pasos');
    await Promise.all([a.locator('#readyButton').click(), b.locator('#readyButton').click()]);
    await a.waitForFunction(() => !document.querySelector('#startButton').disabled);
    await a.locator('#editConfig').click();
    await configure(a, { mapId: 'frontera-de-los-siete-pasos', resources: 900, income: 3, maxUnits: 72, minutes: 15, tickets: 500 });
    await Promise.all([a, b].map(page => page.waitForFunction(() => document.querySelector('#lobbyConfigVersion').textContent.includes('Ajustes 2') && document.querySelector('#readyButton').getAttribute('aria-pressed') === 'false')));
    assert.equal(await a.locator('#startButton').isDisabled(), true);
    assert.equal(await a.locator('#lobbyConfigSummary').textContent(), await b.locator('#lobbyConfigSummary').textContent());
    assert.deepEqual(first.room.config, second.room.config);
    await Promise.all([a.locator('#readyButton').click(), b.locator('#readyButton').click()]);
    await a.waitForFunction(() => !document.querySelector('#startButton').disabled);
    await a.locator('#startButton').click();
    await Promise.all([playState(a), playState(b)]);
    await assertPanelsFolded(a);
    assert.equal(await a.locator('#selectionPanel').isVisible(), false, 'No hay acciones sin una selección.');
    const started = await a.evaluate(() => ({ config: window.__FB__.state.config, saved: JSON.parse(localStorage.getItem('fb-match-config')) }));
    assert.deepEqual(started.config, started.saved);
    assert.equal(started.config.incomeMultiplier, 3);
    assert.equal(started.config.startingResources, 900);
    const identities = await Promise.all([a, b].map((page) => page.evaluate(() => window.__FB__.playerId)));
    assert.notEqual(identities[0], identities[1]);
    const movement = await selectAndMove(a);
    let cooperativeClock = null;
    if (mode === 'coop') {
      const change = async (controller, value) => {
        await controller.locator(`[data-speed="${value}"]`).click();
        await Promise.all([a, b].map(page => page.waitForFunction(value => value === 0 ? window.__FB__.state.timeControl.paused : !window.__FB__.state.timeControl.paused && window.__FB__.state.timeControl.speed === value, value)));
      };
      await change(a, 0);
      const pausedAt = await a.evaluate(() => ({ tick: window.__FB__.state.tick, time: window.__FB__.state.time, clock: window.__FB__.state.timeControl }));
      await a.waitForTimeout(350);
      for (const page of [a, b]) assert.equal(await page.evaluate(() => window.__FB__.state.time), pausedAt.time);
      await change(b, 0.5);
      assert.equal(await a.evaluate(() => window.__FB__.state.timeControl.changedBy), identities[1], 'El invitado controla el reloj compartido sin aprobación del anfitrión.');
      await change(a, 2);
      assert.equal(await b.evaluate(() => window.__FB__.state.timeControl.changedBy), identities[0]);
      await change(b, 0);
      cooperativeClock = { bothPlayersControlledTime: true, guestSpeed: 0.5, hostSpeed: 2, pauseFreezesBoth: true };
    } else assert.equal(await a.locator('#timeControls').isVisible(), false, 'PvP conserva su reloj normal sin estos controles.');
    const coherence = await checkCoherence(first, second, mode);
    const oldTick = await a.evaluate(() => window.__FB__.state.tick);
    await a.reload({ waitUntil: 'domcontentloaded' });
    await a.waitForFunction(({ id, tick }) => window.__FB__?.playerId === id && window.__FB__?.state?.tick >= tick && !window.__FB__.state.paused && window.__FB__.state.status === 'playing', { id: identities[0], tick: oldTick }, { timeout: 30000 });
    await b.waitForFunction(() => window.__FB__?.state?.status === 'playing' && !window.__FB__.state.paused);
    if (mode === 'coop') {
      assert.equal(await a.evaluate(() => window.__FB__.state.timeControl.paused), true, 'Recargar conserva la pausa manual vigente.');
      assert.equal(await a.evaluate(() => window.__FB__.state.timeControl.changedBy), identities[1]);
      await b.locator('[data-speed="1"]').click();
      await Promise.all([a, b].map(page => page.waitForFunction(() => !window.__FB__.state.timeControl.paused && window.__FB__.state.timeControl.speed === 1)));
      cooperativeClock.pauseRetainedOnReconnect = true;
    }
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
    return { contexts: 2, creationJoinReadyStart: true, largeMap: started.config.mapId, configVisibleToBoth: true, hostChangesResetReady: true, sameAuthorityConfig: true, savedLastConfig: true, defaultsRestored: true, movement, coherence, cooperativeClock, reloadRetainedPlayer: true, ending: mode === 'coop' ? 'Retirada permite observar; salida explícita termina sala' : 'Rendición termina para ambos', pageErrors: 0 };
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
    await configure(page, { mapId: name === 'phone-portrait' ? 'llanura-del-estuario' : 'valle-bruma' });
    await playState(page);
    await assertPanelsFolded(page);
    assert.equal(await page.locator('#selectionPanel').isVisible(), false);
    const layout = await page.evaluate(() => {
      const ids = ['hud', 'gameTools', 'timeControls'];
      const controls = [...document.querySelectorAll('#hud button,#gameTools button,#timeControls button')];
      let total = 0, clear = 0;
      for (let y = 10; y < innerHeight; y += 20) for (let x = 10; x < innerWidth; x += 20) {
        total++; if (document.elementFromPoint(x, y)?.closest('#viewport')) clear++;
      }
      return {
        width: innerWidth, height: innerHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        panels: ids.map((id) => { const rect = document.getElementById(id).getBoundingClientRect(); return { id, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, clipped: rect.x < -1 || rect.y < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1 }; }),
        clippedButtons: controls.filter((button) => { const r = button.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1); }).map((button) => button.textContent.trim()),
        undersizedButtons: controls.filter(button => { const r = button.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map(button => button.id),
        clearMapPercent: Math.round(clear / total * 100),
      };
    });
    assert.equal(layout.horizontalOverflow, false);
    assert.equal(layout.panels.some((panel) => panel.clipped), false, JSON.stringify(layout));
    assert.deepEqual(layout.clippedButtons, []);
    assert.deepEqual(layout.undersizedButtons, [], 'Los controles mantienen blancos táctiles de 44 px.');
    assert(layout.clearMapPercent >= 80, 'Al menos el 80% de los puntos muestreados deben quedar libres para el campo de batalla.');
    const center = { x: Math.round(viewport.width / 2), y: Math.round(viewport.height / 2) };
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
    const plannedTarget = await page.evaluate(unit => window.__FB__.project(unit.x + 55, unit.y + 12, 0), selectable);
    const targetWasClear = await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('#viewport'), plannedTarget);
    assert(targetWasClear, 'El destino previsto está visible antes de seleccionar.');
    await page.touchscreen.tap(selectable.screen.x, selectable.screen.y);
    await page.waitForFunction((id) => window.__FB__.selected.includes(id), selectable.id);
    await assertPanelsFolded(page);
    const selectionLayout = await page.locator('#selectionPanel').evaluate(panel => {
      const rect = panel.getBoundingClientRect();
      return { fits: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, smallButtons: [...panel.querySelectorAll('button')].filter(button => { const r = button.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map(button => button.textContent.trim()) };
    });
    assert(selectionLayout.fits, 'La franja de selección cabe en la pantalla.');
    assert.deepEqual(selectionLayout.smallButtons, []);
    assert(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('#viewport'), plannedTarget), 'Seleccionar la unidad no abre un panel encima de su destino.');
    await page.locator('#groupToggle').tap();
    await page.locator('#saveGroup').tap();
    await page.locator('[data-group="1"]').tap();
    await page.locator('[data-group="2"]').tap();
    assert.equal(await page.evaluate(() => window.__FB__.selected.length), 0);
    await page.locator('#groupToggle').tap();
    await page.locator('[data-group="1"]').tap();
    assert.deepEqual(await page.evaluate(() => window.__FB__.selected), [selectable.id]);

    const beforeCancel = await selectedOrders(page);
    await page.locator('[data-order="move"]').tap();
    const cancelRect = await page.locator('#orderHint').boundingBox();
    assert(cancelRect.height >= 44 && cancelRect.width >= 44, 'Cancelar sigue siendo cómodo con el dedo.');
    await page.locator('#orderHint').tap();
    assert.equal(await page.locator('#orderHint').isVisible(), false);
    assert.equal(await page.locator('#selectionPanel').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => window.__FB__.selected), [selectable.id]);
    assert.deepEqual(await selectedOrders(page), beforeCancel, 'Cancelar el destino pendiente no manda órdenes.');
    await page.locator('#deployToggle').tap();
    await page.locator('[data-unit="infantry"]').tap();
    assert.equal(await page.locator('#selectionPanel').isVisible(), false);
    await page.locator('#orderHint').tap();
    assert.deepEqual(await page.evaluate(() => window.__FB__.selected), [selectable.id]);
    const cancelTick = await page.evaluate(() => window.__FB__.state.tick);
    await page.waitForFunction(tick => window.__FB__.state.tick > tick + 1, cancelTick);
    assert.deepEqual(await selectedOrders(page), beforeCancel, 'Cancelar el despliegue no crea una unidad ni modifica sus órdenes.');

    // Arm an order, then open and close sheets directly over the battlefield.
    // An accidental map tap would send the order before the intentional target tap.
    await page.locator('[data-order="move"]').tap();
    assert.equal(await page.locator('#selectionPanel').isVisible(), false);
    await page.locator('#menuButton').tap();
    await page.locator('#resumeButton').tap();
    assert.match(await page.locator('#orderHint').textContent(), /Toca el destino.*Cancelar/);
    const ordersBeforePanels = await selectedOrders(page);
    for (const [toggle, close] of [['deployToggle', 'closeDeploy'], ['mapToggle', '[data-close="mapPanel"]'], ['groupToggle', '[data-close="groupPanel"]']]) {
      await page.locator('#' + toggle).tap();
      const openPanels = await page.evaluate(() => ['deployPanel', 'mapPanel', 'groupPanel', 'unitPanel'].filter(id => !document.getElementById(id).hidden));
      assert.equal(openPanels.length, 1);
      await page.locator(close.startsWith('[') ? close : '#' + close).tap();
      assert.deepEqual(await selectedOrders(page), ordersBeforePanels, 'Cerrar un panel no da una orden sobre el mapa situado debajo.');
    }
    assert.equal(await page.locator('#orderHint').isVisible(), true, 'La orden sigue esperando su destino explícito.');
    await page.touchscreen.tap(plannedTarget.x, plannedTarget.y);
    await page.waitForFunction(unit => {
      const next = window.__FB__.state.units.find(value => value.id === unit.id);
      return next && Math.hypot(next.x - unit.x, next.y - unit.y) > 12;
    }, selectable, { timeout: 10000 });
    await page.waitForFunction(() => window.__FB__.fps > 0, null, { timeout: 10000 });
    await page.screenshot({ path: resolve(screenshotDirectory, `${name}-touch.png`) });
    assert.deepEqual(watched.errors, []);
    return { viewport, clearMapPercent: layout.clearMapPercent, horizontalOverflow: false, clippedPanels: 0, clippedButtons: 0, touchTargetsAtLeast44px: true, oneFingerPan: true, twoFingerZoom: true, tapSelection: true, selectionKeepsTargetVisible: true, selectionStripFoldsDuringOrder: true, saveRecallGroup: true, cancelMovePreservesSelection: true, cancelDeployCreatesNothing: true, pauseRestoresPendingHint: true, panelCloseAccidentalOrders: 0, intentionalMoveWorked: true, emulation: 'Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari' };
  } finally { await context.close(); }
}

async function mapSwitchCase() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const watched = watch(page);
  const evidence = [];
  try {
    await boot(page);
    for (const mapId of ['llanura-del-estuario', 'frontera-de-los-siete-pasos', 'cuenca-del-norte', 'valle-bruma']) {
      const map = getMap(mapId);
      await page.locator('#soloButton').click();
      await configure(page, { mapId });
      await playState(page);
      const current = await page.evaluate(() => ({ config: window.__FB__.state.config, sectors: window.__FB__.state.sectors.length, camera: window.__FB__.camera, canvases: document.querySelectorAll('#viewport canvas').length }));
      assert.equal(current.config.mapId, mapId);
      assert.equal(current.sectors, map.sectors.length);
      assert.equal(current.canvases, 1, 'Cambiar escenario reutiliza el renderer y no apila lienzos.');
      assert.equal(current.camera.x, map.spawns[0].x);
      assert.equal(current.camera.y, map.spawns[0].y);
      await page.locator('#mapToggle').click();
      assert.equal(await page.locator('#mapName').textContent(), map.name);
      assert.equal(await page.locator('#minimap').getAttribute('height'), String(Math.round(320 * map.height / map.width)));
      await page.locator('#overviewButton').click();
      const overview = await page.evaluate(() => window.__FB__.camera);
      assert.equal(overview.x, map.width / 2);
      assert.equal(overview.y, map.height / 2);
      const overviewCorners = await page.evaluate(({ width, height }) => [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => window.__FB__.project(x, y, 0)), map);
      assert(overviewCorners.every(point => point.x >= -1 && point.y >= -1 && point.x <= 1281 && point.y <= 801), 'Vista general encuadra todo el terreno del mapa vigente.');
      await page.locator('[data-close="mapPanel"]').click();
      await page.locator('#focusButton').click();
      const focused = await page.evaluate(() => window.__FB__.camera);
      assert.equal(focused.x, map.spawns[0].x);
      assert.equal(focused.y, map.spawns[0].y);
      evidence.push({ mapId, sectors: current.sectors, overviewZoom: Math.round(overview.zoom * 100) / 100, canvasCount: current.canvases });
      await page.locator('#menuButton').click();
      await page.locator('#surrenderButton').click();
      await page.locator('#newGameButton').click();
      await page.locator('#startScreen').waitFor({ state: 'visible' });
    }
    assert.deepEqual(watched.errors, []);
    return { samePage: true, pageReloads: 0, maps: evidence, cameraMinimapAndObjectivesUpdated: true, pageErrors: 0 };
  } finally { await context.close(); }
}

async function terrainClockCase(mapId = 'valle-bruma') {
  const map = getMap(mapId);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  const watched = watch(page);
  const clickUnit = async id => {
    const point = await page.evaluate(unitId => window.__FB__.projectUnit(window.__FB__.state.units.find(unit => unit.id === unitId)), id);
    assert(point, 'La unidad conserva un indicador seleccionable.');
    assert(await page.evaluate(p => !!document.elementFromPoint(p.x, p.y)?.closest('#viewport'), point), 'El indicador de unidad está libre de paneles.');
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(unitId => window.__FB__.selected.includes(unitId), id);
  };
  const speed = async value => {
    await page.locator(`[data-speed="${value}"]`).tap();
    await page.waitForFunction(value => value === 0 ? window.__FB__.state.timeControl.paused : !window.__FB__.state.timeControl.paused && window.__FB__.state.timeControl.speed === value, value);
  };
  const selected = async id => page.evaluate(id => {
    const state = window.__FB__.state, unit = state.units.find(value => value.id === id);
    return { time: state.time, tick: state.tick, pending: state.pendingOrders, credits: state.players.find(player => player.id === window.__FB__.playerId).credits, owned: state.units.filter(value => value.ownerId === window.__FB__.playerId).length, unit: unit && { id: unit.id, x: unit.x, y: unit.y, hp: unit.hp, ammo: unit.ammo, order: unit.order, target: unit.target, garrisonedIn: unit.garrisonedIn } };
  }, id);
  try {
    await boot(page);
    await page.locator('#soloButton').tap();
    await configure(page, { mapId, resources: 1200, tickets: 1000 });
    await playState(page);
    assert.equal(await page.locator('#timeControls').isVisible(), true);
    const infantryId = await page.evaluate(() => window.__FB__.state.units.find(unit => unit.ownerId === window.__FB__.playerId && unit.type === 'infantry').id);
    const rates = [];
    for (const value of [0.5, 1, 2]) {
      await speed(value);
      const before = await selected(infantryId);
      await page.waitForTimeout(1200);
      const after = await selected(infantryId), elapsed = after.time - before.time;
      assert(elapsed > value * 0.75 && elapsed < value * 1.65, `El reloj ${value}× progresa al ritmo esperado (${elapsed}s).`);
      assert(Math.abs(after.credits - before.credits - 6 * elapsed) < 0.05, 'Los ingresos dependen del tiempo de juego a cualquier velocidad.');
      rates.push({ speed: value, gameSeconds: Math.round(elapsed * 10) / 10, income: Math.round((after.credits - before.credits) * 100) / 100 });
    }
    await speed(0);
    const frozen = await selected(infantryId);
    await clickUnit(infantryId);
    await page.locator('[data-order="move"]').tap();
    const target = await page.evaluate(unit => window.__FB__.project(unit.x + 65, unit.y + 10, 0), frozen.unit);
    await page.touchscreen.tap(target.x, target.y);
    await page.waitForFunction(() => window.__FB__.state.pendingOrders === 1);
    await page.locator('#deployToggle').tap();
    await page.locator('[data-unit="infantry"]').tap();
    const deployment = await page.evaluate(spawn => window.__FB__.project(spawn.x + 65, spawn.y + 80, 0), map.spawns[0]);
    await page.touchscreen.tap(deployment.x, deployment.y);
    await page.waitForFunction(() => window.__FB__.state.pendingOrders === 2);
    await page.waitForTimeout(350);
    const paused = await selected(infantryId);
    assert.equal(paused.time, frozen.time);
    assert.equal(paused.tick, frozen.tick);
    assert.equal(paused.credits, frozen.credits);
    assert.equal(paused.owned, frozen.owned);
    assert.deepEqual(paused.unit, frozen.unit, 'Las órdenes preparadas no cambian posición, estado ni órdenes efectivas durante pausa.');
    const camera = await page.evaluate(() => window.__FB__.camera);
    const session = await context.newCDPSession(page);
    const pinch = async (from, to) => {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 640 - from, y: 400, id: 1 }, { x: 640 + from, y: 400, id: 2 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 640 - to, y: 400, id: 1 }, { x: 640 + to, y: 400, id: 2 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await pinch(35, 55);
    const zoomed = await page.evaluate(() => window.__FB__.camera);
    assert(zoomed.zoom > camera.zoom, 'El zoom funciona con la simulación detenida.');
    await pinch(55, 35);
    await speed(2);
    await page.waitForFunction(({ id, owned }) => window.__FB__.state.pendingOrders === 0 && window.__FB__.state.units.filter(unit => unit.ownerId === window.__FB__.playerId).length === owned + 1 && window.__FB__.state.units.find(unit => unit.id === id).moving, { id: infantryId, owned: frozen.owned });
    await speed(0);
    await page.locator('#focusButton').tap();
    await clickUnit(infantryId);
    await page.locator('#unitToggle').tap();
    await page.locator('[data-order="garrison"]').tap();
    const building = map.buildings.filter(building => building.occupiable).sort((a, b) => Math.hypot(a.x - map.spawns[0].x, a.y - map.spawns[0].y) - Math.hypot(b.x - map.spawns[0].x, b.y - map.spawns[0].y))[0];
    assert(building?.occupiable);
    const roof = await page.evaluate(building => window.__FB__.projectBuilding(building), building);
    assert(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('#viewport'), roof), 'El edificio puede tocarse sin una hoja encima.');
    await page.touchscreen.tap(roof.x, roof.y);
    await page.waitForFunction(() => window.__FB__.state.pendingOrders === 1);
    const beforeEntry = await selected(infantryId);
    assert.equal(beforeEntry.unit.garrisonedIn, null, 'Preparar entrada no teletransporta la infantería.');
    await speed(2);
    await page.waitForFunction(({ id, buildingId }) => window.__FB__.state.units.find(unit => unit.id === id)?.garrisonedIn === buildingId, { id: infantryId, buildingId: building.id }, { timeout: 20000 });
    await speed(0);
    const inside = await selected(infantryId);
    assert.equal(inside.unit.hp, beforeEntry.unit.hp);
    assert.equal(inside.unit.ammo, beforeEntry.unit.ammo);
    const occupiedRoof = await page.evaluate(building => window.__FB__.projectBuilding(building), building);
    await page.touchscreen.tap(occupiedRoof.x, occupiedRoof.y);
    assert.equal(await page.locator('#buildingPanel').isVisible(), true, 'Tocar una casa propia ocupada abre su contexto.');
    assert.equal(await page.locator('#buildingOccupants button').count(), 1);
    assert.match(await page.locator('#buildingStatus').textContent(), /1 ocupadas/);
    const panels = await page.evaluate(() => ['deployPanel', 'mapPanel', 'unitPanel', 'groupPanel', 'buildingPanel'].filter(id => !document.getElementById(id).hidden));
    assert.deepEqual(panels, ['buildingPanel']);
    await page.locator('#focusButton').tap();
    await page.screenshot({ path: resolve(screenshotDirectory, `${mapId}-ocupacion-real.png`) });
    await page.locator('#exitBuilding').tap();
    await page.waitForFunction(() => window.__FB__.state.pendingOrders === 1);
    assert.equal((await selected(infantryId)).unit.garrisonedIn, building.id);
    await speed(0.5);
    await page.waitForFunction(id => !window.__FB__.state.units.find(unit => unit.id === id)?.garrisonedIn, infantryId);
    const outside = await selected(infantryId);
    assert.equal(outside.unit.hp, inside.unit.hp);
    assert.equal(outside.unit.ammo, inside.unit.ammo);
    assert(outside.unit.x < building.x || outside.unit.x > building.x + building.w || outside.unit.y < building.y || outside.unit.y > building.y + building.h);
    await page.screenshot({ path: resolve(screenshotDirectory, 'terreno-edificio-reloj.png') });
    assert.deepEqual(watched.errors, []);
    return { mapId, buildingId: building.id, rates, pausedTimeAndEconomyFrozen: true, twoOrdersQueuedWithoutEffects: true, selectionAndZoomDuringPause: true, deploymentOnResumeOnly: true, garrisonWalkedToDoor: true, occupiedBuildingPanelAccessible: true, occupantsShown: 1, explicitExitQueuedThenExecuted: true, hpAmmoPreserved: true, pageErrors: 0, limitation: 'Interacción táctil emulada en Edge; no Safari físico' };
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
      return { files: manifest.files.length, missing, paths: manifest.files.map(entry => entry.url), cache: names[names.length - 1] };
    });
    assert.deepEqual(saved.missing, []);
    for (const path of ['/shared/maps.mjs', '/shared/config.mjs', '/shared/terrain.mjs', '/shared/match-control.mjs', '/client/solo-worker.mjs']) assert(saved.paths.includes(path), `${path} debe estar disponible también sin conexión.`);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__FB__?.renderStats != null, null, { timeout: 15000 });
    await page.locator('#soloButton').click();
    await configure(page, { mapId: 'llanura-del-estuario' });
    await page.waitForFunction(() => window.__FB__?.state?.tick > 30, null, { timeout: 15000 });
    const tick = await page.evaluate(() => window.__FB__.state.tick);
    await page.screenshot({ path: resolve(screenshotDirectory, 'solo-offline.png') });
    assert.deepEqual(watched.errors, []);
    assert.equal(await page.evaluate(() => window.__FB__.state.mapId), 'llanura-del-estuario');
    return { loadedInFreshContext: true, cachedFiles: saved.files, missing: 0, offlineReload: true, soloMap: 'llanura-del-estuario', soloTick: tick, pageErrors: 0, limitation: 'Desconexión emulada con Playwright; no modo avión físico' };
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
  if (!offlineOnly && !terrainOnly) {
    await run('UI multijugador 1 contra 1', () => networkCase('versus'));
    await run('UI multijugador cooperativo', () => networkCase('coop'));
  }
  if (!offlineOnly && !terrainOnly && !networkOnly) {
    await run('Viewport teléfono 844×390 y gestos táctiles emulados', () => touchCase('phone', { width: 844, height: 390 }));
    await run('Viewport teléfono vertical 390×844 y gestos táctiles emulados', () => touchCase('phone-portrait', { width: 390, height: 844 }));
    await run('Viewport tableta 1024×768 y gestos táctiles emulados', () => touchCase('tablet', { width: 1024, height: 768 }));
    await run('Viewport tableta vertical 768×1024 y gestos táctiles emulados', () => touchCase('tablet-portrait', { width: 768, height: 1024 }));
  }
  if (!offlineOnly && !networkOnly) {
    await run('Cambiar cuatro mapas entre partidas sin recargar la página', mapSwitchCase);
    await run('Reloj y ocupación mediante controles táctiles de la interfaz', terrainClockCase);
    await run('Ocupación real en el mapa nuevo y captura de población', () => terrainClockCase('llanura-del-estuario'));
  }
  if (!skipOffline && !networkOnly) await run('PWA individual tras recarga sin red', offlineCase);
} finally {
  await browser.close();
  let exists = true;
  try { await access(reportPath); } catch { exists = false; }
  if (!exists) await appendFile(reportPath, '# Pruebas de navegador\n\nPruebas automatizadas en contextos nuevos y aislados: no se reutilizaron perfiles personales, cookies ni historial. Se controló la interfaz y se leyó `window.__FB__` para observar estado/cámara, sin modificar reglas mediante API de depuración.\n\nEjecución reproducible: inicia `npm start` y ejecuta `node tests/browser.mjs`. Requiere Playwright instalado o `PLAYWRIGHT_MODULE` con su URL de módulo. `GAME_URL` permite cambiar el servidor local. `--skip-offline` y `--offline-only` separan las comprobaciones cuando se están editando recursos. Ejecuta `npm run prepare:assets` antes de probar offline.\n\n');
  const title = `## Ejecución ${new Date().toISOString()}\n\nServidor: ${base}. Navegador: Microsoft Edge/Chromium ${version}, headless, sin forzar SwiftShader. Adaptador WebGL comunicado: ${[...graphics].join('; ')}.\n\n`;
  const lines = results.map((result) => `### ${result.passed ? 'Pasó' : 'Falló'}: ${result.name}\n\nDuración: ${result.seconds} s.\n\n\`\`\`json\n${JSON.stringify(result.evidence || { error: result.error }, null, 2)}\n\`\`\`\n`).join('\n');
  await appendFile(reportPath, title + lines + '\n**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.\n\n');
}
