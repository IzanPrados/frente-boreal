import * as THREE from "/vendor/three.module.js";
import { UNIT_TYPES } from "../shared/data.mjs";

import { getMap } from "../shared/maps.mjs";
import { createFogGrid, visibilityOutline } from "./fog.mjs";

const BLUE = 0x7dcce7,
  RED = 0xf29b86;
export class Battlefield {
  constructor(element, labels, quality = "medium") {
    this.map = getMap();
    this.element = element;
    this.labels = labels;
    this.labelCtx = labels.getContext("2d");
    this.units = new Map();
    this.selected = new Set();
    this.center = { x: this.map.width / 2, y: this.map.height / 2 };
    this.zoom = 1;
    this.state = null;
    this.frame = 0;
    this.lastFog = 0;
    this.effects = [];
    this.seenEvents = new Set();
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x223b3e);
    this.scene.fog = new THREE.FogExp2(0x506b65, 0.00012);
    this.smokeMeshes = new Map();
    this.renderer = new THREE.WebGLRenderer({
      antialias: quality !== "low",
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        quality === "low" ? 1 : quality === "medium" ? 1.5 : 2,
      ),
    );
    this.renderer.setClearColor(0x223b3e);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-800, 800, 500, -500, 1, 10000);
    this.ray = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.scene.add(new THREE.HemisphereLight(0xe6eee5, 0x324942, 2.5));
    const sun = new THREE.DirectionalLight(0xfff1d2, 3);
    sun.position.set(-300, 800, 250);
    this.scene.add(sun);
    this.materials = new Map();
    this.makeTerrain();
    this.batchTerrain();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(element);
    this.lastTime = performance.now();
    this.fpsFrames = 0;
    this.fpsTime = performance.now();
    this.fps = 0;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }
  setMap(map) {
    const shared = new Set(this.materials.values());
    for (const object of [...this.scene.children]) {
      if (object.isLight) continue;
      object.traverse((child) => {
        child.geometry?.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const material of materials)
          if (material && !shared.has(material)) material.dispose();
      });
      this.scene.remove(object);
    }
    this.fogTexture?.dispose();
    this.groundTexture?.dispose();
    this.units.clear();
    this.effects = [];
    this.smokeMeshes.clear();
    this.seenEvents.clear();
    this.map = map;
    this.state = null;
    this.lastFog = 0;
    this.makeTerrain();
    this.batchTerrain();
    this.focus(map.width / 2, map.height / 2);
  }
  overview() {
    const vertical = this.map.height * 0.813 + 160,
      horizontal = ((this.map.width + 160) * this.height) / this.width;
    this.zoom = Math.min(1, 980 / Math.max(vertical, horizontal));
    this.focus(this.map.width / 2, this.map.height / 2);
  }
  material(color) {
    if (!this.materials.has(color))
      this.materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.97 }),
      );
    return this.materials.get(color);
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, parent = this.scene) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      this.material(color),
    );
    m.position.set(x, y + h / 2, z);
    parent.add(m);
    return m;
  }
  plane(w, d, color, x, z, y = 0.3) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      this.material(color),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }
  makeTerrain() {
    this.box(
      this.map.width + 160,
      12,
      this.map.height + 160,
      0x354c45,
      this.map.width / 2,
      -15,
      this.map.height / 2,
    );
    this.plane(
      this.map.width,
      this.map.height,
      0x657459,
      this.map.width / 2,
      this.map.height / 2,
      0,
    );
    let seed = 41;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    // Field texture follows a regular agricultural layout. Trees and buildings
    // below come from the very same map definitions as the simulation.
    const groundCanvas = document.createElement("canvas");
    groundCanvas.width = 512;
    groundCanvas.height = 512;
    const groundCtx = groundCanvas.getContext("2d");
    groundCtx.fillStyle = "#738363";
    groundCtx.fillRect(0, 0, 512, 512);
    const fieldColors = [
      "#788867",
      "#7d8c68",
      "#6d805f",
      "#83916b",
      "#697e5d",
      "#88936d",
    ];
    for (let gy = 0; gy < 4; gy++)
      for (let gx = 0; gx < 4; gx++) {
        const color = fieldColors[(gx * 3 + gy * 5) % fieldColors.length];
        groundCtx.fillStyle = color;
        groundCtx.fillRect(gx * 128 + 2, gy * 128 + 2, 124, 124);
        groundCtx.strokeStyle = "#52664d22";
        groundCtx.lineWidth = 1;
        for (let row = 8; row < 124; row += 8) {
          groundCtx.beginPath();
          if ((gx + gy) % 2) {
            groundCtx.moveTo(gx * 128 + row, gy * 128 + 4);
            groundCtx.lineTo(gx * 128 + row, gy * 128 + 124);
          } else {
            groundCtx.moveTo(gx * 128 + 4, gy * 128 + row);
            groundCtx.lineTo(gx * 128 + 124, gy * 128 + row);
          }
          groundCtx.stroke();
        }
      }
    this.groundTexture = new THREE.CanvasTexture(groundCanvas);
    this.groundTexture.wrapS = this.groundTexture.wrapT = THREE.RepeatWrapping;
    this.groundTexture.repeat.set(
      this.map.width / 1100,
      this.map.height / 1100,
    );
    this.groundTexture.colorSpace = THREE.SRGBColorSpace;
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(this.map.width, this.map.height),
      new THREE.MeshStandardMaterial({ map: this.groundTexture, roughness: 1 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(this.map.width / 2, 0.03, this.map.height / 2);
    this.scene.add(field);
    const trees = [];
    const blocked = (x, y) =>
      this.map.terrain.some(
        (t) =>
          (t.type === "road" || t.type === "water") &&
          x >= t.x - 6 &&
          x <= t.x + t.w + 6 &&
          y >= t.y - 6 &&
          y <= t.y + t.h + 6,
      ) ||
      (this.map.buildings ?? []).some(
        (b) =>
          x >= b.x - 9 &&
          x <= b.x + b.w + 9 &&
          y >= b.y - 9 &&
          y <= b.y + b.h + 9,
      );
    for (const t of this.map.terrain) {
      const x = t.x + t.w / 2,
        z = t.y + t.h / 2;
      if (t.type === "road") {
        this.plane(t.w, t.h, 0x8f9586, x, z, 0.26);
        // Road center lines make the connected network readable at tactical zoom.
        if (t.w > t.h * 2)
          for (let a = t.x + 18; a < t.x + t.w - 10; a += 48)
            this.plane(18, 1.6, 0xc6c4a5, a, z, 0.28);
        else if (t.h > t.w * 2)
          for (let a = t.y + 18; a < t.y + t.h - 10; a += 48)
            this.plane(1.6, 18, 0xc6c4a5, x, a, 0.28);
      } else if (t.type === "water") this.plane(t.w, t.h, 0x427781, x, z, 0.16);
      else if (t.type === "town") this.plane(t.w, t.h, 0x999583, x, z, 0.15);
      else if (t.type === "forest") {
        const density = t.density ?? 0.85;
        this.plane(
          t.w,
          t.h,
          density < 0.25 ? 0x708064 : density < 0.6 ? 0x5c7555 : 0x455f48,
          x,
          z,
          0.18,
        );
        const spacing = density < 0.25 ? 44 : density < 0.6 ? 35 : 25;
        for (let ty = t.y + 9; ty < t.y + t.h - 6; ty += spacing)
          for (let tx = t.x + 9; tx < t.x + t.w - 6; tx += spacing) {
            const px = Math.min(t.x + t.w - 5, tx + random() * 8),
              py = Math.min(t.y + t.h - 5, ty + random() * 8);
            if (!blocked(px, py))
              trees.push([px, py, 17 + random() * 13, density < 0.6]);
          }
      }
    }
    this.buildingById = new Map(
      (this.map.buildings ?? []).map((b) => [b.id, b]),
    );
    for (const b of this.map.buildings ?? []) {
      const x = b.x + b.w / 2,
        z = b.y + b.h / 2,
        height = (b.height ?? 18) - 6;
      this.box(b.w, height, b.h, b.occupiable ? 0xbab49d : 0x929d97, x, 0, z);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1, 1, 4),
        this.material(b.occupiable ? 0x816651 : 0x59696a),
      );
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(b.w / Math.SQRT2, 6, b.h / Math.SQRT2);
      roof.position.set(x, height + 3, z);
      this.scene.add(roof);
      // Doors and windows sit on the solid footprint; access markers are contextual.
      for (const door of b.doors ?? []) {
        const dx = Math.abs(door.x - x),
          dy = Math.abs(door.y - z);
        if (dx > dy)
          this.box(
            0.4,
            7,
            4,
            0x3e5149,
            door.x < x ? b.x - 0.25 : b.x + b.w + 0.25,
            0,
            z,
          );
        else
          this.box(
            4,
            7,
            0.4,
            0x3e5149,
            x,
            0,
            door.y < z ? b.y - 0.25 : b.y + b.h + 0.25,
          );
      }
      for (let a = b.x + 6; a < b.x + b.w - 3; a += 12) {
        this.box(3, 3, 0.3, 0x435963, a, height * 0.55, b.y - 0.2);
        this.box(3, 3, 0.3, 0x435963, a, height * 0.55, b.y + b.h + 0.2);
      }
    }
    const foliage = new THREE.InstancedMesh(
      new THREE.ConeGeometry(11, 28, 6),
      this.material(0x294f41),
      trees.length,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(12, 0),
      this.material(0x50794e),
      trees.length,
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1.6, 2, 10, 5),
      this.material(0x655a40),
      trees.length,
    );
    const matrix = new THREE.Matrix4();
    trees.forEach(([x, z, h, broad], i) => {
      matrix.compose(
        new THREE.Vector3(x, h / 2 + 4, z),
        new THREE.Quaternion(),
        new THREE.Vector3(h / 22, h / 22, h / 22),
      );
      if (broad) {
        crowns.setMatrixAt(i, matrix);
        matrix.makeScale(0, 0, 0);
        foliage.setMatrixAt(i, matrix);
      } else {
        foliage.setMatrixAt(i, matrix);
        matrix.makeScale(0, 0, 0);
        crowns.setMatrixAt(i, matrix);
      }
      matrix.makeTranslation(x, 5, z);
      trunks.setMatrixAt(i, matrix);
    });
    this.scene.add(foliage, crowns, trunks);
    this.sectorMeshes = new Map();
    for (const s of this.map.sectors) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(s.radius - 2, s.radius + 1.5, 72),
        new THREE.MeshBasicMaterial({
          color: 0xe0d9ac,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, 0.7, s.y);
      this.scene.add(ring);
      this.sectorMeshes.set(s.id, ring);
      this.box(2, 28, 2, 0xaab7a7, s.x, 0, s.y);
      this.box(18, 10, 1, 0xb6c4ad, s.x + 9, 17, s.y);
    }
    this.map.spawns.forEach((s, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(183, 186, 80),
        new THREE.MeshBasicMaterial({
          color: i ? RED : BLUE,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, 0.8, s.y);
      this.scene.add(ring);
      this.plane(88, 6, i ? 0x8b7362 : 0x6b8380, s.x, s.y - 85, 0.32);
    });
    this.fogCanvas = document.createElement("canvas");
    this.fogCanvas.width = Math.min(320, Math.ceil(this.map.width / 8));
    this.fogCanvas.height = Math.ceil(
      (this.fogCanvas.width * this.map.height) / this.map.width,
    );
    this.fogCtx = this.fogCanvas.getContext("2d");
    this.fogGrid = createFogGrid(this.map);
    this.explored = new Uint8Array(
      this.fogCanvas.width * this.fogCanvas.height,
    );
    this.fogTexture = new THREE.CanvasTexture(this.fogCanvas);
    this.fogTexture.minFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({
      map: this.fogTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    this.fogMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.map.width, this.map.height),
      mat,
    );
    this.fogMesh.rotation.x = -Math.PI / 2;
    this.fogMesh.position.set(this.map.width / 2, 38, this.map.height / 2);
    this.fogMesh.renderOrder = 2;
    this.scene.add(this.fogMesh);
    this.fogMesh.visible = false;
  }
  batchTerrain(parent = this.scene) {
    // Merge fixed parts by material, preserving unit rings and animated rotors.
    parent.updateMatrixWorld(true);
    const batches = new Map();
    for (const mesh of [...parent.children]) {
      if (
        !mesh.isMesh ||
        mesh.name === "rotor" ||
        mesh.isInstancedMesh ||
        !mesh.material.isMeshStandardMaterial
      )
        continue;
      const geometry = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      const key = mesh.material.uuid;
      if (!batches.has(key))
        batches.set(key, { material: mesh.material, items: [] });
      batches.get(key).items.push(geometry);
      parent.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const batch of batches.values()) {
      const geometry = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"]) {
        const length = batch.items.reduce(
          (n, g) => n + g.attributes[name].array.length,
          0,
        );
        const data = new Float32Array(length);
        let offset = 0;
        for (const item of batch.items) {
          data.set(item.attributes[name].array, offset);
          offset += item.attributes[name].array.length;
        }
        geometry.setAttribute(
          name,
          new THREE.BufferAttribute(data, name === "uv" ? 2 : 3),
        );
      }
      geometry.computeBoundingSphere();
      parent.add(new THREE.Mesh(geometry, batch.material));
      for (const g of batch.items) g.dispose();
    }
  }
  makeUnit(type, team) {
    const g = new THREE.Group(),
      color = team ? 0x8f7860 : 0x728f7a,
      dark = 0x263a35,
      edge = team ? RED : BLUE;
    const add = (w, h, d, c, x, y, z) => this.box(w, h, d, c, x, y, z, g);
    const wheel = (x, z) => {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 3, 3, 8),
        this.material(dark),
      );
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 3, z);
      g.add(w);
    };
    if (type === "infantry") {
      for (const [x, z] of [
        [0, -6],
        [-5, 3],
        [5, 3],
      ]) {
        add(4, 7, 3, color, x, 1, z);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(2.2, 6, 4),
          this.material(0x9fa18a),
        );
        head.position.set(x, 10, z);
        g.add(head);
        add(1, 1, 7, dark, x + 2, 6, z - 3);
      }
    } else if (type === "helicopter") {
      add(10, 8, 23, color, 0, 0, 0);
      add(3, 3, 24, color, 0, 3, 19);
      add(5, 5, 10, 0x38585e, 0, 1, -7);
      const rotor = add(46, 0.7, 2, dark, 0, 11, 0);
      rotor.name = "rotor";
      add(2, 0.7, 46, dark, 0, 11, 0);
      add(21, 1.5, 2, dark, 0, -2, 5);
      add(2, 1.5, 20, dark, -10, -3, 0);
      add(2, 1.5, 20, dark, 10, -3, 0);
    } else if (type === "jet") {
      add(8, 5, 38, color, 0, 0, 0);
      add(38, 1.5, 10, color, 0, 1, 5);
      add(17, 1, 5, color, 0, 3, 17);
      add(1.5, 9, 7, color, 0, 3, 16);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(4, 15, 5),
        this.material(color),
      );
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0, 2, -26);
      g.add(tip);
    } else {
      const w = type === "recon" ? 11 : type === "tank" ? 20 : 17,
        d = type === "recon" ? 20 : 30;
      add(w, 6, d, color, 0, 3, 0);
      if (type === "tank" || type === "artillery") {
        add(5, 6, d + 3, dark, -w / 2, 0, 0);
        add(5, 6, d + 3, dark, w / 2, 0, 0);
      } else
        for (const z of [-9, 7]) {
          wheel(-w / 2, z);
          wheel(w / 2, z);
        }
      if (type === "supply") {
        add(16, 12, 20, 0x849379, 0, 8, 4);
        add(14, 7, 9, color, 0, 8, -11);
        add(8, 0.6, 2, 0xd0d5b0, 0, 21, 4);
        add(2, 0.6, 8, 0xd0d5b0, 0, 21, 4);
      } else if (type === "aa") {
        add(12, 4, 12, color, 0, 9, 0);
        for (const x of [-4, 4]) add(2, 2, 20, dark, x, 15, -6);
      } else if (type === "tank" || type === "artillery") {
        add(12, 5, 13, color, 0, 9, 0);
        add(2.5, 2.5, type === "artillery" ? 32 : 24, dark, 0, 12, -15);
      } else {
        add(w - 4, 5, 10, color, 0, 9, -3);
        add(1.3, 1.3, 10, dark, 0, 14, -8);
      }
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(15, 17, 32),
      new THREE.MeshBasicMaterial({
        color: edge,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.5;
    ring.name = "selection";
    ring.visible = false;
    g.add(ring);
    this.batchTerrain(g);
    this.scene.add(g);
    return g;
  }
  setState(state, playerId) {
    this.state = state;
    this.playerId = playerId;
    this.myTeam = state.players.find((p) => p.id === playerId)?.team ?? 0;
    const ids = new Set();
    for (const u of state.units) {
      if (u.loadedIn) continue;
      ids.add(u.id);
      let m = this.units.get(u.id);
      if (!m) {
        m = this.makeUnit(u.type, u.team);
        m.position.set(u.x, UNIT_TYPES[u.type]?.domain === "air" ? 55 : 0, u.y);
        this.units.set(u.id, m);
      }
      m.userData.unit = u;
      m.visible = !u.garrisonedIn;
      m.getObjectByName("selection").visible = this.selected.has(u.id);
    }
    for (const [id, m] of this.units)
      if (!ids.has(id)) {
        this.scene.remove(m);
        m.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
        });
        this.units.delete(id);
      }
    for (const s of state.sectors)
      this.sectorMeshes
        .get(s.id)
        ?.material.color.setHex(
          s.owner === 0 ? BLUE : s.owner === 1 ? RED : 0xe0d9ac,
        );
    this.fogMesh.visible = true;
    this.syncSmoke();
    for (const e of state.events ?? []) {
      if (this.seenEvents.has(e.id)) continue;
      this.seenEvents.add(e.id);
      if (e.type === "shot" || e.type === "explosion" || e.type === "hit") {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(e.type === "explosion" ? 12 : 4, 6, 4),
          new THREE.MeshBasicMaterial({
            color: 0xffd8a0,
            transparent: true,
            opacity: 0.9,
          }),
        );
        mesh.position.set(e.x, 9, e.y);
        this.scene.add(mesh);
        this.effects.push({ mesh, life: 0.3 });
      }
    }
    if (this.seenEvents.size > 400)
      this.seenEvents = new Set((state.events ?? []).map((e) => e.id));
  }
  syncSmoke() {
    const ids = new Set();
    for (const s of this.state?.smokes ?? []) {
      ids.add(s.id);
      let mesh = this.smokeMeshes.get(s.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 10, 6),
          new THREE.MeshBasicMaterial({
            color: 0xd7d9cd,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          }),
        );
        mesh.renderOrder = 3;
        this.scene.add(mesh);
        this.smokeMeshes.set(s.id, mesh);
      }
      mesh.position.set(s.x, 13, s.y);
      mesh.scale.set(s.radius, 22, s.radius);
    }
    for (const [id, mesh] of this.smokeMeshes)
      if (!ids.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.smokeMeshes.delete(id);
      }
  }
  setBuildingContext(id, eligible) {
    this.selectedBuildingId = id;
    this.highlightBuildings = eligible;
  }
  buildingScreen(building) {
    return this.screenAt(
      building.x + building.w / 2,
      building.y + building.h / 2,
      (building.height ?? 18) + 9,
    );
  }
  unitScreen(unit, baseHeight = 12) {
    const building = this.buildingById?.get(unit.garrisonedIn);
    return building
      ? this.buildingScreen(building)
      : this.screenAt(
          unit.x,
          unit.y,
          UNIT_TYPES[unit.type]?.domain === "air" ? 62 : baseHeight,
        );
  }
  pickBuilding(x, y) {
    let chosen = null,
      nearest = Infinity;
    for (const b of this.map.buildings ?? []) {
      const center = this.buildingScreen(b),
        corners = [
          [b.x, b.y],
          [b.x + b.w, b.y],
          [b.x + b.w, b.y + b.h],
          [b.x, b.y + b.h],
        ].flatMap(([px, py]) => [
          this.screenAt(px, py, 0),
          this.screenAt(px, py, (b.height ?? 18) + 6),
        ]);
      const xs = corners.map((p) => p.x),
        ys = corners.map((p) => p.y);
      if (
        x < Math.min(...xs) - 5 ||
        x > Math.max(...xs) + 5 ||
        y < Math.min(...ys) - 5 ||
        y > Math.max(...ys) + 5
      )
        continue;
      const distance = Math.hypot(x - center.x, y - center.y);
      if (distance < nearest) {
        chosen = b;
        nearest = distance;
      }
    }
    return chosen;
  }
  setSelected(ids) {
    this.selected = new Set(ids);
    for (const [id, m] of this.units)
      m.getObjectByName("selection").visible = this.selected.has(id);
  }
  resize() {
    this.width = this.element.clientWidth;
    this.height = this.element.clientHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.labels.width = this.width * devicePixelRatio;
    this.labels.height = this.height * devicePixelRatio;
    this.updateCamera();
  }
  updateCamera() {
    const h = 980 / this.zoom,
      w = (h * this.width) / this.height;
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.position.set(this.center.x, 3000, this.center.y + 2160);
    this.camera.lookAt(this.center.x, 0, this.center.y);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
  worldAt(x, y) {
    this.ray.setFromCamera(
      new THREE.Vector2((x / this.width) * 2 - 1, (-y / this.height) * 2 + 1),
      this.camera,
    );
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.ground, p)
      ? { x: p.x, y: p.z }
      : null;
  }
  screenAt(x, y, h = 12) {
    const p = new THREE.Vector3(x, h, y).project(this.camera);
    return {
      x: ((p.x + 1) * this.width) / 2,
      y: ((1 - p.y) * this.height) / 2,
    };
  }
  pan(dx, dy) {
    const a = this.worldAt(this.width / 2, this.height / 2),
      b = this.worldAt(this.width / 2 + dx, this.height / 2 + dy);
    if (a && b)
      this.focus(this.center.x + a.x - b.x, this.center.y + a.y - b.y);
  }
  focus(x, y) {
    this.center.x = Math.max(-80, Math.min(this.map.width + 80, x));
    this.center.y = Math.max(-80, Math.min(this.map.height + 80, y));
    this.updateCamera();
  }
  scale(factor, x = this.width / 2, y = this.height / 2) {
    const before = this.worldAt(x, y);
    this.zoom = Math.max(
      Math.min(
        0.58,
        880 /
          Math.max(
            this.map.height * 0.813,
            (this.map.width * this.height) / this.width,
          ),
      ),
      Math.min(3.6, this.zoom * factor),
    );
    this.updateCamera();
    const after = this.worldAt(x, y);
    if (before && after)
      this.focus(
        this.center.x + before.x - after.x,
        this.center.y + before.y - after.y,
      );
  }
  pick(x, y, ownOnly = true) {
    let best = null,
      min = 30;
    for (const u of this.state?.units ?? []) {
      if (u.loadedIn || (ownOnly && u.ownerId !== this.playerId)) continue;
      const p = this.unitScreen(u),
        d = Math.hypot(p.x - x, p.y - y);
      if (d < min) {
        min = d;
        best = u;
      }
    }
    return best;
  }
  updateFog() {
    if (!this.state) return;
    const ctx = this.fogCtx,
      w = this.fogCanvas.width,
      h = this.fogCanvas.height,
      sx = this.map.width / w,
      sy = this.map.height / h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    // Coarse silhouettes match solid walls and gradual vegetation attenuation.
    // This display mask never decides which enemy units are sent to the client.
    for (const u of this.state.units) {
      if (u.team !== this.myTeam || u.loadedIn) continue;
      const building = this.buildingById.get(u.garrisonedIn);
      const radius = (UNIT_TYPES[u.type]?.vision ?? 180) + (building ? 180 : 0);
      const origins = building
        ? building.firePoints.map((p) => ({
            ...p,
            z: Math.min(building.height - 1, 5),
          }))
        : [
            {
              x: u.x,
              y: u.y,
              z: u.type === "jet" ? 65 : u.type === "helicopter" ? 35 : 2,
            },
          ];
      for (const origin of origins) {
        const points = visibilityOutline(
          this.fogGrid,
          origin,
          radius,
          u.type === "recon",
          this.state.smokes,
        );
        ctx.beginPath();
        points.forEach((p, i) =>
          i ? ctx.lineTo(p.x / sx, p.y / sy) : ctx.moveTo(p.x / sx, p.y / sy),
        );
        ctx.closePath();
        ctx.fill();
      }
    }
    const image = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      const visible = image.data[i * 4 + 3] > 0;
      if (visible) this.explored[i] = 1;
      image.data[i * 4] = 8;
      image.data[i * 4 + 1] = 18;
      image.data[i * 4 + 2] = 25;
      image.data[i * 4 + 3] = visible ? 0 : this.explored[i] ? 115 : 195;
    }
    ctx.putImageData(image, 0, 0);
    this.fogTexture.needsUpdate = true;
  }
  drawLabels() {
    const c = this.labelCtx;
    c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    if (!this.state) return;
    c.textAlign = "center";
    for (const [index, s] of this.state.sectors.entries()) {
      const p = this.screenAt(s.x, s.y, 32);
      if (p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) continue;
      c.fillStyle = "#10232be0";
      c.fillRect(p.x - 12, p.y - 25, 24, 22);
      c.fillStyle =
        s.owner === 0 ? "#9edcff" : s.owner === 1 ? "#ffc0a6" : "#e5e0bd";
      c.font = "bold 11px Arial";
      c.fillText(String(index + 1), p.x, p.y - 10);
    }
    for (const b of this.map.buildings ?? []) {
      const occupants = this.state.units.filter((u) => u.garrisonedIn === b.id),
        own = occupants.filter((u) => u.team === this.myTeam);
      const selected = b.id === this.selectedBuildingId;
      if (
        !selected &&
        !own.length &&
        !(this.highlightBuildings && b.occupiable)
      )
        continue;
      const p = this.buildingScreen(b);
      if (p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) continue;
      const corners = [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.h],
        [b.x, b.y + b.h],
      ].map(([x, y]) => this.screenAt(x, y, b.height ?? 18));
      c.strokeStyle = selected ? "#ffe0a3" : own.length ? "#91d6ef" : "#c9debe";
      c.lineWidth = selected ? 2 : 1;
      c.beginPath();
      corners.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.closePath();
      c.stroke();
      if (selected || own.length || this.zoom > 1) {
        const label = own.length
          ? "⌂ " + own.length + "/" + b.capacity
          : "⌂ " + b.capacity;
        c.font = "bold 11px Arial";
        c.fillStyle = "#10232bf0";
        c.fillRect(p.x - 20, p.y - 12, 40, 18);
        c.fillStyle = own.length ? "#91d6ef" : "#e0e9cf";
        c.fillText(label, p.x, p.y + 1);
      }
      if (selected)
        for (const door of b.doors ?? []) {
          const d = this.screenAt(door.x, door.y, 1);
          c.fillStyle = "#ffe0a3";
          c.beginPath();
          c.arc(d.x, d.y, 3, 0, Math.PI * 2);
          c.fill();
        }
    }
    for (const u of this.state.units) {
      if (u.loadedIn) continue;
      const p = this.unitScreen(u, 20);
      if (p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) continue;
      const sel = this.selected.has(u.id);
      c.fillStyle = u.team === 0 ? "#98d8ed" : "#f5a991";
      c.beginPath();
      c.moveTo(p.x, p.y - 10);
      c.lineTo(p.x - 4, p.y - 16);
      c.lineTo(p.x + 4, p.y - 16);
      c.fill();
      if (sel || this.zoom > 1.35) {
        c.fillStyle = "#0d1b22d9";
        c.fillRect(p.x - 22, p.y - 27, 44, 5);
        c.fillStyle =
          u.hp / (u.maxHp ?? UNIT_TYPES[u.type].hp) < 0.35
            ? "#e19075"
            : "#a9d59d";
        c.fillRect(
          p.x - 22,
          p.y - 27,
          44 * Math.max(0, u.hp / (u.maxHp ?? UNIT_TYPES[u.type].hp)),
          4,
        );
        if (sel) {
          c.font = "bold 10px Arial";
          c.fillStyle = "#eff5ea";
          c.fillText(UNIT_TYPES[u.type].name, p.x, p.y - 34);
        }
      }
    }
  }
  drawMinimap(canvas) {
    if (!this.state) return;
    const c = canvas.getContext("2d"),
      sx = canvas.width / this.map.width,
      sy = canvas.height / this.map.height;
    c.fillStyle = "#465b4c";
    c.fillRect(0, 0, canvas.width, canvas.height);
    // Match simulation precedence: roads cross water, water supersedes cover.
    const priority = { forest: 0, town: 0, water: 1, road: 2 };
    for (const t of [...this.map.terrain].sort(
      (a, b) => priority[a.type] - priority[b.type],
    )) {
      c.fillStyle =
        {
          forest: "#243f32",
          water: "#3e6970",
          town: "#8b8970",
          road: "#97937a",
        }[t.type] ?? "#5b7258";
      c.fillRect(t.x * sx, t.y * sy, t.w * sx, t.h * sy);
    }
    for (const b of this.map.buildings ?? []) {
      c.fillStyle = b.occupiable ? "#b6b09a" : "#76837b";
      c.fillRect(
        b.x * sx,
        b.y * sy,
        Math.max(1, b.w * sx),
        Math.max(1, b.h * sy),
      );
    }
    for (const s of this.state.sectors) {
      c.strokeStyle =
        s.owner === 0 ? "#91d9f4" : s.owner === 1 ? "#f3a38e" : "#e0d9ac";
      c.beginPath();
      c.arc(s.x * sx, s.y * sy, s.radius * sx, 0, Math.PI * 2);
      c.stroke();
    }
    for (const u of this.state.units) {
      if (u.loadedIn) continue;
      c.fillStyle = this.selected.has(u.id)
        ? "#fff"
        : u.team === 0
          ? "#8dd8f0"
          : "#faa28a";
      c.fillRect(u.x * sx - 2, u.y * sy - 2, 4, 4);
    }
    const a = this.worldAt(0, 0),
      b = this.worldAt(this.width, 0),
      d = this.worldAt(this.width, this.height),
      e = this.worldAt(0, this.height);
    if (a && b && d && e) {
      c.strokeStyle = "#e4ede7aa";
      c.beginPath();
      c.moveTo(a.x * sx, a.y * sy);
      for (const p of [b, d, e]) c.lineTo(p.x * sx, p.y * sy);
      c.closePath();
      c.stroke();
    }
  }
  animate(now) {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const stopped = this.state?.paused || this.state?.timeControl?.paused;
    const gameDelta = stopped ? 0 : dt * (this.state?.timeControl?.speed ?? 1);
    for (const m of this.units.values()) {
      const u = m.userData.unit;
      m.position.x +=
        (u.x - m.position.x) * (stopped ? 1 : Math.min(1, dt * 16));
      m.position.z +=
        (u.y - m.position.z) * (stopped ? 1 : Math.min(1, dt * 16));
      if (Number.isFinite(u.heading)) m.rotation.y = -u.heading - Math.PI / 2;
      const rotor = m.getObjectByName("rotor");
      if (rotor) rotor.rotation.y += gameDelta * 35;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= gameDelta;
      e.mesh.material.opacity = Math.max(0, e.life * 3);
      e.mesh.scale.addScalar(gameDelta * 6);
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
    if (now - this.lastFog > 700) {
      this.updateFog();
      this.lastFog = now;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
    this.fpsFrames++;
    if (now - this.fpsTime > 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsTime));
      this.fpsFrames = 0;
      this.fpsTime = now;
    }
    this.onFrame?.(dt);
  }
}
