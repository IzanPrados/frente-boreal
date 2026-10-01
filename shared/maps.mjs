import { MAP } from './data.mjs';
import { VEGETATION_PRESETS } from './terrain.mjs';

const rect = (id, type, x, y, w, h) => ({ id, type, x, y, w, h });
const sector = (id, name, x, y, radius = 110) => ({ id, name, x, y, radius });

// Each authored western feature has a counterpart rotated 180 degrees. Both
// armies have the same routes and cover, while northern and southern approaches
// can differ. Roads override water, so every marked bridge is traversable.
function paired(width, height, features) {
  return features.flatMap(feature => [
    feature,
    { ...feature, id: `${feature.id}-opposite`, x: width - feature.x - feature.w, y: height - feature.y - feature.h },
  ]);
}

const compact = {
  ...MAP,
  id: 'valle-bruma',
  size: 'small',
  sizeLabel: 'Pequeño',
  description: 'Tres objetivos y tres pasos sobre el río. Despliegue rápido y frentes próximos.',
  spawns: MAP.spawns.map(spawn => ({ ...spawn })),
  sectors: MAP.sectors.map(point => ({ ...point })),
  terrain: MAP.terrain.map(feature => ({ ...feature })),
};

const medium = {
  id: 'cuenca-del-norte', name: 'Cuenca del Norte', size: 'medium', sizeLabel: 'Mediano',
  width: 2400, height: 1600,
  description: 'Cinco sectores: tres cruces del río y dos poblaciones avanzadas. Carreteras laterales enlazan bosques y campos abiertos para cambiar de frente.',
  spawns: [{ x: 200, y: 800 }, { x: 2200, y: 800 }],
  sectors: [
    sector('north-crossing', 'Paso del Pinar', 1200, 320),
    sector('west-village', 'San Telmo', 900, 620, 105),
    sector('central-crossing', 'Puente de la Cuenca', 1200, 800, 120),
    sector('east-village', 'Valdeagua', 1500, 980, 105),
    sector('south-crossing', 'Paso del Molino', 1200, 1280),
  ],
  terrain: [
    rect('river', 'water', 1140, 0, 120, 1600),
    rect('central-highway', 'road', 0, 760, 2400, 80),
    rect('north-crossing-road', 'road', 600, 280, 1200, 80),
    rect('south-crossing-road', 'road', 600, 1240, 1200, 80),
    ...paired(2400, 1600, [
      rect('west-ring-road', 'road', 600, 280, 80, 1040),
      rect('west-forward-road', 'road', 880, 280, 80, 1040),
      rect('west-village-approach', 'road', 640, 600, 520, 40),
      rect('west-base-town', 'town', 320, 860, 160, 160),
      rect('west-village', 'town', 800, 500, 280, 200),
      rect('west-crossing-hamlet', 'town', 960, 840, 160, 120),
      rect('west-north-pine', 'forest', 280, 80, 360, 160),
      rect('west-north-screen', 'forest', 720, 80, 280, 160),
      rect('west-north-bridge-cover', 'forest', 1000, 360, 120, 120),
      rect('west-middle-woods', 'forest', 400, 400, 160, 240),
      rect('west-lower-copse', 'forest', 720, 920, 120, 240),
      rect('west-south-bank', 'forest', 960, 1040, 160, 160),
      rect('west-south-rear', 'forest', 320, 1320, 400, 160),
      rect('west-south-bridge-cover', 'forest', 840, 1360, 280, 160),
    ]),
  ],
};

