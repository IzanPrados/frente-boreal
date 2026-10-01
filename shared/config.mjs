import { DEFAULT_MAP_ID, isMapId } from './maps.mjs';
import { RULES } from './data.mjs';

export const INCOME_MULTIPLIERS = Object.freeze([0.5, 1, 2, 3, 5]);
export const CONFIG_LIMITS = Object.freeze({
  startingResources: Object.freeze({ min: 0, max: 10000 }),
  maxUnits: Object.freeze({ min: 24, max: 120 }),
  duration: Object.freeze({ min: 180, max: 3600 }),
  tickets: Object.freeze({ min: 100, max: 2000 }),
});

export const DEFAULT_CONFIG = Object.freeze({
  mapId: DEFAULT_MAP_ID,
  startingResources: RULES.startCredits,
  incomeMultiplier: 1,
  maxUnits: RULES.maxUnits,
  duration: RULES.defaultDuration,
  tickets: RULES.tickets,
  allowEnemyReveal: false,
});

const labels = {
  mapId: 'Mapa', startingResources: 'Recursos iniciales',
  incomeMultiplier: 'Multiplicador de ingresos', maxUnits: 'Límite total de unidades',
  duration: 'Duración en segundos', tickets: 'Puntos iniciales de cada bando',
  allowEnemyReveal: 'Permitir mostrar tropas enemigas',
};
const isObject = input => input !== null && typeof input === 'object' && !Array.isArray(input);

function validValue(key, value) {
  if (key === 'allowEnemyReveal') return typeof value === 'boolean';
  if (key === 'mapId') return isMapId(value);
  if (key === 'incomeMultiplier') return INCOME_MULTIPLIERS.includes(value);
  const limit = CONFIG_LIMITS[key];
  return !!limit && Number.isSafeInteger(value) && value >= limit.min && value <= limit.max;
}

// Local saved preferences may come from older versions. Keep each valid value
// and restore only unsupported fields. This is intentionally separate from the
// strict validator used for network messages and simulation creation.
export function normalizeConfig(input) {
  if (!isObject(input)) return DEFAULT_CONFIG;
  return Object.freeze(Object.fromEntries(Object.entries(DEFAULT_CONFIG).map(([key, fallback]) => [
    key, Object.hasOwn(input, key) && validValue(key, input[key]) ? input[key] : fallback,
  ])));
}

export function validateConfig(input) {
  if (input === undefined) return { ok: true, config: DEFAULT_CONFIG };
  if (!isObject(input)) return { ok: false, error: 'La configuración debe ser un objeto.' };
  const unknown = Object.keys(input).find(key => !Object.hasOwn(DEFAULT_CONFIG, key));
  if (unknown !== undefined) return { ok: false, error: `Ajuste desconocido: ${unknown.slice(0, 40)}.` };
  for (const [key, value] of Object.entries(input)) {
    if (validValue(key, value)) continue;
    const limit = CONFIG_LIMITS[key];
    const expected = key === 'mapId' ? 'Selecciona un mapa disponible.'
      : key === 'incomeMultiplier' ? 'Usa 0,5×, 1×, 2×, 3× o 5×.'
      : key === 'allowEnemyReveal' ? 'Usa verdadero o falso.'
      : `Usa un número entero entre ${limit.min} y ${limit.max}.`;
    return { ok: false, error: `${labels[key]}: ${expected}` };
  }
  return { ok: true, config: normalizeConfig(input) };
}
