// Blocópolis — vida na cidade: carros, fumaça das fábricas e nuvens

// Caixa com cor por vértice adicionada a listas de geometria
function pushBox(arr, x0, y0, z0, x1, y1, z1, color) {
  const { pos, nor, col, idx } = arr;
  const quads = [
    [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [n, vs] of quads) {
    const v = pos.length / 3;
    for (const p of vs) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      col.push(color[0], color[1], color[2]);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
}

function geometryFrom(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
  g.setIndex(arr.idx);
  return g;
}

const CAR_COLORS = [0xd83a3a, 0x2f6fd6, 0xf2f2f2, 0x262626, 0xb8bec6, 0xf2c230, 0x3aa65a, 0xf07a2a, 0x8a4fd0];

class Traffic {
  constructor(city, scene, maxCars) {
    this.city = city;
    this.maxCars = maxCars;
    this.cars = [];
    this.centers = [];
    this.roadVersion = -1;
    this.spawnTimer = 0;
    this.rng = makeRng(777);

    const arr = { pos: [], nor: [], col: [], idx: [] };
    // carrinho virado para +x, centrado na origem
    pushBox(arr, -0.7, 0.1, -0.34, 0.7, 0.45, 0.34, [1, 1, 1]);
    pushBox(arr, -0.35, 0.45, -0.3, 0.38, 0.75, 0.3, [0.22, 0.28, 0.36]);
    pushBox(arr, 0.66, 0.2, -0.28, 0.72, 0.3, -0.16, [1.0, 0.95, 0.7]);
    pushBox(arr, 0.66, 0.2, 0.16, 0.72, 0.3, 0.28, [1.0, 0.95, 0.7]);
    for (const wx of [-0.45, 0.45]) {
      for (const wz of [-0.36, 0.26]) pushBox(arr, wx - 0.16, 0, wz, wx + 0.16, 0.24, wz + 0.1, [0.08, 0.08, 0.08]);
    }
    const geo = geometryFrom(arr);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCars);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < maxCars; i++) {
      c.setHex(CAR_COLORS[i % CAR_COLORS.length]);
      this.mesh.setColorAt(i, c);
    }
    scene.add(this.mesh);
    this.tmp = new THREE.Object3D();
  }

  refreshCenters() {
    const city = this.city, sx = city.world.sx;
    this.centers = [];
    for (let i = 0; i < city.road.length; i++) {
      if (!(city.road[i] & R_CENTER)) continue;
      const x = i % sx, z = Math.floor(i / sx);
      if (this.neighbors(x, z).length) this.centers.push(i);
    }
    this.roadVersion = city.roadVersion;
  }

  neighbors(x, z) {
    const out = [];
    for (const [dx, dz] of DIRS) if (this.city.isCenter(x + dx, z + dz)) out.push([x + dx, z + dz]);
    return out;
  }

  spawn() {
    if (!this.centers.length) return;
    const sx = this.city.world.sx;
    const t = pick(this.rng, this.centers);
    const x = t % sx, z = Math.floor(t / sx);
    const nb = this.neighbors(x, z);
    if (!nb.length) return;
    const [nx, nz] = pick(this.rng, nb);
    const car = { ax: x, az: z, bx: nx, bz: nz, t: this.rng(), speed: 2.4 + this.rng() * 1.6, px: null, py: 0, pz: 0, yaw: 0 };
    this.cars.push(car);
  }

  chooseNext(car) {
    const nb = this.neighbors(car.bx, car.bz).filter(([x, z]) => !(x === car.ax && z === car.az));
    if (!nb.length) return [car.ax, car.az];
    const dx = car.bx - car.ax, dz = car.bz - car.az;
    const straight = nb.find(([x, z]) => x - car.bx === dx && z - car.bz === dz);
    if (straight && this.rng() < 0.6) return straight;
    return pick(this.rng, nb);
  }

  update(dt, simDt) {
    const city = this.city;
    if (this.roadVersion !== city.roadVersion) this.refreshCenters();
    const target = Math.min(this.maxCars, Math.floor(this.centers.length / 5), 2 + city.stats.count * 2);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      if (this.cars.length < target) this.spawn();
      else if (this.cars.length > target) this.cars.pop();
    }

    const tmp = this.tmp;
    let n = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (!city.isCenter(car.ax, car.az) || !city.isCenter(car.bx, car.bz)) {
        this.cars.splice(i--, 1);
        continue;
      }
      car.t += simDt * car.speed;
      while (car.t >= 1) {
        car.t -= 1;
        const [nx, nz] = this.chooseNext(car);
        car.ax = car.bx; car.az = car.bz;
        car.bx = nx; car.bz = nz;
      }
      const dx = car.bx - car.ax, dz = car.bz - car.az;
      // mão direita: desloca para a direita do sentido de movimento
      const ox = -dz * 0.72, oz = dx * 0.72;
      const ha = city.roadH[city.idx(car.ax, car.az)], hb = city.roadH[city.idx(car.bx, car.bz)];
      const tx = car.ax + 0.5 + dx * car.t + ox;
      const tz = car.az + 0.5 + dz * car.t + oz;
      const ty = lerp(ha, hb, car.t) + 1;
      const yaw = Math.atan2(-dz, dx);
      if (car.px === null) { car.px = tx; car.py = ty; car.pz = tz; car.yaw = yaw; }
      const k = Math.min(1, dt * 10);
      car.px += (tx - car.px) * k;
      car.py += (ty - car.py) * k;
      car.pz += (tz - car.pz) * k;
      let dy = yaw - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      car.yaw += dy * Math.min(1, dt * 8);
      tmp.position.set(car.px, car.py, car.pz);
      tmp.rotation.set(0, car.yaw, 0);
      tmp.updateMatrix();
      this.mesh.setMatrixAt(n++, tmp.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.cars = [];
    this.mesh.count = 0;
    this.roadVersion = -1;
  }
}

