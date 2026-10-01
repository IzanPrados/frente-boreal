import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIcons } from './icons.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function walk(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(path));
    else if (entry.isFile()) results.push(path);
  }
  return results;
}

export async function prepareAssets() {
  const vendor = resolve(root, 'public', 'vendor');
  await mkdir(vendor, { recursive: true });
  let threeBuild;
  let wsDirectory;
  try {
    threeBuild = dirname(require.resolve('three'));
    wsDirectory = dirname(require.resolve('ws'));
  } catch {
    throw new Error('Faltan las dependencias. Ejecuta npm install antes de preparar los archivos.');
  }
  for (const file of ['three.module.js', 'three.core.js']) await copyFile(resolve(threeBuild, file), resolve(vendor, file));
  await copyFile(resolve(threeBuild, '..', 'LICENSE'), resolve(vendor, 'THREE-LICENSE.txt'));
  await copyFile(resolve(wsDirectory, 'LICENSE'), resolve(vendor, 'WS-LICENSE.txt'));
  await generateIcons(root);

  const files = [{ url: '/index.html', path: resolve(root, 'index.html') }];
  for (const directory of ['client', 'shared', 'public']) {
    for (const path of await walk(resolve(root, directory))) {
      const location = relative(directory === 'public' ? resolve(root, 'public') : root, path).split(sep).join('/');
      if (directory === 'public' && ['sw.js', 'precache.json'].includes(location)) continue;
      if (location.endsWith('.map') || location.startsWith('.')) continue;
      files.push({ url: `/${location}`, path });
    }
  }
  files.sort((a, b) => a.url.localeCompare(b.url, 'en'));
  const entries = [];
  for (const file of files) entries.push({ url: file.url, revision: hash(await readFile(file.path)) });
  const workerPath = resolve(root, 'public', 'sw.js');
  const worker = await readFile(workerPath, 'utf8');
  if (!/^const BUILD_REVISION = '[^']+';$/m.test(worker)) throw new Error('Falta el marcador de versión en public/sw.js.');
  const workerTemplate = worker.replace(/^const BUILD_REVISION = '[^']+';$/m, "const BUILD_REVISION = 'generated';");
  const revision = hash(JSON.stringify(entries) + workerTemplate).slice(0, 20);
  const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const manifest = { version, revision, files: entries };
  await writeFile(resolve(root, 'public', 'precache.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(workerPath, worker.replace(/^const BUILD_REVISION = '[^']+';$/m, `const BUILD_REVISION = '${revision}';`));
  console.log(`Archivos locales y PWA preparados: ${entries.length} recursos, versión ${revision}.`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareAssets();
