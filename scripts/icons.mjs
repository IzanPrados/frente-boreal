import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const glyphs = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const tag = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, checksum]);
}

function iconPng(size) {
  const background = [16, 27, 36, 255];
  const accent = [78, 207, 209, 255];
  const light = [236, 244, 241, 255];
  const data = Buffer.alloc(size * size * 4);
  for (let index = 0; index < size * size; index++) data.set(background, index * 4);
  function rectangle(x, y, width, height, color) {
    for (let row = Math.max(0, y); row < Math.min(size, y + height); row++) {
      for (let column = Math.max(0, x); column < Math.min(size, x + width); column++) data.set(color, (row * size + column) * 4);
    }
  }
  // The complete monogram fits the central maskable safe circle.
  const cell = Math.floor(size / 23);
  const originX = Math.floor((size - cell * 12) / 2);
  const originY = Math.floor((size - cell * 7) / 2);
  for (const [letterIndex, letter] of ['F', 'B'].entries()) {
    for (const [row, line] of glyphs[letter].entries()) {
      for (const [column, value] of [...line].entries()) {
        if (value === '1') rectangle(originX + (letterIndex * 7 + column) * cell, originY + row * cell, cell, cell, letterIndex ? accent : light);
      }
    }
  }
  rectangle(originX, originY + cell * 8, cell * 12, Math.max(2, Math.floor(cell / 3)), accent);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row++) data.copy(rows, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

export async function generateIcons(root) {
  const directory = resolve(root, 'public', 'icons');
  await mkdir(directory, { recursive: true });
  for (const size of [192, 512]) {
    const png = iconPng(size);
    for (const prefix of ['icon-', 'icon-maskable-']) await writeFile(resolve(directory, `${prefix}${size}.png`), png);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateIcons(fileURLToPath(new URL('../', import.meta.url)));
  console.log('Iconos originales preparados (192 y 512 px).');
}
