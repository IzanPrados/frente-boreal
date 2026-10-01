// Original game balance. Distances are map units and time is measured in seconds.
export const UNIT_TYPES = {
  infantry: { name: 'Infantería de línea', short: 'INF', cost: 90, hp: 110, speed: 35, range: 185, vision: 250, damage: 17, armor: 2, ammo: 28, domain: 'ground', reload: 1.65, capture: 1.4, smoke: 1, targets: ['ground'], description: 'Captura rápido. Resiste en bosque y población; vulnerable a campo abierto.' },
  tank: { name: 'Carro Bastión', short: 'CAR', cost: 190, hp: 220, speed: 46, range: 255, vision: 185, damage: 44, armor: 24, ammo: 20, domain: 'ground', reload: 3.8, capture: 0.6, smoke: 1, targets: ['ground'], description: 'Blindaje y alcance. Necesita reconocimiento y cobertura antiaérea.' },
  transport: { name: 'Transporte Lince', short: 'TRP', cost: 65, hp: 125, speed: 77, range: 120, vision: 175, damage: 9, armor: 8, ammo: 35, domain: 'ground', reload: 1.2, capture: 0.35, capacity: 2, smoke: 1, targets: ['ground'], description: 'Lleva dos escuadras de infantería. Selecciona la tropa y usa Embarcar.' },
  recon: { name: 'Explorador Nexo', short: 'REC', cost: 100, hp: 90, speed: 69, range: 165, vision: 350, damage: 13, armor: 4, ammo: 30, domain: 'ground', reload: 1.8, capture: 0.6, smoke: 2, targets: ['ground'], description: 'Mayor visión y detección en cobertura. Evita combates frontales.' },
  supply: { name: 'Logística Atlas', short: 'LOG', cost: 100, hp: 100, speed: 53, range: 0, vision: 150, damage: 0, armor: 1, ammo: 0, domain: 'ground', reload: 99, capture: 0, stock: 650, smoke: 0, targets: [], description: 'Repara y repone munición de aliados cercanos. Recarga reservas en la base.' },
  artillery: { name: 'Obús Bruma', short: 'ART', cost: 170, hp: 90, speed: 37, range: 510, vision: 150, damage: 46, armor: 3, ammo: 12, domain: 'ground', reload: 7.2, capture: 0.2, blast: 65, minRange: 100, smoke: 2, targets: ['ground'], description: 'Fuego indirecto de área con dispersión. Necesita observadores y munición.' },
  aa: { name: 'Defensa Cénit', short: 'AA', cost: 130, hp: 110, speed: 51, range: 310, vision: 255, damage: 36, armor: 5, ammo: 16, domain: 'ground', reload: 2.3, capture: 0.2, smoke: 0, targets: ['air'], description: 'Especialista contra helicópteros y aviones. No dispara a tierra.' },
  helicopter: { name: 'Helicóptero Vértice', short: 'HEL', cost: 220, hp: 135, speed: 95, range: 220, vision: 260, damage: 31, armor: 6, ammo: 18, domain: 'air', reload: 2.4, capture: 0, smoke: 0, targets: ['ground', 'air'], description: 'Ataque móvil por encima de obstáculos. Vulnerable a defensa antiaérea.' },
  jet: { name: 'Avión Estrato', short: 'AVI', cost: 260, hp: 115, speed: 150, range: 250, vision: 285, damage: 46, armor: 5, ammo: 10, domain: 'air', reload: 3.2, capture: 0, smoke: 0, targets: ['ground', 'air'], description: 'Respuesta rápida de apoyo. Se reabastece cerca de la base; no captura sectores.' },
};

export const MAP = {
  name: 'Valle de la Bruma', width: 1600, height: 1000,
  spawns: [{ x: 160, y: 500 }, { x: 1440, y: 500 }],
  sectors: [
    { id: 'north', name: 'Loma Norte', x: 795, y: 215, radius: 100 },
    { id: 'center', name: 'Cruce del Valle', x: 810, y: 500, radius: 105 },
    { id: 'south', name: 'Vado Sur', x: 805, y: 795, radius: 100 },
  ],
  terrain: [
    { id: 'river-north', type: 'water', x: 748, y: 0, w: 105, h: 355 },
    { id: 'river-south', type: 'water', x: 748, y: 645, w: 105, h: 355 },
    { id: 'road-center', type: 'road', x: 0, y: 475, w: 1600, h: 50 },
    { id: 'bridge-north', type: 'road', x: 460, y: 185, w: 690, h: 60 },
    { id: 'bridge-south', type: 'road', x: 440, y: 765, w: 720, h: 60 },
    { id: 'road-left', type: 'road', x: 475, y: 190, w: 45, h: 620 },
    { id: 'road-right', type: 'road', x: 1095, y: 190, w: 45, h: 620 },
    { id: 'wood-nw', type: 'forest', x: 255, y: 65, w: 300, h: 120 },
    { id: 'wood-north-west', type: 'forest', x: 580, y: 265, w: 120, h: 150 },
    { id: 'wood-north-east', type: 'forest', x: 920, y: 270, w: 160, h: 145 },
    { id: 'wood-ne', type: 'forest', x: 1180, y: 65, w: 225, h: 160 },
    { id: 'wood-sw', type: 'forest', x: 280, y: 820, w: 245, h: 140 },
    { id: 'wood-south-west', type: 'forest', x: 570, y: 570, w: 145, h: 155 },
    { id: 'wood-south-east', type: 'forest', x: 910, y: 590, w: 155, h: 145 },
    { id: 'wood-se', type: 'forest', x: 1150, y: 835, w: 255, h: 105 },
    { id: 'town-west', type: 'town', x: 360, y: 355, w: 135, h: 115 },
    { id: 'town-center', type: 'town', x: 730, y: 390, w: 160, h: 80 },
    { id: 'town-east', type: 'town', x: 1150, y: 550, w: 140, h: 120 },
  ],
};

export const RULES = {
  maxUnits: 120, simulationHz: 10, incomePerSecond: 6, startCredits: 410,
  deploymentRadius: 185, captureSeconds: 12, supplyRadius: 110,
  tickets: 300, defaultDuration: 720,
};

export const DEFAULT_DECK = Object.keys(UNIT_TYPES);