const large = {
  id: 'frontera-de-los-siete-pasos', name: 'Frontera de los Siete Pasos', size: 'large', sizeLabel: 'Grande',
  width: 3200, height: 2000,
  description: 'Siete objetivos entre ciudades, pinares y cinco cruces del río. Dos canales laterales, anillos de carretera y pasos exteriores permiten envolver o reforzar otros sectores.',
  spawns: [{ x: 220, y: 1000 }, { x: 2980, y: 1000 }],
  sectors: [
    sector('north-pass', 'Puente del Norte', 1600, 240, 115),
    sector('west-town', 'Villa del Roble', 1120, 640, 125),
    sector('east-pines', 'Pinar del Este', 2080, 600, 115),
    sector('central-pass', 'Estación Central', 1600, 1000, 130),
    sector('west-pines', 'Pinar del Oeste', 1120, 1400, 115),
    sector('east-town', 'Villa del Olmo', 2080, 1360, 125),
    sector('south-pass', 'Puente del Sur', 1600, 1760, 115),
  ],
  terrain: [
    rect('main-river', 'water', 1520, 0, 160, 2000),
    // The unscored 600/1400 crossings are flank routes between scored sectors.
    rect('north-outer-crossing', 'road', 880, 200, 1440, 80),
    rect('north-inner-crossing', 'road', 1040, 560, 1120, 80),
    rect('central-highway', 'road', 0, 960, 3200, 80),
    rect('south-inner-crossing', 'road', 1040, 1360, 1120, 80),
    rect('south-outer-crossing', 'road', 880, 1720, 1440, 80),
    ...paired(3200, 2000, [
      rect('west-canal', 'water', 760, 360, 80, 440),
      rect('west-canal-crossing', 'road', 440, 520, 680, 80),
      rect('west-rear-ring', 'road', 440, 200, 80, 1600),
      rect('west-middle-ring', 'road', 880, 200, 80, 1600),
      rect('west-forward-ring', 'road', 1280, 200, 80, 1600),
      rect('west-north-connector', 'road', 480, 200, 440, 80),
      rect('west-south-connector', 'road', 480, 1720, 440, 80),
      rect('west-south-village-road', 'road', 480, 1360, 880, 80),
      // Town footprints slow movement, reduce incoming damage and obstruct
      // ground sight through the same terrain rules used by the compact map.
      rect('west-forward-town', 'town', 1000, 480, 240, 320),
      rect('west-north-bank-hamlet', 'town', 1360, 320, 120, 160),
      rect('west-central-station', 'town', 1320, 840, 160, 120),
      rect('west-rear-town', 'town', 560, 1080, 200, 200),
      rect('west-south-hamlet', 'town', 680, 1480, 160, 120),
      rect('west-base-settlement', 'town', 160, 1280, 200, 160),
      // Gaps between the stands remain open fields. Cover is strongest near
      // the bridge approaches but never seals the river crossings.
      rect('west-far-north-forest', 'forest', 200, 40, 400, 120),
      rect('west-north-rear-forest', 'forest', 600, 280, 120, 200),
      rect('west-north-bank-forest', 'forest', 1080, 40, 360, 120),
      rect('west-north-bridge-screen', 'forest', 1360, 240, 120, 80),
      rect('west-canal-screen', 'forest', 560, 640, 160, 240),
      rect('west-canal-forward-screen', 'forest', 840, 640, 120, 160),
      rect('west-middle-bank-forest', 'forest', 1360, 640, 120, 160),
      rect('west-middle-rear-forest', 'forest', 160, 640, 200, 200),
      rect('west-middle-copse', 'forest', 1000, 1120, 200, 160),
      rect('west-objective-pine-north', 'forest', 1000, 1280, 240, 80),
      rect('west-objective-pine-south', 'forest', 1000, 1440, 240, 160),
      rect('west-south-bank-screen', 'forest', 1360, 1440, 120, 240),
      rect('west-south-rear-forest', 'forest', 200, 1600, 200, 320),
      rect('west-south-bank-forest', 'forest', 960, 1840, 480, 120),
    ]),
  ],
};

