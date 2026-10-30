// Blocópolis — cidade: estradas, zonas, lotes e prédios que crescem sozinhos
// Sem contas, sem energia, sem água, sem reclamações: tudo é livre.

const ZONE_INFO = {
  1: { key: 'res', name: 'Residencial', color: 0xa6ff6e },
  2: { key: 'com', name: 'Comercial', color: 0x4aa3ff },
  3: { key: 'ind', name: 'Industrial', color: 0xffc23d },
};
const R_ANY = 1, R_CENTER = 2, R_AX = 4, R_AZ = 8;
// direção (dx, dz) da frente do lote até a rua, por orientação 0..3
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const LOT_SIZES = {
  1: [[4, 4], [3, 4], [4, 3], [3, 3]],
  2: [[5, 5], [4, 4], [4, 3], [3, 3]],
  3: [[6, 6], [5, 5], [5, 4], [4, 4]],
};
const UPGRADE_AGE = [0, 50, 120];
const SIM_TICK = 1.0;
const LAYER_TIME = 0.08;

class City {
  constructor(world) {
    this.world = world;
    const n = world.sx * world.sz;
    this.zone = new Uint8Array(n);
    this.road = new Uint8Array(n);
    this.roadH = new Uint8Array(n);
    this.lot = new Int32Array(n).fill(-1);
    this.buildings = new Map();
    this.nextId = 1;
    this.jobs = [];
    this.simTimer = 0;
    this.rng = makeRng((Date.now() ^ 0x5bd1e995) >>> 0);
    this.overlayDirty = true;
    this.roadVersion = 0;
    this.stats = { pop: 0, jobs: 0, count: 0 };
    this.statsDirty = true;
    this.overlay = null;
    this.onMilestone = null;
  }

