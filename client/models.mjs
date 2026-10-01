// Original low-poly models. Visual geometry never changes simulation footprints,
// weapon ranges, doors or visibility volumes.
export function gableGeometry(T, width, height, depth) {
  const geometry = new T.BufferGeometry();
  const points = [
    -width / 2,
    0,
    -depth / 2,
    width / 2,
    0,
    -depth / 2,
    0,
    height,
    -depth / 2,
    -width / 2,
    0,
    depth / 2,
    width / 2,
    0,
    depth / 2,
    0,
    height,
    depth / 2,
  ];
  geometry.setAttribute("position", new T.Float32BufferAttribute(points, 3));
  geometry.setIndex([
    0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1, 0, 1, 4, 0, 4, 3,
  ]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  flat.setAttribute(
    "uv",
    new T.Float32BufferAttribute(
      new Float32Array(flat.attributes.position.count * 2),
      2,
    ),
  );
  return flat;
}

export function makeBuildingModel(T, building, material) {
  const group = new T.Group(),
    b = building,
    height = b.height ?? 24;
  const hash = [...b.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0),
    variant = hash % 4;
  const facade = [0xd9c4a1, 0xbec8b4, 0xc5b6a5, 0xc3c8c4][variant];
  const roofColor = [0x9d684e, 0x64777e, 0x875e53, 0x6e775f][variant];
  const warehouse = !b.occupiable,
    flat = !warehouse && b.capacity > 1 && variant % 2 === 0;
  const roofHeight = flat ? 3 : warehouse ? 4 : Math.min(10, height * 0.36),
    wallHeight = height - roofHeight;
  const mesh = (geometry, color, x, y, z) => {
    const m = new T.Mesh(geometry, material(color));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const box = (w, h, d, color, x, y, z) =>
    mesh(new T.BoxGeometry(w, h, d), color, x, y + h / 2, z);
  box(b.w, wallHeight, b.h, warehouse ? 0xaaa99c : facade, 0, 0, 0);
  // Foundation, string course and pale corners give façades readable depth.
  box(b.w, 0.9, b.h, 0x827e6c, 0, 0.15, 0);
  if (wallHeight > 20)
    box(b.w + 0.15, 0.65, b.h + 0.15, 0xeee0c1, 0, wallHeight * 0.52, 0);
  for (const x of [-b.w / 2 + 0.6, b.w / 2 - 0.6])
    for (const z of [-b.h / 2 + 0.6, b.h / 2 - 0.6])
      box(1.15, wallHeight, 1.15, 0xe1d4b9, x, 0, z);
  if (flat) {
    box(b.w, 1, b.h, roofColor, 0, wallHeight, 0);
    for (const z of [-b.h / 2 + 0.6, b.h / 2 - 0.6])
      box(b.w, roofHeight, 1.2, facade, 0, wallHeight, z);
    for (const x of [-b.w / 2 + 0.6, b.w / 2 - 0.6])
      box(1.2, roofHeight, b.h, facade, x, wallHeight, 0);
    box(9, 2, 7, 0x697876, -8, wallHeight + 1, 5);
  } else {
    const roof = mesh(
      gableGeometry(T, b.w, roofHeight, b.h),
      roofColor,
      0,
      wallHeight,
      0,
    );
    if (variant % 2) roof.rotation.y = Math.PI / 2;
    const ridge = box(1, 0.55, b.h, 0xd5b595, 0, height - 0.55, 0);
    if (variant % 2) ridge.rotation.y = Math.PI / 2;
    // Simple raised seams on warehouses, inset gable vent on houses.
    if (warehouse)
      for (const z of [-10, 0, 10])
        box(b.w, 0.18, 0.5, 0xc8c7b7, 0, wallHeight + 0.2, z);
    else if (!(variant % 2))
      box(3, 3, 0.18, 0x3c505b, 0, wallHeight + 1, -b.h / 2 - 0.12);
  }
  const floors = wallHeight > 21 ? [5, 15] : [5];
  for (const y of floors)
    for (const offset of [-12, 0, 12]) {
      // One central low window is replaced by the actual doorway on each façade.
      if (y === 5 && offset === 0) continue;
      for (const z of [-b.h / 2 - 0.12, b.h / 2 + 0.12]) {
        box(4.7, 5, 0.3, 0xe7ddc5, offset, y - 2, z);
        box(3.5, 3.9, 0.4, 0x334f61, offset, y - 1.5, z);
        box(5, 0.55, 0.8, 0xb49b7d, offset, y - 2.3, z);
      }
      for (const x of [-b.w / 2 - 0.12, b.w / 2 + 0.12]) {
        box(0.3, 5, 4.7, 0xe7ddc5, x, y - 2, offset);
        box(0.4, 3.9, 3.5, 0x334f61, x, y - 1.5, offset);
        box(0.8, 0.55, 5, 0xb49b7d, x, y - 2.3, offset);
      }
    }
  for (const door of b.doors ?? []) {
    const x = door.x - b.x - b.w / 2,
      z = door.y - b.y - b.h / 2;
    if (Math.abs(x) > Math.abs(z)) {
      const side = Math.sign(x) * (b.w / 2 + 0.15);
      box(0.35, 8, 5.5, 0x6c5946, side, 0, 0);
      box(0.5, 0.8, 6.5, 0xe7ddc5, side, 8, 0);
    } else {
      const side = Math.sign(z) * (b.h / 2 + 0.15);
      box(5.5, 8, 0.35, 0x6c5946, 0, 0, side);
      box(6.5, 0.8, 0.5, 0xe7ddc5, 0, 8, side);
    }
  }
  group.position.set(b.x + b.w / 2, 0, b.y + b.h / 2);
  group.userData = {
    buildingId: b.id,
    wallHeight,
    height,
    variant,
    roof: flat ? "flat" : "gable",
  };
  return group;
}

export function makeUnitModel(T, type, team, material) {
  const group = new T.Group(),
    body = team ? 0xa98768 : 0x789b85,
    dark = 0x253c39,
    edge = team ? 0xf2a083 : 0x87d6f2,
    glass = 0x294d61;
  const mesh = (geometry, color, x, y, z) => {
    const m = new T.Mesh(geometry, material(color));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const box = (w, h, d, color, x = 0, y = 0, z = 0) =>
    mesh(new T.BoxGeometry(w, h, d), color, x, y + h / 2, z);
  const cylinder = (r1, r2, h, color, x, y, z, n = 8) =>
    mesh(new T.CylinderGeometry(r1, r2, h, n), color, x, y, z);
  const wheel = (x, z) => {
    const m = cylinder(3, 3, 2.5, dark, x, 3, z);
    m.rotation.z = Math.PI / 2;
    return m;
  };
  if (type === "infantry") {
    for (const [i, [x, z]] of [
      [0, -7],
      [-7, 4],
      [7, 4],
    ].entries()) {
      for (const dx of [-1.3, 1.3]) box(1.5, 4, 2, dark, x + dx, 0, z);
      box(4.5, 4.5, 3, body, x, 4, z);
      box(3.2, 3.5, 1.8, dark, x, 4.4, z + 2);
      mesh(new T.SphereGeometry(1.7, 6, 4), 0xbca386, x, 9.7, z);
      const helmet = mesh(
        new T.SphereGeometry(2.1, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.65),
        body,
        x,
        10.2,
        z,
      );
      box(4.5, 0.65, 2, edge, x, 7.4, z);
      box(1, 1, 8, dark, x + 2, 6, z - 3);
      box(1.3, 3, 1.3, body, x - 2.5, 5, z - 1);
      if (i === 0) box(0.4, 6, 0.4, dark, x - 2, 6, z + 2.8);
    }
  } else if (type === "helicopter") {
    const cabin = mesh(new T.SphereGeometry(1, 8, 6), body, 0, 5, -1);
    cabin.scale.set(7, 5, 15);
    const cockpit = mesh(new T.SphereGeometry(1, 6, 4), glass, 0, 6, -10);
    cockpit.scale.set(5.7, 3.5, 6);
    box(3, 3, 26, body, 0, 4, 19);
    box(18, 1.5, 5, body, 0, 7, 28);
    box(1, 8, 7, edge, 0, 7, 28);
    const rotor = new T.Group();
    rotor.name = "rotor";
    rotor.position.y = 13;
    for (const angle of [0, Math.PI / 2]) {
      const blade = new T.Mesh(new T.BoxGeometry(54, 0.8, 2), material(dark));
      blade.rotation.y = angle;
      rotor.add(blade);
    }
    group.add(rotor);
    for (const x of [-8, 8]) {
      box(1.5, 1.5, 23, dark, x, -1, 0);
      box(1, 4, 1, dark, x, 0, -6);
      box(1, 4, 1, dark, x, 0, 6);
    }
    box(2, 0.5, 12, edge, 0, 10, 5);
  } else if (type === "jet") {
    box(7, 4, 38, body, 0, 2, 0);
    const nose = cylinder(0, 3.5, 14, body, 0, 4, -25, 6);
    nose.rotation.x = -Math.PI / 2;
    for (const side of [-1, 1]) {
      const wing = box(20, 1.1, 11, body, side * 10, 3, 5);
      wing.rotation.y = side * 0.45;
      box(8, 1, 6, edge, side * 7, 5, 19);
    }
    box(1.3, 10, 9, edge, 0, 5, 16);
    const canopy = mesh(new T.SphereGeometry(1, 6, 4), glass, 0, 6, -9);
    canopy.scale.set(2.7, 2.5, 7);
    for (const x of [-2, 2]) {
      const nozzle = cylinder(1.7, 1.7, 4, dark, x, 4, 21);
      nozzle.rotation.x = Math.PI / 2;
    }
  } else {
    const recon = type === "recon",
      tank = type === "tank",
      artillery = type === "artillery",
      w = recon ? 12 : tank ? 22 : 18,
      d = recon ? 23 : 34;
    box(w, 5, d, body, 0, 4, 0);
    if (tank || artillery)
      for (const x of [-w / 2, w / 2]) {
        box(4.8, 7, d + 3, dark, x, 0, 0);
        for (const z of [-11, -4, 4, 11]) wheel(x, z);
      }
    else
      for (const x of [-w / 2, w / 2])
        for (const z of recon ? [-8, 8] : [-11, 0, 11]) wheel(x, z);
    if (tank) {
      cylinder(7, 8.5, 5, body, 0, 12, 0);
      box(3, 3, 29, dark, 0, 12, -17);
      box(9, 0.6, 3, edge, 0, 15, 3);
      cylinder(2, 2, 1, dark, 3, 15, -1);
    } else if (artillery) {
      box(14, 9, 16, body, 0, 8, 5);
      const barrel = box(3, 3, 38, dark, 0, 15, -17);
      barrel.rotation.x = -0.22;
      box(10, 0.6, 3, edge, 0, 17, 7);
      for (const x of [-8, 8]) box(2, 2, 13, dark, x, 2, 21);
    } else if (type === "supply") {
      box(16, 7, 10, body, 0, 8, -12);
      box(13, 4, 0.5, glass, 0, 10, -17.2);
      box(16, 2, 23, dark, 0, 8, 5);
      for (const x of [-4, 4])
        for (const z of [-1, 8]) box(7, 9, 8, 0x9d9875, x, 10, z);
      box(10, 0.6, 2, edge, 0, 19, 4);
      box(2, 0.6, 10, edge, 0, 19, 4);
    } else if (type === "aa") {
      cylinder(7, 7, 3, body, 0, 10, 0);
      for (const x of [-4, 4]) {
        const gun = box(2, 2, 25, dark, x, 13, -9);
        gun.rotation.x = -0.3;
      }
      const radar = cylinder(5, 5, 1, edge, 0, 18, 9, 10);
      radar.rotation.x = Math.PI / 2;
      box(1.5, 7, 1.5, dark, 0, 10, 9);
    } else if (recon) {
      box(10, 6, 11, body, 0, 9, -1);
      box(9, 4, 0.4, glass, 0, 10, -6.7);
      box(9, 0.7, 2, edge, 0, 15, 1);
      box(0.5, 12, 0.5, dark, -4, 11, 6);
      box(2, 2, 4, dark, 0, 15, -3);
    } else {
      box(15, 7, 23, body, 0, 8, 1);
      box(12, 3, 0.4, glass, 0, 10, -11);
      for (const z of [-3, 5]) {
        cylinder(3, 3, 0.8, dark, 0, 15.4, z);
        box(12, 0.6, 1.8, edge, 0, 15, z);
      }
      box(2, 2, 11, dark, 3, 16, -10);
    }
  }
  group.userData.modelType = type;
  return group;
}