const estuary = {
  id: 'llanura-del-estuario', name: 'Llanura del Estuario', size: 'very-large', sizeLabel: 'Muy grande',
  width: 4800, height: 3000,
  description: 'Nueve sectores entre dos villas, granjas, arboledas y cinco pasos fluviales. Calles y edificios ocupables protegen los accesos; las rutas exteriores y la llanura central permiten maniobrar entre frentes.',
  spawns: [{ x: 300, y: 1500 }, { x: 4500, y: 1500 }],
  sectors: [
    sector('northern-lock', 'Esclusa Norte', 2400, 360, 130),
    sector('western-village', 'Villa del Fresno', 1680, 920, 145),
    sector('eastern-grove', 'Arboleda del Este', 2840, 760, 130),
    sector('eastern-farm', 'Granja del Este', 3480, 1120, 130),
    sector('central-customs', 'Aduana Central', 2400, 1500, 155),
    sector('western-farm', 'Granja del Oeste', 1320, 1880, 130),
    sector('western-grove', 'Arboleda del Oeste', 1960, 2240, 130),
    sector('eastern-village', 'Villa del Sauce', 3120, 2080, 145),
    sector('southern-lock', 'Esclusa Sur', 2400, 2640, 130),
  ],
  terrain: [
    rect('estuary-river', 'water', 2320, 0, 160, 3000),
    rect('northern-bridge', 'road', 1320, 320, 2160, 80),
    rect('northern-flank-bridge', 'road', 1600, 920, 1600, 80),
    rect('central-highway', 'road', 0, 1460, 4800, 80),
    rect('southern-flank-bridge', 'road', 1600, 2000, 1600, 80),
    rect('southern-bridge', 'road', 1320, 2600, 2160, 80),
    ...paired(4800, 3000, [
      rect('western-water-meadow', 'water', 920, 520, 120, 560),
      rect('western-meadow-crossing', 'road', 560, 760, 800, 80),
      rect('western-rear-road', 'road', 560, 320, 80, 2360),
      rect('western-mid-road', 'road', 1280, 320, 80, 2360),
      rect('western-forward-road', 'road', 2080, 320, 80, 2360),
      rect('western-north-connector', 'road', 600, 320, 760, 80),
      rect('western-south-connector', 'road', 600, 2600, 760, 80),
      rect('western-city-route', 'road', 1320, 920, 840, 80),
      rect('western-farm-route', 'road', 600, 1840, 1560, 80),
      rect('western-grove-route', 'road', 1320, 2200, 840, 80),
      rect('western-village-district', 'town', 1440, 720, 560, 480),
      rect('western-farmstead', 'town', 1080, 1720, 440, 360),
      rect('western-north-bank-hamlet', 'town', 2160, 440, 120, 280),
      rect('western-customs-yard', 'town', 2160, 1280, 120, 160),
      rect('western-south-bank-hamlet', 'town', 2160, 2360, 120, 160),
      rect('western-rear-market', 'town', 720, 1200, 280, 200),
      rect('western-southern-farm', 'town', 720, 2240, 280, 200),
      rect('western-north-pine', 'forest', 240, 80, 600, 160),
      rect('western-ridge-forest', 'forest', 1160, 80, 600, 160),
      rect('western-north-bank-wood', 'forest', 1880, 40, 400, 200),
      rect('western-lock-screen', 'forest', 2120, 400, 160, 40),
      rect('western-canal-screen', 'forest', 680, 880, 200, 240),
      rect('western-canal-forward-screen', 'forest', 1080, 520, 160, 400),
      rect('western-open-grove', 'forest', 1040, 1160, 160, 160),
      rect('western-mid-bank-wood', 'forest', 2160, 1000, 120, 200),
      rect('western-rear-grove', 'forest', 240, 1800, 200, 240),
      rect('western-farm-windbreak', 'forest', 720, 1600, 480, 80),
      rect('western-objective-grove', 'forest', 1800, 2120, 240, 400),
      rect('western-south-rear-wood', 'forest', 320, 2440, 160, 440),
      rect('western-south-bank-pine', 'forest', 1520, 2760, 760, 160),
    ]),
  ],
};

const overlaps = (a, b, padding = 0) => a.x < b.x + b.w + padding && a.x + a.w > b.x - padding
  && a.y < b.y + b.h + padding && a.y + a.h > b.y - padding;
const nearestOn = (point, rectangle) => ({
  x: Math.max(rectangle.x, Math.min(rectangle.x + rectangle.w, point.x)),
  y: Math.max(rectangle.y, Math.min(rectangle.y + rectangle.h, point.y)),
});
function mirrorBuilding(building, map) {
  const rotate = point => ({ x: map.width - point.x, y: map.height - point.y });
  return { ...building, id: `${building.id}-opposite`, x: map.width - building.x - building.w, y: map.height - building.y - building.h,
    doors: building.doors.map(rotate), firePoints: building.firePoints.map(rotate) };
}

function addSettlement(map, town, roads) {
  const streets = [];
  for (let offset = 88; offset < town.w - 12; offset += 96) streets.push(rect(`${town.id}-street-x${offset}`, 'road', town.x + offset - 16, town.y, 32, town.h));
  for (let offset = 88; offset < town.h - 12; offset += 96) streets.push(rect(`${town.id}-street-y${offset}`, 'road', town.x, town.y + offset - 16, town.w, 32));
  const center = { x: town.x + town.w / 2, y: town.y + town.h / 2 };
  const closest = roads.map(road => nearestOn(center, road)).sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))[0];
  if (closest) {
    if (Math.abs(closest.x - center.x) > 1) streets.push(rect(`${town.id}-access-x`, 'road', Math.min(center.x, closest.x), center.y - 16, Math.abs(center.x - closest.x) + 1, 32));
    if (Math.abs(closest.y - center.y) > 1) streets.push(rect(`${town.id}-access-y`, 'road', closest.x - 16, Math.min(center.y, closest.y), 32, Math.abs(center.y - closest.y) + 1));
  }
  return streets;
}

