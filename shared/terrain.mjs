const freeze = value => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
};

// Vegetation is a gameplay zone. Rendered trees illustrate these exact zones;
// a lone tree attenuates a small part of a ray rather than hiding an entire unit.
export const VEGETATION_PRESETS = freeze({
  isolated: { density: 0.15, visionDensity: 0.15, concealment: 0.94, reconConcealment: 0.98, movement: { infantry: 0.98, ground: 0.96 }, cover: { infantry: 0.94, ground: 0.98 } },
  grove: { density: 0.35, visionDensity: 0.35, concealment: 0.86, reconConcealment: 0.94, movement: { infantry: 0.92, ground: 0.82 }, cover: { infantry: 0.82, ground: 0.92 } },
  dense: { density: 0.85, visionDensity: 1, concealment: 0.61, reconConcealment: 0.86, movement: { infantry: 0.82, ground: 0.5 }, cover: { infantry: 0.5, ground: 0.78 } },
});

export function containsPoint(point, rectangle, padding = 0) {
  return point.x >= rectangle.x - padding && point.x <= rectangle.x + rectangle.w + padding
    && point.y >= rectangle.y - padding && point.y <= rectangle.y + rectangle.h + padding;
}

export function segmentRectangleInterval(a, b, rectangle, padding = 0) {
  let enter = 0, leave = 1;
  for (const [origin, delta, low, high] of [
    [a.x, b.x - a.x, rectangle.x - padding, rectangle.x + rectangle.w + padding],
    [a.y, b.y - a.y, rectangle.y - padding, rectangle.y + rectangle.h + padding],
  ]) {
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

const indexes = new WeakMap();
function indexFor(map) {
  if (indexes.has(map)) return indexes.get(map);
  const size = 160, cols = Math.ceil(map.width / size), rows = Math.ceil(map.height / size);
  const cells = Array.from({ length: cols * rows }, () => []);
  const priority = type => type === 'road' ? 0 : type === 'water' ? 1 : 2;
  for (const region of [...map.terrain].sort((a, b) => priority(a.type) - priority(b.type))) {
    for (let y = Math.max(0, Math.floor(region.y / size)); y <= Math.min(rows - 1, Math.floor((region.y + region.h) / size)); y++) {
      for (let x = Math.max(0, Math.floor(region.x / size)); x <= Math.min(cols - 1, Math.floor((region.x + region.w) / size)); x++) cells[y * cols + x].push(region);
    }
  }
  const index = { size, cols, rows, cells };
  indexes.set(map, index);
  return index;
}

export function vegetationAt(map, x, y) {
  const index = indexFor(map), point = { x, y };
  const cx = Math.max(0, Math.min(index.cols - 1, Math.floor(x / index.size)));
  const cy = Math.max(0, Math.min(index.rows - 1, Math.floor(y / index.size)));
  const region = index.cells[cy * index.cols + cx].find(candidate => containsPoint(point, candidate));
  if (region?.type !== 'forest') return null;
  return region.visionDensity === undefined ? VEGETATION_PRESETS.dense : region;
}
