import { MAP } from './data.mjs';

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

function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

export const DEFAULT_MAP_ID = compact.id;
export const MAPS = freezeTree([compact, medium, large]);
const byId = new Map(MAPS.map(map => [map.id, map]));

export function getMap(id = DEFAULT_MAP_ID) {
  return byId.get(id) || byId.get(DEFAULT_MAP_ID);
}

export function isMapId(id) {
  return typeof id === 'string' && byId.has(id);
}
