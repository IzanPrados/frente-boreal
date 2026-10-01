import { cp, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareAssets } from './prepare-assets.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const dist = resolve(root, 'dist');
const manifest = await prepareAssets();
const required = [
  '/index.html', '/client/main.mjs', '/client/renderer.mjs', '/client/controls.mjs',
  '/client/network.mjs', '/client/solo-worker.mjs', '/client/style.css',
  '/shared/data.mjs', '/shared/sim.mjs', '/vendor/three.module.js', '/vendor/three.core.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
];
for (const url of required) {
  if (!manifest.files.some((file) => file.url === url)) throw new Error(`Falta un recurso necesario: ${url}`);
}
// Delete only this project's literal dist directory; never follow a junction or symlink.
if (dirname(dist) !== root || basename(dist) !== 'dist') throw new Error('Directorio de salida inesperado.');
let existing;
try { existing = await lstat(dist); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing?.isSymbolicLink()) throw new Error('dist no puede ser un enlace. Revisa la carpeta antes de compilar.');
if (existing) {
  if (!existing.isDirectory() || await realpath(dist) !== dist) throw new Error('No se ha podido verificar la carpeta dist.');
  await rm(dist, { recursive: true, force: true });
}
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'index.html'), resolve(dist, 'index.html'));
for (const directory of ['client', 'shared']) await cp(resolve(root, directory), resolve(dist, directory), { recursive: true });
await cp(resolve(root, 'public'), dist, { recursive: true });
console.log(`Cliente estático generado en ${dist}. El multijugador requiere el servidor Node.`);