function enhanceMap(original, smallGroves) {
  const map = { ...original, terrain: original.terrain.map(feature => feature.type === 'forest'
    ? { ...feature, ...VEGETATION_PRESETS[/(grove|copse|rear-forest)/.test(feature.id) ? 'grove' : 'dense'] }
    : { ...feature }) };
  for (const grove of smallGroves) map.terrain.push(...paired(map.width, map.height, [{ ...grove, ...VEGETATION_PRESETS[grove.w <= 40 ? 'isolated' : 'grove'] }]));
  const roads = map.terrain.filter(t => t.type === 'road');
  const towns = map.terrain.filter(t => t.type === 'town');
  for (const town of towns) {
    if (town.id.endsWith('-opposite')) continue;
    const streets = addSettlement(map, town, roads);
    const counterpart = towns.some(other => other.id === `${town.id}-opposite`);
    map.terrain.push(...(counterpart ? paired(map.width, map.height, streets) : streets));
  }
  map.buildings = [];
  for (const town of towns) {
    if (town.id.endsWith('-opposite')) continue;
    let serial = 0;
    const firstRow = map.id === 'valle-bruma' && town.id === 'town-east' ? 20 : 40;
    for (let dy = firstRow; dy < town.h - 18; dy += 96) for (let dx = 40; dx < town.w - 18; dx += 96) {
      const x = town.x + dx - 20, y = town.y + dy - 20;
      const footprint = { x, y, w: 40, h: 40 };
      if (map.terrain.some(feature => ['road', 'water'].includes(feature.type) && overlaps(footprint, feature, 4))) continue;
      if (map.sectors.some(point => Math.hypot(point.x - x - 20, point.y - y - 20) < 55)) continue;
      if (map.spawns.some(point => Math.hypot(point.x - x - 20, point.y - y - 20) < 220)) continue;
      serial++;
      const capacity = serial % 5 === 0 ? 0 : serial % 3 === 0 ? 2 : 1;
      const building = { id: `${town.id}-building-${serial}`, name: `${capacity ? 'Casa' : 'Almacén'} ${serial}`, ...footprint,
        height: capacity === 2 ? 32 : capacity === 0 ? 18 : 24, kind: capacity === 0 ? 'warehouse' : 'house',
        occupiable: capacity > 0, capacity, protection: capacity === 2 ? 0.42 : 0.45,
        doors: [{ x: x + 20, y: y - 12 }, { x: x + 52, y: y + 20 }, { x: x + 20, y: y + 52 }, { x: x - 12, y: y + 20 }],
        firePoints: [{ x: x + 20, y: y - 4 }, { x: x + 44, y: y + 20 }, { x: x + 20, y: y + 44 }, { x: x - 4, y: y + 20 }],
      };
      map.buildings.push(building);
      if (towns.some(other => other.id === `${town.id}-opposite`)) map.buildings.push(mirrorBuilding(building, map));
    }
  }
  return map;
}

function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

export const DEFAULT_MAP_ID = compact.id;
export const MAPS = freezeTree([
  enhanceMap({ ...compact, terrain: [...compact.terrain,
    rect('town-west-north', 'town', 320, 255, 140, 100),
    rect('town-east-south', 'town', 1150, 700, 180, 100),
  ] }, [rect('orchard-west', 'forest', 400, 680, 96, 48), rect('lone-oak-west', 'forest', 160, 700, 32, 32)]),
  enhanceMap(medium, [rect('orchard-west', 'forest', 720, 400, 80, 60), rect('lone-oak-west', 'forest', 1040, 160, 32, 32)]),
  enhanceMap(large, [rect('orchard-west', 'forest', 600, 900, 96, 40), rect('lone-oak-west', 'forest', 960, 840, 32, 32)]),
  enhanceMap(estuary, [rect('orchard-west', 'forest', 1600, 1600, 240, 120), rect('lone-oak-west', 'forest', 1160, 1360, 32, 32), rect('lone-oak-forward-west', 'forest', 1880, 1200, 32, 32)]),
]);
const byId = new Map(MAPS.map(map => [map.id, map]));

export function getMap(id = DEFAULT_MAP_ID) {
  return byId.get(id) || byId.get(DEFAULT_MAP_ID);
}

export function isMapId(id) {
  return typeof id === 'string' && byId.has(id);
}
