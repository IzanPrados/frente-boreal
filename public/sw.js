/* BUILD_REVISION is updated by prepare-assets.mjs when application files change. */
const APP_VERSION = 'v0.1';
const BUILD_REVISION = '22da24dbfd0bacdaf16b';
const CACHE_PREFIX = 'frente-boreal-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}-${BUILD_REVISION}`;

async function notify(type, details = {}) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type, version: APP_VERSION, ...details });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const response = await fetch(`/precache.json?revision=${BUILD_REVISION}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo leer la lista de archivos sin conexión.');
      const manifest = await response.json();
      if (manifest.revision !== BUILD_REVISION || !Array.isArray(manifest.files) || !manifest.files.length) {
        throw new Error('Los archivos de esta versión todavía no están preparados.');
      }
      const cache = await caches.open(CACHE_NAME);
      // All entries must succeed. An incomplete update must never replace the working version.
      for (const entry of manifest.files) {
        const url = new URL(entry.url, self.location.origin);
        if (url.origin !== self.location.origin || !url.pathname.startsWith('/') || url.pathname === '/sw.js') {
          throw new Error('La lista contiene un archivo no permitido.');
        }
        const resource = await fetch(url.href, { cache: 'reload' });
        if (!resource.ok || resource.type === 'opaque') {
          throw new Error(`No se pudo guardar ${url.pathname}. Vuelve a abrir el juego con conexión.`);
        }
        const digest = await crypto.subtle.digest('SHA-256', await resource.clone().arrayBuffer());
        const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        if (checksum !== entry.revision) throw new Error('Se ha publicado una versión nueva durante la descarga. Vuelve a abrir el juego.');
        await cache.put(url.pathname, resource);
      }
      await cache.put('/precache.json', new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }));
      await notify('PWA_CACHE_READY', { message: 'Juego individual preparado para abrirse sin conexión.' });
      // A first installation activates normally. Updates wait for the user's SKIP_WAITING message.
    } catch (error) {
      await caches.delete(CACHE_NAME);
      await notify('PWA_CACHE_ERROR', { message: error.message || 'No se pudo preparar el juego sin conexión.' });
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
    await notify('PWA_ACTIVATED', { message: 'Versión preparada.' });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/health' || url.pathname === '/ws' || request.headers.get('upgrade') === 'websocket') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Keep one complete app version together. Room codes remain in the address bar.
    const key = request.mode === 'navigate' ? '/index.html' : url.pathname;
    const saved = await cache.match(key);
    if (saved) return saved;
    try {
      return await fetch(request);
    } catch {
      const message = 'Sin conexión: falta un archivo. Abre el juego con Internet para completar la descarga. Las partidas compartidas necesitan conexión.';
      await notify('PWA_OFFLINE_RESOURCE', { url: url.pathname, message });
      if (request.mode === 'navigate') {
        return new Response(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frente Boreal · Sin conexión</title><style>body{background:#101b24;color:#eef3f5;font:18px system-ui;max-width:36rem;margin:12vh auto;padding:24px}button{font:inherit;padding:12px 20px}</style><h1>Frente Boreal</h1><p>${message}</p><button onclick="location.reload()">Reintentar</button></html>`, {
          status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      return new Response(message, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  })());
});