// Fumaça das chaminés
class Smoke {
  constructor(scene, max = 360) {
    this.max = max;
    this.parts = [];
    this.timer = 0;
    this.rng = makeRng(99);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 32, 32);
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({
      size: 2.2, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false,
      color: 0xd8d8d8, opacity: 0.55,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, simDt, city) {
    this.timer += simDt;
    if (this.timer > 0.35) {
      this.timer = 0;
      for (const b of city.buildings.values()) {
        if (b.building || !b.smoke.length) continue;
        for (const s of b.smoke) {
          if (this.parts.length >= this.max) break;
          this.parts.push({ x: s[0], y: s[1], z: s[2], life: 0, vx: 0.4 + this.rng() * 0.3, vz: (this.rng() - 0.5) * 0.3 });
        }
      }
    }
    let n = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.life += simDt;
      if (p.life > 5) { this.parts.splice(i--, 1); continue; }
      p.y += simDt * 1.4;
      p.x += simDt * p.vx;
      p.z += simDt * p.vz;
      this.positions[n * 3] = p.x;
      this.positions[n * 3 + 1] = p.y;
      this.positions[n * 3 + 2] = p.z;
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
  }

  clear() {
    this.parts = [];
    this.geo.setDrawRange(0, 0);
  }
}

// Nuvens quadradas que passeiam pelo céu
class Clouds {
  constructor(scene, size) {
    const rng = makeRng(4242);
    const noise = new Noise2D(rng);
    const arr = { pos: [], nor: [], col: [], idx: [] };
    const cell = 6;
    this.span = Math.max(size * 2.5, 300);
    const cells = Math.ceil(this.span / cell);
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        if (noise.fbm(i / 7, j / 7, 2) < 0.28) continue;
        const x = i * cell, z = j * cell;
        pushBox(arr, x, 0, z, x + cell, 2.5, z + cell, [1, 1, 1]);
      }
    }
    const geo = geometryFrom(arr);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, vertexColors: true, emissive: 0x444444 });
    this.group = new THREE.Group();
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(geo, this.mat);
      m.position.x = k * this.span;
      this.group.add(m);
    }
    this.offsetZ = size / 2 - this.span / 2;
    this.group.position.set(-this.span / 2, 84, this.offsetZ);
    this.drift = 0;
    this.size = size;
    scene.add(this.group);
  }

  update(dt, cameraY) {
    this.drift = (this.drift + dt * 1.2) % this.span;
    this.group.position.x = this.size / 2 - this.span + this.drift - this.span / 2;
    const fade = clamp((150 - cameraY) / 60, 0, 1);
    this.mat.opacity = 0.82 * fade;
    this.group.visible = fade > 0.02;
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}
