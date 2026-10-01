import { vegetationAt } from "../shared/terrain.mjs";

// Display-only approximation of ground visibility. Enemy disclosure remains
// exclusively in the authoritative simulation, including concealment and smoke.
export function createFogGrid(map) {
  const cell = 8,
    cols = Math.ceil(map.width / cell),
    rows = Math.ceil(map.height / cell);
  const heights = new Float32Array(cols * rows),
    density = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      density[y * cols + x] =
        vegetationAt(map, (x + 0.5) * cell, (y + 0.5) * cell)?.visionDensity ??
        0;
  for (const b of map.buildings ?? []) {
    for (
      let y = Math.max(0, Math.floor(b.y / cell));
      y < Math.min(rows, Math.ceil((b.y + b.h) / cell));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(b.x / cell));
        x < Math.min(cols, Math.ceil((b.x + b.w) / cell));
        x++
      )
        heights[y * cols + x] = Math.max(heights[y * cols + x], b.height ?? 18);
  }
  return { cell, cols, rows, heights, density };
}

export function visibilityOutline(
  grid,
  origin,
  radius,
  recon = false,
  smokes = [],
) {
  const points = [],
    budget = recon ? 130 : 80,
    step = grid.cell / 2;
  for (let ray = 0; ray < 96; ray++) {
    const angle = (ray * Math.PI * 2) / 96,
      dx = Math.cos(angle),
      dy = Math.sin(angle);
    let last = { x: origin.x, y: origin.y },
      obstruction = 0;
    for (let distance = step; distance <= radius; distance += step) {
      const x = origin.x + dx * distance,
        y = origin.y + dy * distance;
      const cx = Math.floor(x / grid.cell),
        cy = Math.floor(y / grid.cell);
      if (cx < 0 || cx >= grid.cols || cy < 0 || cy >= grid.rows) break;
      const index = cy * grid.cols + cx,
        height = origin.z + ((2 - origin.z) * distance) / radius;
      if (grid.heights[index] > height) break;
      if (height < 20) obstruction += grid.density[index] * step;
      if (
        height < 25 &&
        smokes.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 < s.radius ** 2)
      )
        obstruction += step;
      if (obstruction > budget || distance + obstruction * 0.7 > radius) break;
      last = { x, y };
    }
    points.push(last);
  }
  return points;
}
