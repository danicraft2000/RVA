// Blocópolis — mundo de blocos: dados, malhas por pedaço (chunk), raio e terreno

const CHUNK = 16;
const WORLD_H = 64;

// Faces: +x, -x, +y, -y, +z, -z. Cantos em ordem: baixo-esq, baixo-dir, cima-dir, cima-esq
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.86 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.86 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.93 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.93 },
];

// Para a oclusão ambiente: vizinhos (lado1, lado2, canto) de cada vértice de cada face
for (const f of FACES) {
  const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2;
  const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
  f.ao = f.c.map((corner) => {
    const s1 = [...f.n], s2 = [...f.n], cc = [...f.n];
    s1[a1] += corner[a1] ? 1 : -1;
    s2[a2] += corner[a2] ? 1 : -1;
    cc[a1] += corner[a1] ? 1 : -1;
    cc[a2] += corner[a2] ? 1 : -1;
    return [s1, s2, cc];
  });
}
const AO_CURVE = [0.5, 0.68, 0.84, 1.0];

// Acumulador de geometria reaproveitável
class GeoBuilder {
  constructor() {
    this.cap = 8192;
    this.alloc();
  }
  alloc() {
    const old = this.pos ? { pos: this.pos, nor: this.nor, uv: this.uv, col: this.col, idx: this.idx } : null;
    this.pos = new Float32Array(this.cap * 3);
    this.nor = new Float32Array(this.cap * 3);
    this.uv = new Float32Array(this.cap * 2);
    this.col = new Float32Array(this.cap * 3);
    this.idx = new Uint32Array(this.cap * 1.5);
    if (old) {
      this.pos.set(old.pos); this.nor.set(old.nor); this.uv.set(old.uv);
      this.col.set(old.col); this.idx.set(old.idx);
    }
  }
  reset() { this.vc = 0; this.ic = 0; }
  ensure(n) {
    if (this.vc + n > this.cap) {
      while (this.vc + n > this.cap) this.cap *= 2;
      this.alloc();
    }
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.vc * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, this.vc * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.vc * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.vc * 3), 3));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ic), 1));
    g.computeBoundingSphere();
    return g;
  }
}

class World {
  constructor(sizeX, sizeZ, waterLevel) {
    this.sx = sizeX;
    this.sz = sizeZ;
    this.sy = WORLD_H;
    this.waterLevel = waterLevel;
    this.data = new Uint8Array(sizeX * sizeZ * WORLD_H);
    this.ncx = Math.ceil(sizeX / CHUNK);
    this.ncz = Math.ceil(sizeZ / CHUNK);
    this.dirty = new Set();
    this.chunks = [];
    this.group = null;
    this.builder = new GeoBuilder();
    this.version = 0;
  }

  index(x, y, z) {
    return (z * this.sx + x) * WORLD_H + y;
  }

  inBounds(x, y, z) {
    return x >= 0 && z >= 0 && y >= 0 && x < this.sx && z < this.sz && y < WORLD_H;
  }

  get(x, y, z) {
    if (y < 0) return B.STONE;
    if (y >= WORLD_H) return B.AIR;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return y <= this.waterLevel ? B.WATER : B.AIR;
    return this.data[(z * this.sx + x) * WORLD_H + y];
  }

  set(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return false;
    const i = (z * this.sx + x) * WORLD_H + y;
    if (this.data[i] === id) return false;
    this.data[i] = id;
    this.markDirty(x, z);
    return true;
  }