  idx(x, z) { return z * this.world.sx + x; }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.world.sx && z < this.world.sz; }
  isRoad(x, z) { return this.inside(x, z) && (this.road[this.idx(x, z)] & R_ANY) !== 0; }
  isCenter(x, z) { return this.inside(x, z) && (this.road[this.idx(x, z)] & R_CENTER) !== 0; }

  roadLevelAt(x, z) {
    if (this.isRoad(x, z)) return this.roadH[this.idx(x, z)];
    return clamp(Math.max(this.world.groundY(x, z), this.world.waterLevel), 1, WORLD_H - 6);
  }

  // ---------------------------------------------------------------- estradas

  snapCenter(x, z, r) {
    let best = null, bd = 1e9;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (!this.isCenter(x + dx, z + dz)) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = { x: x + dx, z: z + dz }; }
      }
    }
    return best;
  }

  // Planeja uma estrada reta (3 blocos de largura) de A até B
  planRoad(ax, az, bx, bz) {
    const s = this.snapCenter(ax, az, 1) || { x: ax, z: az };
    let ex = bx, ez = bz;
    const alongX = Math.abs(bx - s.x) >= Math.abs(bz - s.z);
    if (alongX) ez = s.z; else ex = s.x;
    const sdx = alongX ? Math.sign(ex - s.x) : 0, sdz = alongX ? 0 : Math.sign(ez - s.z);
    if (!this.isCenter(ex, ez)) {
      for (const k of [1, -1]) {
        if (this.isCenter(ex + sdx * k, ez + sdz * k)) { ex += sdx * k; ez += sdz * k; break; }
      }
    }
    ex = clamp(ex, 0, this.world.sx - 1);
    ez = clamp(ez, 0, this.world.sz - 1);
    const n = Math.max(Math.abs(ex - s.x), Math.abs(ez - s.z));
    const dx = alongX ? Math.sign(ex - s.x) : 0, dz = alongX ? 0 : Math.sign(ez - s.z);
    const hA = this.roadLevelAt(s.x, s.z), hB = this.roadLevelAt(ex, ez);
    const tiles = [];
    for (let i = 0; i <= n; i++) {
      const cx = s.x + dx * i, cz = s.z + dz * i;
      const level = Math.round(lerp(hA, hB, n ? i / n : 0));
      for (let o = -1; o <= 1; o++) {
        const tx = cx + (alongX ? 0 : o), tz = cz + (alongX ? o : 0);
        if (!this.inside(tx, tz)) continue;
        tiles.push({ x: tx, z: tz, level, center: o === 0, i, o });
      }
    }
    return { alongX, tiles, length: n + 1 };
  }

  placeRoad(plan) {
    const axisBit = plan.alongX ? R_AX : R_AZ;
    let minX = 1e9, minZ = 1e9, maxX = -1, maxZ = -1;
    for (const t of plan.tiles) {
      const ti = this.idx(t.x, t.z);
      if (this.lot[ti] >= 0) this.demolishBuilding(this.lot[ti]);
      this.removeTreesIn(t.x, t.z, t.x, t.z);
    }
    for (const t of plan.tiles) {
      const ti = this.idx(t.x, t.z);
      this.zone[ti] = 0;
      let level = t.level;
      if (this.road[ti] & R_ANY) level = this.roadH[ti];
      this.road[ti] |= R_ANY | axisBit | (t.center ? R_CENTER : 0);
      this.roadH[ti] = level;
      this.buildRoadColumn(t.x, t.z, level, t.i, t.o);
      minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x);
      minZ = Math.min(minZ, t.z); maxZ = Math.max(maxZ, t.z);
    }
    this.updateMarkings(minX - 1, minZ - 1, maxX + 1, maxZ + 1);
    this.roadVersion++;
    this.overlayDirty = true;
  }

  buildRoadColumn(x, z, level, i, o) {
    const w = this.world;
    const ground = w.groundY(x, z);
    for (let y = level + 1; y < WORLD_H; y++) w.set(x, y, z, B.AIR);
    const gap = level - 1 - ground;
    if (gap >= 3) {
      // ponte: viga embaixo e pilares de tempos em tempos
      w.set(x, level - 1, z, B.CONCRETE);
      if (i % 6 === 0 && o === 0) for (let y = ground + 1; y < level - 1; y++) w.set(x, y, z, B.CONCRETE);
    } else {
      for (let y = ground + 1; y < level; y++) w.set(x, y, z, y === level - 1 ? B.DIRT : B.STONE);
    }
    w.set(x, level, z, B.ASPHALT);
  }

  updateMarkings(x0, z0, x1, z1) {
    for (let z = Math.max(0, z0); z <= Math.min(this.world.sz - 1, z1); z++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.world.sx - 1, x1); x++) {
        const r = this.road[this.idx(x, z)];
        if (!(r & R_ANY)) continue;
        let id = B.ASPHALT;
        const axes = r & (R_AX | R_AZ);
        if (r & R_CENTER) {
          if (axes === R_AX) id = B.ROAD_X;
          else if (axes === R_AZ) id = B.ROAD_Z;
        }
        this.world.set(x, this.roadH[this.idx(x, z)], z, id);
      }
    }
  }

  removeRoadTile(x, z, touchBlocks = true) {
    const ti = this.idx(x, z);
    if (!(this.road[ti] & R_ANY)) return;
    const w = this.world;
    const h = this.roadH[ti];
    this.road[ti] = 0;
    if (touchBlocks) {
      const below = w.get(x, h - 1, z);
      if (below === B.CONCRETE && !BLOCK_SOLID[w.get(x, h - 2, z)]) {
        w.set(x, h, z, B.AIR);
        for (let y = h - 1; y > 0 && w.get(x, y, z) === B.CONCRETE; y--) w.set(x, y, z, y <= w.waterLevel ? B.WATER : B.AIR);
      } else {
        w.set(x, h, z, h <= w.waterLevel ? B.SAND : B.GRASS);
      }
    }
    // tira o eixo da via dos vizinhos que ficaram sem par
    this.updateMarkings(x - 1, z - 1, x + 1, z + 1);
    this.roadVersion++;
  }

  // ---------------------------------------------------------------- zonas

  paintZone(x0, z0, x1, z1, zone) {
    let changed = 0;
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        if (!this.inside(x, z)) continue;
        const ti = this.idx(x, z);
        if (this.road[ti]) continue;
        if (this.lot[ti] >= 0) {
          const b = this.buildings.get(this.lot[ti]);
          if (b && b.kind === 'special') continue;
          if (b && b.zone !== zone) this.demolishBuilding(b.id);
        }
        if (this.zone[ti] !== zone) { this.zone[ti] = zone; changed++; }
      }
    }
    this.overlayDirty = true;
    return changed;
  }

  demolishArea(x0, z0, x1, z1) {
    const w = this.world;
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        if (!this.inside(x, z)) continue;
        const ti = this.idx(x, z);
        if (this.lot[ti] >= 0) this.demolishBuilding(this.lot[ti]);
        if (this.road[ti]) this.removeRoadTile(x, z);
        this.zone[ti] = 0;
        this.clearPlants(x, z);
        const top = w.topY(x, z);
        if (top >= 0 && (w.get(x, top, z) === B.FLOWERS)) w.set(x, top, z, B.GRASS);
      }
    }
    this.overlayDirty = true;
  }

  clearPlants(x, z) {
    const w = this.world;
    for (let y = WORLD_H - 1; y > 0; y--) {
      const id = w.get(x, y, z);
      if (BLOCK_PLANT[id]) w.set(x, y, z, y <= w.waterLevel ? B.WATER : B.AIR);
    }
  }

  // Tira árvores com tronco dentro do retângulo, junto com a copa (evita folhas flutuando)
  removeTreesIn(x0, z0, x1, z1) {
    const w = this.world;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        let lo = -1, hi = -1;
        for (let y = 1; y < WORLD_H; y++) {
          const id = w.get(x, y, z);
          if (id === B.LOG || id === B.BIRCH_LOG) {
            if (lo < 0) lo = y;
            hi = y;
          }
        }
        if (lo < 0) continue;
        for (let y = lo; y <= hi; y++) {
          const id = w.get(x, y, z);
          if (id === B.LOG || id === B.BIRCH_LOG) w.set(x, y, z, B.AIR);
        }
        for (let y = lo + 1; y <= hi + 2; y++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const id = w.get(x + dx, y, z + dz);
              if (id === B.LEAVES || id === B.PINE_LEAVES) w.set(x + dx, y, z + dz, B.AIR);
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- lotes e prédios

  localToWorld(b, u, v) {
    switch (b.facing) {
      case 0: return [b.x0 + u, b.z0 + v];
      case 2: return [b.x0 + b.W - 1 - u, b.z0 + b.D - 1 - v];
      case 3: return [b.x0 + v, b.z0 + b.D - 1 - u];
      default: return [b.x0 + b.W - 1 - v, b.z0 + u];
    }
  }

  localSize(b) {
    return b.facing % 2 === 0 ? [b.W, b.D] : [b.D, b.W];
  }

  rectFree(x0, z0, W, D, zone) {
    for (let z = z0; z < z0 + D; z++) {
      for (let x = x0; x < x0 + W; x++) {
        if (!this.inside(x, z)) return false;
        const ti = this.idx(x, z);
        if (this.road[ti] || this.lot[ti] >= 0) return false;
        if (zone && this.zone[ti] !== zone) return false;
      }
    }
    return true;
  }

  rectSlopeOk(x0, z0, W, D, base, maxDiff) {
    for (let z = z0; z < z0 + D; z++) {
      for (let x = x0; x < x0 + W; x++) {
        if (Math.abs(this.world.groundY(x, z) - base) > maxDiff) return false;
      }
    }
    return true;
  }

  findLot(t, f, zone) {
    const sx = this.world.sx;
    const cx = t % sx, cz = Math.floor(t / sx);
    const nb = this.idx(cx + DIRS[f][0], cz + DIRS[f][1]);
    const base = this.roadH[nb];
    for (const [w, d] of LOT_SIZES[zone]) {
      const offsets = shuffle(this.rng, [...Array(w).keys()]);
      for (const k of offsets) {
        let x0, z0, W, D;
        if (f === 0) { x0 = cx - k; z0 = cz; W = w; D = d; }
        else if (f === 2) { x0 = cx - k; z0 = cz - d + 1; W = w; D = d; }
        else if (f === 1) { x0 = cx - d + 1; z0 = cz - k; W = d; D = w; }
        else { x0 = cx; z0 = cz - k; W = d; D = w; }
        if (!this.rectFree(x0, z0, W, D, zone)) continue;
        if (!this.rectSlopeOk(x0, z0, W, D, base, 6)) continue;
        return { x0, z0, W, D, facing: f, base };
      }
    }
    return null;
  }

  trySpawn() {
    const sx = this.world.sx, sz = this.world.sz;
    const cands = [];
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const t = z * sx + x;
        if (!this.zone[t] || this.lot[t] >= 0 || this.road[t]) continue;
        for (let f = 0; f < 4; f++) {
          const nx = x + DIRS[f][0], nz = z + DIRS[f][1];
          if (this.isRoad(nx, nz)) { cands.push(t * 4 + f); break; }
        }
      }
    }
    if (!cands.length) return 0;
    shuffle(this.rng, cands);
    const want = Math.min(4, 1 + Math.floor(cands.length / 60));
    let made = 0;
    for (let i = 0; i < cands.length && i < 40 && made < want; i++) {
      const t = cands[i] >> 2, f = cands[i] & 3;
      if (this.lot[t] >= 0) continue;
      const zone = this.zone[t];
      const lot = this.findLot(t, f, zone);
      if (!lot) continue;
      this.createBuilding({ kind: 'zone', zone, level: 1, ...lot });
      made++;
    }
    return made;
  }

  createBuilding(info) {
    const b = {
      id: this.nextId++,
      kind: info.kind,
      zone: info.zone || 0,
      type: info.type || null,
      x0: info.x0, z0: info.z0, W: info.W, D: info.D,
      facing: info.facing, base: info.base,
      level: info.level || 1,
      seed: (this.rng() * 4294967296) >>> 0,
      locked: false,
      age: 0,
      maxY: info.base,
      pop: 0, work: 0,
      smoke: [],
      building: false,
    };
    this.buildings.set(b.id, b);
    for (let z = b.z0; z < b.z0 + b.D; z++) for (let x = b.x0; x < b.x0 + b.W; x++) this.lot[this.idx(x, z)] = b.id;
    this.flattenLot(b);
    this.startConstruction(b);
    this.overlayDirty = true;
    return b;
  }

  flattenLot(b) {
    const w = this.world;
    this.removeTreesIn(b.x0, b.z0, b.x0 + b.W - 1, b.z0 + b.D - 1);
    for (let z = b.z0; z < b.z0 + b.D; z++) {
      for (let x = b.x0; x < b.x0 + b.W; x++) {
        const g = w.groundY(x, z);
        for (let y = b.base + 1; y < WORLD_H; y++) w.set(x, y, z, B.AIR);
        for (let y = Math.min(g + 1, b.base); y < b.base; y++) w.set(x, y, z, B.DIRT);
        w.set(x, b.base, z, B.GRASS);
      }
    }
  }

  blueprintFor(b) {
    const [w, d] = this.localSize(b);
    const maxH = WORLD_H - b.base - 2;
    if (b.kind === 'special') return buildSpecial(b.type, b.seed, maxH);
    return generateBuilding(b.zone, b.level, w, d, b.seed, maxH);
  }

  startConstruction(b) {
    const bp = this.blueprintFor(b);
    const blocks = [];
    let maxY = b.base, solid = 0;
    for (const [u, y, v, id] of bp.list()) {
      const [wx, wz] = this.localToWorld(b, u, v);
      const wy = b.base + 1 + y;
      if (wy >= WORLD_H) continue;
      blocks.push([wx, wy, wz, id]);
      if (wy > maxY) maxY = wy;
      if (y >= 0) solid++;
    }
    blocks.sort((a, c) => a[1] - c[1]);
    b.maxY = maxY;
    b.smoke = bp.smoke.map(([u, y, v]) => {
      const [wx, wz] = this.localToWorld(b, u, v);
      return [wx + 0.5, b.base + 1 + y + 0.3, wz + 0.5];
    });
    // números só para diversão: moradores e vagas de trabalho
    b.pop = b.zone === 1 ? Math.max(2, Math.round(solid / 7)) : 0;
    b.work = b.zone === 2 || b.zone === 3 ? Math.max(2, Math.round(solid / 9)) : 0;
    b.building = true;
    this.jobs = this.jobs.filter((j) => j.b !== b);
    this.jobs.push({ b, blocks, i: 0, timer: 0 });
  }

  updateJobs(dt) {
    if (!this.jobs.length) return;
    const w = this.world;
    for (const job of this.jobs) {
      job.timer += dt;
      while (job.timer >= LAYER_TIME && job.i < job.blocks.length) {
        job.timer -= LAYER_TIME;
        const y = job.blocks[job.i][1];
        while (job.i < job.blocks.length && job.blocks[job.i][1] === y) {
          const [x, by, z, id] = job.blocks[job.i++];
          w.set(x, by, z, id);
        }
      }
      if (job.i >= job.blocks.length) {
        job.done = true;
        job.b.building = false;
        this.statsDirty = true;
      }
    }
    this.jobs = this.jobs.filter((j) => !j.done);
  }

  finishAllJobs() {
    for (const job of this.jobs) {
      for (; job.i < job.blocks.length; job.i++) {
        const [x, y, z, id] = job.blocks[job.i];
        this.world.set(x, y, z, id);
      }
      job.b.building = false;
    }
    this.jobs = [];
    this.statsDirty = true;
  }

  clearBuildingBlocks(b) {
    const w = this.world;
    for (let z = b.z0; z < b.z0 + b.D; z++) {
      for (let x = b.x0; x < b.x0 + b.W; x++) {
        for (let y = b.base + 1; y <= b.maxY; y++) w.set(x, y, z, B.AIR);
        w.set(x, b.base, z, B.GRASS);
      }
    }
  }

  demolishBuilding(id) {
    const b = this.buildings.get(id);
    if (!b) return;
    this.jobs = this.jobs.filter((j) => j.b !== b);
    this.clearBuildingBlocks(b);
    for (let z = b.z0; z < b.z0 + b.D; z++) {
      for (let x = b.x0; x < b.x0 + b.W; x++) {
        const ti = this.idx(x, z);
        if (this.lot[ti] === id) this.lot[ti] = -1;
      }
    }
    this.buildings.delete(id);
    this.overlayDirty = true;
    this.statsDirty = true;
  }

  // Valorização: construções especiais por perto ajudam os prédios a crescer
  nearbySpecials(b, r) {
    const cx = b.x0 + b.W / 2, cz = b.z0 + b.D / 2;
    let n = 0;
    for (const o of this.buildings.values()) {
      if (o.kind !== 'special') continue;
      const ox = o.x0 + o.W / 2, oz = o.z0 + o.D / 2;
      if (Math.abs(ox - cx) <= r && Math.abs(oz - cz) <= r) n++;
    }
    return n;
  }

  tryUpgrade() {
    const eligible = [];
    for (const b of this.buildings.values()) {
      if (b.kind !== 'zone' || b.level >= 3 || b.locked || b.building) continue;
      if (b.age < UPGRADE_AGE[b.level]) continue;
      eligible.push(b);
    }
    if (!eligible.length) return;
    const b = pick(this.rng, eligible);
    const chance = 0.25 + 0.2 * Math.min(3, this.nearbySpecials(b, 12));
    if (this.rng() > chance) return;
    this.upgradeBuilding(b);
  }

  upgradeBuilding(b) {
    this.clearBuildingBlocks(b);
    b.level++;
    b.age = 0;
    b.seed = (this.rng() * 4294967296) >>> 0;
    this.flattenLot(b);
    this.startConstruction(b);
    this.statsDirty = true;
  }

  // Lote marcado como editado à mão não é mais reconstruído automaticamente
  lockAt(x, z) {
    if (!this.inside(x, z)) return;
    const id = this.lot[this.idx(x, z)];
    if (id >= 0) {
      const b = this.buildings.get(id);
      if (b) b.locked = true;
    }
  }

  // ---------------------------------------------------------------- especiais

  specialFootprint(type, cx, cz, facing) {
    const s = SPECIALS[type];
    const W = facing % 2 === 0 ? s.w : s.d;
    const D = facing % 2 === 0 ? s.d : s.w;
    const x0 = cx - Math.floor(W / 2), z0 = cz - Math.floor(D / 2);
    let ok = true;
    for (let z = z0; z < z0 + D && ok; z++) {
      for (let x = x0; x < x0 + W; x++) {
        if (!this.inside(x, z) || this.road[this.idx(x, z)]) { ok = false; break; }
      }
    }
    return { x0, z0, W, D, ok };
  }

  placeSpecial(type, cx, cz, facing) {
    if (!this.inside(cx, cz)) return null;
    if (type === 'arvore') {
      if (this.road[this.idx(cx, cz)] || this.lot[this.idx(cx, cz)] >= 0) return null;
      const g = this.world.groundY(cx, cz);
      const top = this.world.get(cx, g, cz);
      if (top === B.WATER || g <= this.world.waterLevel - 1) return null;
      const kinds = ['carvalho', 'carvalho', 'betula', 'pinheiro'];
      this.world.placeTree(cx, g + 1, cz, pick(this.rng, kinds), this.rng);
      return true;
    }
    const fp = this.specialFootprint(type, cx, cz, facing);
    if (!fp.ok) return null;
    for (let z = fp.z0; z < fp.z0 + fp.D; z++) {
      for (let x = fp.x0; x < fp.x0 + fp.W; x++) {
        const ti = this.idx(x, z);
        if (this.lot[ti] >= 0) this.demolishBuilding(this.lot[ti]);
        this.zone[ti] = 0;
      }
    }
    const base = clamp(Math.max(this.world.groundY(cx, cz), this.world.waterLevel), 1, WORLD_H - 20);
    return this.createBuilding({ kind: 'special', type, ...fp, facing, base });
  }

  // ---------------------------------------------------------------- terreno

  terraform(cx, cz, r, mode, level) {
    const w = this.world;
    let changed = false;
    const rr = r * r + 0.6;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > rr) continue;
        const x = cx + dx, z = cz + dz;
        if (!this.inside(x, z)) continue;
        const ti = this.idx(x, z);
        if (this.road[ti] || this.lot[ti] >= 0) continue;
        const g = w.groundY(x, z);
        let target = mode === 'raise' ? g + 1 : mode === 'lower' ? g - 1 : level;
        target = clamp(target, 1, WORLD_H - 14);
        if (target === g) continue;
        this.clearPlants(x, z);
        this.setColumnHeight(x, z, g, target);
        changed = true;
      }
    }
    if (changed) this.overlayDirty = true;
    return changed;
  }

  setColumnHeight(x, z, g, target) {
    const w = this.world, WL = w.waterLevel;
    const old = w.get(x, g, z);
    const keep = [B.STONE, B.SNOW, B.SAND, B.GRAVEL, B.COBBLE, B.CONCRETE, B.DIRT];
    let surf = keep.includes(old) ? old : B.GRASS;
    if (target <= WL && surf === B.GRASS) surf = B.SAND;
    if (target > g) {
      for (let y = g; y < target; y++) w.set(x, y, z, y < target - 3 ? B.STONE : B.DIRT);
    } else {
      for (let y = g; y > target; y--) w.set(x, y, z, y <= WL ? B.WATER : B.AIR);
    }
    w.set(x, target, z, surf);
    for (let y = target + 1; y <= WL; y++) if (w.get(x, y, z) === B.AIR) w.set(x, y, z, B.WATER);
  }

  // ---------------------------------------------------------------- simulação

  update(dt) {
    if (dt <= 0) return;
    this.updateJobs(dt);
    for (const b of this.buildings.values()) if (!b.building) b.age += dt;
    this.simTimer += dt;
    while (this.simTimer >= SIM_TICK) {
      this.simTimer -= SIM_TICK;
      this.trySpawn();
      this.tryUpgrade();
    }
    if (this.statsDirty) this.computeStats();
  }

  computeStats() {
    this.statsDirty = false;
    let pop = 0, work = 0, count = 0;
    for (const b of this.buildings.values()) {
      if (b.building) continue;
      pop += b.pop;
      work += b.work;
      count++;
    }
    const before = this.stats.pop;
    this.stats = { pop, jobs: work, count };
    if (this.onMilestone) {
      for (const m of [50, 250, 1000, 3000, 8000]) {
        if (before < m && pop >= m) this.onMilestone(m);
      }
    }
  }

  title() {
    const p = this.stats.pop;
    if (p >= 3000) return 'Metrópole';
    if (p >= 1000) return 'Cidade Grande';
    if (p >= 250) return 'Cidade';
    if (p >= 50) return 'Vila';
    return 'Povoado';
  }

  // ---------------------------------------------------------------- camada de zonas

  createOverlay(scene) {
    this.overlay = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false })
    );
    this.overlay.renderOrder = 2;
    this.overlay.frustumCulled = false;
    scene.add(this.overlay);
    this.overlayDirty = true;
  }

  updateOverlay() {
    if (!this.overlay || !this.overlayDirty) return;
    this.overlayDirty = false;
    const w = this.world;
    const pos = [], col = [], idx = [];
    const color = new THREE.Color();
    for (let z = 0; z < w.sz; z++) {
      for (let x = 0; x < w.sx; x++) {
        const t = this.idx(x, z);
        const zn = this.zone[t];
        if (!zn || this.lot[t] >= 0 || this.road[t]) continue;
        const y = w.surfaceY(x, z) + 1.03;
        color.setHex(ZONE_INFO[zn].color);
        const v = pos.length / 3;
        const m = 0.06;
        pos.push(x + m, y, z + m, x + 1 - m, y, z + m, x + 1 - m, y, z + 1 - m, x + m, y, z + 1 - m);
        for (let k = 0; k < 4; k++) col.push(color.r, color.g, color.b);
        idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    this.overlay.geometry.dispose();
    this.overlay.geometry = g;
  }

  // ---------------------------------------------------------------- salvar

  serialize() {
    const list = [];
    for (const b of this.buildings.values()) {
      list.push([b.id, b.kind, b.zone, b.type, b.x0, b.z0, b.W, b.D, b.facing, b.base, b.level,
        b.seed, b.locked ? 1 : 0, Math.round(b.age), b.maxY, b.pop, b.work, b.smoke, b.building ? 1 : 0]);
    }
    return {
      zone: bytesToBase64(rleEncode(this.zone)),
      road: bytesToBase64(rleEncode(this.road)),
      roadH: bytesToBase64(rleEncode(this.roadH)),
      buildings: list,
      nextId: this.nextId,
    };
  }

  deserialize(o) {
    const n = this.world.sx * this.world.sz;
    this.zone = rleDecode(base64ToBytes(o.zone), n);
    this.road = rleDecode(base64ToBytes(o.road), n);
    this.roadH = rleDecode(base64ToBytes(o.roadH), n);
    this.lot.fill(-1);
    this.buildings.clear();
    this.jobs = [];
    const unfinished = [];
    for (const a of o.buildings) {
      const b = {
        id: a[0], kind: a[1], zone: a[2], type: a[3], x0: a[4], z0: a[5], W: a[6], D: a[7],
        facing: a[8], base: a[9], level: a[10], seed: a[11], locked: !!a[12], age: a[13],
        maxY: a[14], pop: a[15], work: a[16], smoke: a[17] || [], building: false,
      };
      this.buildings.set(b.id, b);
      for (let z = b.z0; z < b.z0 + b.D; z++) for (let x = b.x0; x < b.x0 + b.W; x++) this.lot[this.idx(x, z)] = b.id;
      if (a[18]) unfinished.push(b);
    }
    // obras que estavam em andamento recomeçam do zero
    for (const b of unfinished) {
      this.clearBuildingBlocks(b);
      this.flattenLot(b);
      this.startConstruction(b);
    }
    this.nextId = o.nextId;
    this.roadVersion++;
    this.overlayDirty = true;
    const cb = this.onMilestone;
    this.onMilestone = null;
    this.computeStats();
    this.onMilestone = cb;
  }
}