  markDirty(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.dirty.add(cz * this.ncx + cx);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0 && cx > 0) this.dirty.add(cz * this.ncx + cx - 1);
    if (lx === CHUNK - 1 && cx < this.ncx - 1) this.dirty.add(cz * this.ncx + cx + 1);
    if (lz === 0 && cz > 0) this.dirty.add((cz - 1) * this.ncx + cx);
    if (lz === CHUNK - 1 && cz < this.ncz - 1) this.dirty.add((cz + 1) * this.ncx + cx);
    this.version++;
  }

  markAllDirty() {
    for (let i = 0; i < this.ncx * this.ncz; i++) this.dirty.add(i);
    this.version++;
  }

  // Bloco não-ar mais alto da coluna (-1 se vazia)
  topY(x, z) {
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return -1;
    const base = (z * this.sx + x) * WORLD_H;
    for (let y = WORLD_H - 1; y >= 0; y--) if (this.data[base + y]) return y;
    return -1;
  }

  // Bloco sólido mais alto (ignora água; com skipPlants ignora árvores)
  groundY(x, z, skipPlants = true) {
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return this.waterLevel;
    const base = (z * this.sx + x) * WORLD_H;
    for (let y = WORLD_H - 1; y >= 0; y--) {
      const id = this.data[base + y];
      if (!id || id === B.WATER) continue;
      if (skipPlants && BLOCK_PLANT[id]) continue;
      return y;
    }
    return 0;
  }

  // Altura da superfície visível (inclui água), usada pelas visualizações
  surfaceY(x, z) {
    return Math.max(this.groundY(x, z, true), this.waterTopAt(x, z));
  }

  waterTopAt(x, z) {
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return -1;
    const base = (z * this.sx + x) * WORLD_H;
    for (let y = WORLD_H - 1; y >= 0; y--) {
      const id = this.data[base + y];
      if (id === B.WATER) return y;
      if (id && !BLOCK_PLANT[id]) return -1;
    }
    return -1;
  }

  // ---------------------------------------------------------------- malhas

  createMeshes(scene, materials) {
    this.materials = materials;
    this.group = new THREE.Group();
    scene.add(this.group);
    for (let cz = 0; cz < this.ncz; cz++) {
      for (let cx = 0; cx < this.ncx; cx++) {
        const chunk = { cx, cz, opaque: null, trans: null };
        this.chunks.push(chunk);
      }
    }
    this.markAllDirty();
  }

  dispose() {
    if (!this.group) return;
    for (const c of this.chunks) {
      if (c.opaque) c.opaque.geometry.dispose();
      if (c.trans) c.trans.geometry.dispose();
    }
    this.group.parent && this.group.parent.remove(this.group);
    this.group = null;
    this.chunks = [];
  }

  // Reconstrói até "budget" pedaços sujos; devolve quantos foram feitos
  updateDirty(budget, focusX, focusZ) {
    if (!this.dirty.size) return 0;
    let list = [...this.dirty];
    if (list.length > budget && focusX !== undefined) {
      list.sort((a, b) => {
        const ax = (a % this.ncx) * CHUNK + 8 - focusX, az = Math.floor(a / this.ncx) * CHUNK + 8 - focusZ;
        const bx = (b % this.ncx) * CHUNK + 8 - focusX, bz = Math.floor(b / this.ncx) * CHUNK + 8 - focusZ;
        return ax * ax + az * az - (bx * bx + bz * bz);
      });
    }
    let done = 0;
    for (const ci of list) {
      if (done >= budget) break;
      this.dirty.delete(ci);
      this.rebuildChunk(this.chunks[ci]);
      done++;
    }
    return done;
  }

  rebuildChunk(chunk) {
    const { opaque, trans } = this.meshChunk(chunk.cx, chunk.cz);
    chunk.opaque = this.swapMesh(chunk.opaque, opaque, this.materials.opaque, chunk, false);
    chunk.trans = this.swapMesh(chunk.trans, trans, this.materials.trans, chunk, true);
  }

  swapMesh(mesh, geo, mat, chunk, transparent) {
    if (!geo) {
      if (mesh) {
        mesh.geometry.dispose();
        this.group.remove(mesh);
      }
      return null;
    }
    if (!mesh) {
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(chunk.cx * CHUNK, 0, chunk.cz * CHUNK);
      mesh.castShadow = !transparent;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (transparent) mesh.renderOrder = 1;
      this.group.add(mesh);
    } else {
      mesh.geometry.dispose();
      mesh.geometry = geo;
    }
    return mesh;
  }

  // Gera as malhas opaca e transparente de um pedaço numa única passada
  meshChunk(cx, cz) {
    const go = this.builder, gt = this.transBuilder || (this.transBuilder = new GeoBuilder());
    go.reset();
    gt.reset();
    const data = this.data;
    const sx = this.sx;
    const uvs = this.materials.faceUV;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const x1 = Math.min(x0 + CHUNK, this.sx), z1 = Math.min(z0 + CHUNK, this.sz);
    const strideZ = sx * WORLD_H;

    let maxY = 0;
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const base = (z * sx + x) * WORLD_H;
        for (let y = WORLD_H - 1; y > maxY; y--) if (data[base + y]) { maxY = y; break; }
      }
    }

    const occ = (x, y, z) => BLOCK_OPAQUE[this.get(x, y, z)];

    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const base = (z * sx + x) * WORLD_H;
        const edge = x === 0 || z === 0 || x === sx - 1 || z === this.sz - 1;
        for (let y = 0; y <= maxY; y++) {
          const id = data[base + y];
          if (!id) continue;
          const isTrans = BLOCK_TRANSPARENT[id] === 1;
          const i = base + y;

          for (let f = 0; f < 6; f++) {
            let nid;
            if (!edge || f === 2 || f === 3) {
              if (f === 0) nid = data[i + WORLD_H];
              else if (f === 1) nid = data[i - WORLD_H];
              else if (f === 2) nid = y + 1 < WORLD_H ? data[i + 1] : 0;
              else if (f === 3) nid = y > 0 ? data[i - 1] : B.STONE;
              else if (f === 4) nid = data[i + strideZ];
              else nid = data[i - strideZ];
            } else {
              const n = FACES[f].n;
              nid = this.get(x + n[0], y + n[1], z + n[2]);
            }
            if (nid) {
              if (BLOCK_OPAQUE[nid]) continue;
              if (nid === id) continue;
            }
            this.emitFace(isTrans ? gt : go, f, id, x - x0, y, z - z0, x, z, uvs, occ, isTrans);
          }
        }
      }
    }
    return {
      opaque: go.vc ? go.toGeometry() : null,
      trans: gt.vc ? gt.toGeometry() : null,
    };
  }

  emitFace(g, f, id, lx, y, lz, wx, wz, uvs, occ, isTrans) {
    g.ensure(4);
    const face = FACES[f];
    const vc = g.vc;
    const ao = [3, 3, 3, 3];
    if (!isTrans) {
      for (let k = 0; k < 4; k++) {
        const a = face.ao[k];
        const s1 = occ(wx + a[0][0], y + a[0][1], wz + a[0][2]);
        const s2 = occ(wx + a[1][0], y + a[1][1], wz + a[1][2]);
        const c = occ(wx + a[2][0], y + a[2][1], wz + a[2][2]);
        ao[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
      }
    }
    // Água: superfície um pouco abaixo quando não há água em cima
    let topH = 1;
    if (id === B.WATER && this.get(wx, y + 1, wz) !== B.WATER) topH = 0.86;

    const uo = (id * 6 + f) * 4;
    const u0 = uvs[uo], v0 = uvs[uo + 1], u1 = uvs[uo + 2], v1 = uvs[uo + 3];
    const quadUV = [u0, v0, u1, v0, u1, v1, u0, v1];
    for (let k = 0; k < 4; k++) {
      const c = face.c[k];
      const p = (vc + k) * 3;
      g.pos[p] = lx + c[0];
      g.pos[p + 1] = y + (c[1] ? topH : 0);
      g.pos[p + 2] = lz + c[2];
      g.nor[p] = face.n[0];
      g.nor[p + 1] = face.n[1];
      g.nor[p + 2] = face.n[2];
      const b = AO_CURVE[ao[k]] * face.shade;
      g.col[p] = b; g.col[p + 1] = b; g.col[p + 2] = b;
      g.uv[(vc + k) * 2] = quadUV[k * 2];
      g.uv[(vc + k) * 2 + 1] = quadUV[k * 2 + 1];
    }
    const ic = g.ic;
    if (ao[0] + ao[2] < ao[1] + ao[3]) {
      g.idx[ic] = vc + 1; g.idx[ic + 1] = vc + 2; g.idx[ic + 2] = vc + 3;
      g.idx[ic + 3] = vc + 1; g.idx[ic + 4] = vc + 3; g.idx[ic + 5] = vc;
    } else {
      g.idx[ic] = vc; g.idx[ic + 1] = vc + 1; g.idx[ic + 2] = vc + 2;
      g.idx[ic + 3] = vc; g.idx[ic + 4] = vc + 2; g.idx[ic + 5] = vc + 3;
    }
    g.vc += 4;
    g.ic += 6;
  }

  // ---------------------------------------------------------------- raio (DDA)

  raycast(ox, oy, oz, dx, dy, dz, maxDist, hitWater) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let tmy = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let guard = 0; guard < 2048 && t <= maxDist; guard++) {
      if (this.inBounds(x, y, z)) {
        const id = this.data[(z * this.sx + x) * WORLD_H + y];
        if (id && (hitWater || id !== B.WATER)) return { x, y, z, nx, ny, nz, id, t };
      } else if (y < 0 && dy <= 0) {
        return null;
      }
      if (tmx < tmy && tmx < tmz) { x += stepX; t = tmx; tmx += tdx; nx = -stepX; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += stepY; t = tmy; tmy += tdy; nx = 0; ny = -stepY; nz = 0; }
      else { z += stepZ; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -stepZ; }
    }
    return null;
  }

  // ---------------------------------------------------------------- terreno

  generate(seed, type) {
    const rng = makeRng(seed);
    const n1 = new Noise2D(rng), n2 = new Noise2D(rng), n3 = new Noise2D(rng), n4 = new Noise2D(rng);
    const WL = this.waterLevel;
    const sx = this.sx, sz = this.sz;
    const heights = new Int16Array(sx * sz);
    const cx = sx / 2, cz = sz / 2, radius = Math.min(sx, sz) / 2;

    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const e = n1.fbm(x / 70, z / 70, 4);
        const d = n2.fbm(x / 24, z / 24, 2);
        let h;
        if (type === 'plano') {
          h = WL + 2;
        } else if (type === 'colinas') {
          const m = n3.fbm(x / 80, z / 80, 3);
          h = WL + 4 + e * 6 + Math.max(0, m) * 30 + d * 1.2;
        } else if (type === 'ilhas') {
          const r = Math.hypot(x - cx, z - cz) / radius;
          const fall = 1 - smoothstep(0.45, 1.0, r);
          h = WL - 7 + fall * 10 + e * 9 + Math.max(0, n3.fbm(x / 40, z / 40, 2)) * 8 * fall + d;
        } else {
          h = WL + 3 + e * 3.2 + d * 0.6;
        }
        if (type === 'planicie' || type === 'colinas') {
          const r = Math.abs(n4.noise(x / 110 + 31.7, z / 110 - 12.3));
          h = lerp(WL - 2.5, h, smoothstep(0.025, 0.085, r));
        }
        heights[z * sx + x] = clamp(Math.round(h), 2, WORLD_H - 12);
      }
    }

    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const h = heights[z * sx + x];
        const base = (z * sx + x) * WORLD_H;
        let top;
        if (h <= WL + 1 && type !== 'plano') top = h < WL - 2 && n2.noise(x / 9, z / 9) > 0.3 ? B.GRAVEL : B.SAND;
        else if (h >= 36) top = B.SNOW;
        else if (h >= 29 && n3.noise(x / 6, z / 6) > -0.3) top = B.STONE;
        else top = B.GRASS;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === h) id = top;
          else if (y >= h - 3) id = top === B.SAND || top === B.GRAVEL ? B.SAND : top === B.STONE || top === B.SNOW ? B.STONE : B.DIRT;
          else id = B.STONE;
          this.data[base + y] = id;
        }
        for (let y = h + 1; y <= WL; y++) this.data[base + y] = B.WATER;
      }
    }

    // Árvores e flores
    if (type !== 'plano') {
      const treeRng = makeRng(seed ^ 0x9e3779b9);
      for (let z = 2; z < sz - 2; z++) {
        for (let x = 2; x < sx - 2; x++) {
          const h = heights[z * sx + x];
          const top = this.data[(z * sx + x) * WORLD_H + h];
          if (top !== B.GRASS) continue;
          const forest = n2.noise(x / 38 + 100, z / 38);
          const chance = forest > 0.3 ? 0.05 : 0.005;
          if (treeRng() < chance && !this.hasTreeNear(x, h + 1, z, 2)) {
            const kind = h > 22 ? 'pinheiro' : (treeRng() < 0.25 ? 'betula' : 'carvalho');
            this.placeTree(x, h + 1, z, kind, treeRng);
          } else if (treeRng() < (forest < -0.3 ? 0.06 : 0.012)) {
            this.data[(z * sx + x) * WORLD_H + h] = B.FLOWERS;
          }
        }
      }
    }
    this.markAllDirty();
  }

  hasTreeNear(x, y, z, r) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const id = this.get(x + dx, y + dy, z + dz);
          if (id === B.LOG || id === B.BIRCH_LOG) return true;
        }
      }
    }
    return false;
  }

  placeTree(x, y, z, kind, rng) {
    for (const [dx, dy, dz, id] of treeShape(kind, rng)) {
      const wx = x + dx, wy = y + dy, wz = z + dz;
      const cur = this.get(wx, wy, wz);
      if (cur === B.AIR || (BLOCK_PLANT[cur] && (id === B.LOG || id === B.BIRCH_LOG))) {
        this.set(wx, wy, wz, id);
      }
    }
  }
}
