// Blocópolis — jogo principal: cena 3D, ferramentas, modos, dia e noite

const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ||
  (('ontouchstart' in window) && navigator.maxTouchPoints > 0);

const WATER_LEVEL = 10;
const DAY_SECONDS = 480;
const AUTOSAVE_SECONDS = 60;
const WORLD_SIZES = { pequeno: 96, medio: 128, grande: 192 };

const TOOLS = [
  { id: 'navegar', icon: '✋', label: 'Mover' },
  { id: 'estrada', icon: '🛣️', label: 'Estrada' },
  { id: 'res', icon: '🏠', label: 'Casas', zone: 1 },
  { id: 'com', icon: '🏬', label: 'Comércio', zone: 2 },
  { id: 'ind', icon: '🏭', label: 'Indústria', zone: 3 },
  { id: 'especial', icon: '🌳', label: 'Especiais' },
  { id: 'blocos', icon: '🧱', label: 'Blocos' },
  { id: 'terreno', icon: '⛰️', label: 'Terreno' },
  { id: 'demolir', icon: '💥', label: 'Demolir' },
  { id: 'explorar', icon: '🚶', label: 'Explorar' },
];
const DRAG_TOOLS = ['estrada', 'res', 'com', 'ind', 'demolir', 'terreno'];

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.keys = new Set();
    this.mode = 'menu';
    this.tool = 'navegar';
    this.opts = { zoneErase: false, blockMode: 'place', terrainMode: 'raise', brush: 2, special: 'parque', facing: 0 };
    this.hotbar = [B.GRASS, B.PLANKS, B.BRICK, B.WALL_WHITE, B.WINDOW, B.GLASS, B.ROOF_RED, B.STONE, B.LAMP];
    this.slot = 0;
    this.speed = 1;
    this.dayMode = 'ciclo';
    this.time = 9.5;
    this.meta = { name: 'Blocópolis', seed: 0, terrain: 'planicie' };
    this.world = null;
    this.drag = null;
    this.pendingSpecial = null;
    this.fpHit = null;
    this.fpHold = null;
    this.saveTimer = 0;
    this.savedVersion = -1;
    this.shadowTimer = 0;
    this.statsTimer = 0;
    this.raycaster = new THREE.Raycaster();
    this.tmpV = new THREE.Vector3();

    this.initRenderer();
    this.atlas = new BlockAtlas();
    this.initMaterials();
    this.initScene();

    this.cityInput = new CityInput(this.canvas, null, this);
    this.cityInput.enabled = false;
    this.fp = new FirstPerson(this.camera, this.canvas, null);
    this.fp.onLockChange = (locked) => this.ui.setLocked(locked);

    this.ui = new UI(this);
    this.bindKeys();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autosave();
    });
    window.addEventListener('pagehide', () => this.autosave());

    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  get selectedBlock() {
    return this.hotbar[this.slot];
  }

  // ---------------------------------------------------------------- 3D

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    let q = null;
    try { q = localStorage.getItem('blocopolis.quality'); } catch (e) { /* sem armazenamento */ }
    this.quality = q || (IS_TOUCH ? 'baixa' : 'alta');
  }

  initMaterials() {
    const makeTex = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapLinearFilter;
      return t;
    };
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({
        map: makeTex(this.atlas.canvas), vertexColors: true,
        emissive: 0xffffff, emissiveMap: makeTex(this.atlas.glowCanvas), emissiveIntensity: 0,
      }),
      trans: new THREE.MeshLambertMaterial({ map: makeTex(this.atlas.canvas), vertexColors: true, transparent: true }),
      faceUV: this.atlas.faceUV,
    };
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ccbf2);
    this.scene.fog = new THREE.Fog(0x8ccbf2, 200, 600);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2500);

    this.hemi = new THREE.HemisphereLight(0xe4f1ff, 0x6b5a45, 0.6);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 0.9);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.oceanMat = new THREE.MeshLambertMaterial({ color: 0x3270bf });
    this.ocean = null;

    const tileGeo = new THREE.PlaneGeometry(0.94, 0.94);
    tileGeo.rotateX(-Math.PI / 2);
    this.preview = new THREE.InstancedMesh(tileGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }), 6000);
    this.preview.count = 0;
    this.preview.renderOrder = 3;
    this.preview.frustumCulled = false;
    this.preview.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.preview);

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
      new THREE.LineBasicMaterial({ color: 0x111111 })
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 4;
    this.scene.add(this.highlight);
  }

  applyQuality() {
    const high = this.quality === 'alta';
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, high ? 2 : 1.25));
    this.sun.castShadow = high;
    this.shadowTimer = 0;
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('blocopolis.quality', q); } catch (e) { /* ignora */ }
    this.applyQuality();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildOcean(world) {
    if (this.ocean) {
      this.ocean.geometry.dispose();
      this.scene.remove(this.ocean);
    }
    // mar em volta do mapa (sem cobrir os lagos de dentro)
    const R = 3000, sx = world.sx, sz = world.sz;
    const rects = [[-R, -R, sx + R, 0], [-R, sz, sx + R, sz + R], [-R, 0, 0, sz], [sx, 0, sx + R, sz]];
    const pos = [], idx = [];
    for (const [x0, z0, x1, z1] of rects) {
      const v = pos.length / 3;
      pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.ocean = new THREE.Mesh(g, this.oceanMat);
    this.ocean.position.y = world.waterLevel + 0.84;
    this.scene.add(this.ocean);
  }

  // ---------------------------------------------------------------- mundo

  newWorld(opts) {
    const size = WORLD_SIZES[opts.size] || 128;
    let seed = (Math.random() * 4294967296) >>> 0;
    if (opts.seed && opts.seed.trim()) {
      const s = opts.seed.trim();
      seed = /^\d+$/.test(s) ? Number(s) >>> 0 : hashString(s);
    }
    const world = new World(size, size, WATER_LEVEL);
    world.generate(seed, opts.terrain);
    this.meta = { name: opts.name || 'Blocópolis', seed, terrain: opts.terrain };
    this.time = 9.5;
    this.setupWorld(world);
    this.addStarterRoad();
    this.world.updateDirty(Infinity);
    this.savedVersion = -1;
    this.save(false);
  }

  addStarterRoad() {
    const w = this.world, c = this.city;
    const cx = Math.floor(w.sx / 2), cz = Math.floor(w.sz / 2);
    const len = Math.floor(w.sx * 0.18);
    let land = 0;
    for (let x = cx - len; x <= cx + len; x++) if (w.groundY(x, cz) >= w.waterLevel) land++;
    if (land < len * 1.6) return;
    c.placeRoad(c.planRoad(cx - len, cz, cx + len, cz));
  }

  loadFromData(data) {
    if (!data || data.v !== SAVE_VERSION || !data.voxels) throw new Error('Arquivo de cidade inválido');
    const [sx, sz] = data.size;
    const world = new World(sx, sz, data.waterLevel);
    world.data = rleDecode(base64ToBytes(data.voxels), sx * sz * WORLD_H);
    this.meta = { name: data.name, seed: data.seed, terrain: data.terrain };
    this.time = data.time || 9.5;
    this.dayMode = data.dayMode || 'ciclo';
    if (Array.isArray(data.hotbar) && data.hotbar.length === 9) this.hotbar = data.hotbar;
    this.setupWorld(world);
    this.city.deserialize(data.city);
    if (data.cam) {
      const cam = this.cityCam;
      cam.target.set(data.cam.x, cam.target.y, data.cam.z);
      cam.yaw = data.cam.yaw;
      cam.pitch = data.cam.pitch;
      cam.dist = data.cam.dist;
    }
    this.world.updateDirty(Infinity);
    this.savedVersion = this.world.version;
  }

  setupWorld(world) {
    this.teardown();
    this.world = world;
    world.createMeshes(this.scene, this.materials);
    this.city = new City(world);
    this.city.createOverlay(this.scene);
    this.city.onMilestone = (m) => this.ui.toast(`🎉 ${this.meta.name} chegou a ${m.toLocaleString('pt-BR')} moradores! Agora é: ${this.city.title()}`, 4500);
    this.traffic = new Traffic(this.city, this.scene, IS_TOUCH ? 40 : 90);
    this.smoke = new Smoke(this.scene);
    this.clouds = new Clouds(this.scene, world.sx);
    this.buildOcean(world);
    this.cityCam = new CityCamera(this.camera, world);
    this.cityInput.cam = this.cityCam;
    this.fp.world = world;

    const s = Math.max(world.sx, world.sz) * 0.78;
    const sc = this.sun.shadow.camera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    sc.near = 1; sc.far = 900;
    sc.updateProjectionMatrix();
    this.applyQuality();

    this.mode = 'city';
    this.camera.fov = 50;
    this.camera.near = 0.3;
    this.camera.updateProjectionMatrix();
    this.cityInput.enabled = true;
    this.cityInput.reset();
    this.setTool('navegar');
    this.ui.showCity();
    this.ui.updateStats();
  }

  teardown() {
    if (!this.world) return;
    this.world.dispose();
    this.scene.remove(this.city.overlay);
    this.city.overlay.geometry.dispose();
    this.scene.remove(this.traffic.mesh);
    this.scene.remove(this.smoke.points);
    this.clouds.dispose(this.scene);
    this.world = null;
  }

  serialize() {
    const city = this.city.serialize();
    const cam = this.cityCam;
    return {
      v: SAVE_VERSION,
      name: this.meta.name,
      seed: this.meta.seed,
      terrain: this.meta.terrain,
      size: [this.world.sx, this.world.sz],
      waterLevel: this.world.waterLevel,
      time: this.time,
      dayMode: this.dayMode,
      hotbar: this.hotbar,
      voxels: bytesToBase64(rleEncode(this.world.data)),
      city,
      cam: { x: cam.target.x, z: cam.target.z, yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist },
      savedAt: Date.now(),
    };
  }

  save(manual) {
    if (!this.world) return false;
    const ok = SaveStore.write(this.serialize());
    if (ok) this.savedVersion = this.world.version;
    if (manual) this.ui.toast(ok ? '💾 Cidade salva!' : '⚠️ Não foi possível salvar neste navegador');
    return ok;
  }

  autosave() {
    if (this.world && this.world.version !== this.savedVersion) this.save(false);
  }

  // ---------------------------------------------------------------- ferramentas

  setTool(id) {
    if (id === 'explorar') {
      this.enterExplore();
      return;
    }
    this.tool = id;
    this.drag = null;
    this.pendingSpecial = null;
    this.clearPreview();
    this.ui.renderTools();
  }

  toolWantsPointer(type) {
    if (this.mode !== 'city') return false;
    if (DRAG_TOOLS.includes(this.tool)) return true;
    return type === 'mouse' && (this.tool === 'blocos' || this.tool === 'especial');
  }

  pickAt(sx, sy, hitWater = true) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.raycaster.setFromCamera({ x: (sx / w) * 2 - 1, y: -(sy / h) * 2 + 1 }, this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    return this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 1500, hitWater);
  }

  toolDown(sx, sy) {
    const hit = this.pickAt(sx, sy, this.tool !== 'blocos');
    this.drag = { start: hit, cur: hit, lastApply: 0, lastTile: null };
    if (this.tool === 'terreno' && hit) {
      this.drag.level = this.world.groundY(hit.x, hit.z);
      this.applyTerrain(hit);
    }
    this.updateDragPreview();
  }

  toolMove(sx, sy) {
    if (!this.drag) return;
    const hit = this.pickAt(sx, sy, this.tool !== 'blocos');
    if (hit) {
      this.drag.cur = hit;
      if (!this.drag.start) {
        this.drag.start = hit;
        if (this.tool === 'terreno') this.drag.level = this.world.groundY(hit.x, hit.z);
      }
      if (this.tool === 'terreno') this.applyTerrain(hit);
    }
    this.updateDragPreview();
  }

  toolUp(sx, sy, isTap, type) {
    const d = this.drag;
    this.drag = null;
    this.clearPreview();
    if (this.tool === 'blocos') {
      if (isTap) this.blockActionAt(sx, sy, this.opts.blockMode);
      return;
    }
    if (this.tool === 'especial') {
      if (isTap || type === 'mouse') {
        const hit = this.pickAt(sx, sy, true);
        if (hit) this.placeSpecialAt(hit.x, hit.z);
      }
      return;
    }
    if (!d || !d.start) return;
    const a = d.start, b = d.cur || a;
    const city = this.city;
    switch (this.tool) {
      case 'estrada': {
        const plan = city.planRoad(a.x, a.z, b.x, b.z);
        city.placeRoad(plan);
        break;
      }
      case 'res': case 'com': case 'ind': {
        const zone = TOOLS.find((t) => t.id === this.tool).zone;
        city.paintZone(a.x, a.z, b.x, b.z, this.opts.zoneErase ? 0 : zone);
        break;
      }
      case 'demolir':
        city.demolishArea(a.x, a.z, b.x, b.z);
        break;
      default:
        break;
    }
    if (isTap && this.tool !== 'terreno' && this.tool !== 'estrada') {
      // toque simples numa ferramenta de arrastar: só uma dica
      if (IS_TOUCH) this.ui.hintPulse();
    }
  }

  toolCancel() {
    this.drag = null;
    this.clearPreview();
  }

  // Toque/clique sem arrastar (ferramentas de toque ou botão direito)
  tap(sx, sy, type, alt) {
    if (this.mode !== 'city') return;
    if (this.tool === 'blocos') {
      this.blockActionAt(sx, sy, alt ? 'break' : this.opts.blockMode);
    } else if (this.tool === 'especial') {
      if (alt) { this.rotateSpecial(); return; }
      const hit = this.pickAt(sx, sy, true);
      if (!hit) return;
      if (this.opts.special === 'arvore') { this.placeSpecialAt(hit.x, hit.z); return; }
      this.pendingSpecial = { x: hit.x, z: hit.z };
      this.showSpecialPreview(hit.x, hit.z);
      this.ui.renderTools();
    } else if (this.tool === 'navegar' && !alt) {
      this.inspectAt(sx, sy);
    }
  }

  hover(sx, sy) {
    if (this.mode !== 'city' || !this.world) return;
    const t = this.tool;
    if (t === 'navegar' || this.drag) return;
    const hit = this.pickAt(sx, sy, t !== 'blocos');
    if (!hit) { this.clearPreview(); return; }
    if (t === 'blocos') this.showBlockHighlight(hit, this.opts.blockMode);
    else if (t === 'especial') this.showSpecialPreview(hit.x, hit.z);
    else if (t === 'terreno') this.showTiles(this.brushTiles(hit.x, hit.z), this.terrainColor());
    else if (t === 'estrada') this.showTiles([[hit.x, hit.z]], 0x4a4f5a);
    else if (t === 'demolir') this.showTiles([[hit.x, hit.z]], 0xff4040);
    else {
      const zone = TOOLS.find((x) => x.id === t).zone;
      this.showTiles([[hit.x, hit.z]], this.opts.zoneErase ? 0xffffff : ZONE_INFO[zone].color);
    }
  }

  hoverEnd() {
    if (!this.drag && !this.pendingSpecial) this.clearPreview();
  }

  // ---------------------------------------------------------------- pré-visualização

  clearPreview() {
    this.preview.count = 0;
    this.highlight.visible = false;
  }

  showTiles(list, color, perTileY) {
    const m = this.preview, tmp = this.tmpObj || (this.tmpObj = new THREE.Object3D());
    const c = new THREE.Color(color);
    let n = 0;
    for (const t of list) {
      if (n >= 6000) break;
      const [x, z, y, col] = t;
      if (!this.city.inside(x, z)) continue;
      const yy = (perTileY && y !== undefined ? y : this.world.surfaceY(x, z)) + 1.05;
      tmp.position.set(x + 0.5, yy, z + 0.5);
      tmp.updateMatrix();
      m.setMatrixAt(n, tmp.matrix);
      m.setColorAt(n, col !== undefined ? this.tmpColor(col) : c);
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.highlight.visible = false;
  }

  tmpColor(hex) {
    this._tc = this._tc || new THREE.Color();
    return this._tc.setHex(hex);
  }

  rectTiles(a, b) {
    const out = [];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, z]);
    return out;
  }

  brushTiles(cx, cz) {
    const r = this.opts.brush, out = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r + 0.6) out.push([cx + dx, cz + dz]);
    return out;
  }

  terrainColor() {
    return { raise: 0xffffff, lower: 0x9a6a3a, flatten: 0xffe066 }[this.opts.terrainMode];
  }

  updateDragPreview() {
    const d = this.drag;
    if (!d || !d.start) { this.clearPreview(); return; }
    const a = d.start, b = d.cur || a;
    const t = this.tool;
    if (t === 'estrada') {
      const plan = this.city.planRoad(a.x, a.z, b.x, b.z);
      this.showTiles(plan.tiles.map((p) => [p.x, p.z, p.level, p.center ? 0xf0c030 : 0x4a4f5a]), 0x4a4f5a, true);
      this.ui.setHint(`Estrada: ${plan.length} blocos`);
    } else if (t === 'demolir') {
      this.showTiles(this.rectTiles(a, b), 0xff4040);
    } else if (t === 'terreno') {
      this.showTiles(this.brushTiles(b.x, b.z), this.terrainColor());
    } else if (t === 'res' || t === 'com' || t === 'ind') {
      const zone = TOOLS.find((x) => x.id === t).zone;
      const tiles = this.rectTiles(a, b).filter(([x, z]) => !this.city.isRoad(x, z));
      this.showTiles(tiles, this.opts.zoneErase ? 0xffffff : ZONE_INFO[zone].color);
      this.ui.setHint(`${Math.abs(a.x - b.x) + 1} × ${Math.abs(a.z - b.z) + 1}`);
    }
  }

  showBlockHighlight(hit, mode) {
    this.preview.count = 0;
    let x = hit.x, y = hit.y, z = hit.z;
    if (mode === 'place') { x += hit.nx; y += hit.ny; z += hit.nz; }
    this.highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.highlight.material.color.setHex(mode === 'break' ? 0xff2020 : mode === 'pick' ? 0x2080ff : 0xffffff);
    this.highlight.visible = true;
  }

  showSpecialPreview(x, z) {
    const type = this.opts.special;
    if (type === 'arvore') { this.showTiles([[x, z]], 0x66ff66); return; }
    const fp = this.city.specialFootprint(type, x, z, this.opts.facing);
    const tiles = [];
    for (let zz = fp.z0; zz < fp.z0 + fp.D; zz++) {
      for (let xx = fp.x0; xx < fp.x0 + fp.W; xx++) {
        // destaca a frente da construção
        const front = this.isFront(fp, xx, zz, this.opts.facing);
        tiles.push([xx, zz, undefined, fp.ok ? (front ? 0xffffff : 0x66ff66) : 0xff4040]);
      }
    }
    this.showTiles(tiles, 0x66ff66);
  }

  isFront(fp, x, z, facing) {
    if (facing === 0) return z === fp.z0;
    if (facing === 2) return z === fp.z0 + fp.D - 1;
    if (facing === 3) return x === fp.x0;
    return x === fp.x0 + fp.W - 1;
  }

  rotateSpecial() {
    this.opts.facing = (this.opts.facing + 1) % 4;
    if (this.pendingSpecial) this.showSpecialPreview(this.pendingSpecial.x, this.pendingSpecial.z);
  }

  confirmSpecial() {
    if (!this.pendingSpecial) return;
    this.placeSpecialAt(this.pendingSpecial.x, this.pendingSpecial.z);
    this.pendingSpecial = null;
    this.clearPreview();
    this.ui.renderTools();
  }

  cancelSpecial() {
    this.pendingSpecial = null;
    this.clearPreview();
    this.ui.renderTools();
  }

  placeSpecialAt(x, z) {
    const s = SPECIALS[this.opts.special];
    const r = this.city.placeSpecial(this.opts.special, x, z, this.opts.facing);
    if (!r) this.ui.toast('🚧 Não dá para construir aqui (tem estrada ou água no caminho)');
    else if (this.opts.special !== 'arvore') this.ui.toast(`${s.icon} ${s.name} em construção!`);
  }

  applyTerrain(hit) {
    const now = performance.now();
    const key = hit.x + ',' + hit.z;
    const flatten = this.opts.terrainMode === 'flatten';
    if (flatten ? key === this.drag.lastTile : now - this.drag.lastApply < 110) return;
    this.drag.lastApply = now;
    this.drag.lastTile = key;
    this.city.terraform(hit.x, hit.z, this.opts.brush, this.opts.terrainMode, this.drag.level);
  }

  // ---------------------------------------------------------------- blocos

  blockActionAt(sx, sy, mode) {
    const hit = this.pickAt(sx, sy, false);
    if (hit) this.blockAction(hit, mode);
  }

  blockAction(hit, mode) {
    if (mode === 'break') {
      this.playerSetBlock(hit.x, hit.y, hit.z, B.AIR);
    } else if (mode === 'pick') {
      this.pickBlock(hit.id);
    } else {
      const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
      const cur = this.world.get(x, y, z);
      if (cur !== B.AIR && cur !== B.WATER) return;
      if (this.mode === 'explore' && this.fp.intersectsBlock(x, y, z)) return;
      this.playerSetBlock(x, y, z, this.selectedBlock);
    }
  }

  pickBlock(id) {
    const map = { [B.WINDOW_DARK]: B.WINDOW, [B.OFFICE_DARK]: B.OFFICE, [B.ROAD_X]: B.ASPHALT, [B.ROAD_Z]: B.ASPHALT };
    id = map[id] || id;
    if (!BLOCK_DEFS[id] || !BLOCK_DEFS[id].palette) return;
    const existing = this.hotbar.indexOf(id);
    if (existing >= 0) this.slot = existing;
    else this.hotbar[this.slot] = id;
    this.ui.refreshHotbar();
    this.ui.renderTools();
    this.ui.toast(`Bloco: ${BLOCK_DEFS[id].name}`, 1200);
  }

  playerSetBlock(x, y, z, id) {
    const w = this.world;
    if (!w.inBounds(x, y, z)) return false;
    if (id === B.AIR) {
      if (y <= w.waterLevel) {
        const nb = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
        if (nb.some(([dx, dy, dz]) => w.get(x + dx, y + dy, z + dz) === B.WATER)) id = B.WATER;
      }
      const t = this.city.idx(x, z);
      if (this.city.road[t] && this.city.roadH[t] === y) this.city.removeRoadTile(x, z, false);
    }
    w.set(x, y, z, id);
    this.city.lockAt(x, z);
    this.city.overlayDirty = true;
    return true;
  }

  inspectAt(sx, sy) {
    const hit = this.pickAt(sx, sy, true);
    if (!hit) return;
    const c = this.city;
    const t = c.idx(hit.x, hit.z);
    let msg;
    if (c.lot[t] >= 0) {
      const b = c.buildings.get(c.lot[t]);
      if (b.kind === 'special') msg = `${SPECIALS[b.type].icon} ${SPECIALS[b.type].name}`;
      else {
        const info = ZONE_INFO[b.zone];
        const icon = TOOLS.find((x) => x.zone === b.zone).icon;
        const people = b.zone === 1 ? `${b.pop} moradores` : `${b.work} vagas de trabalho`;
        msg = `${icon} ${info.name} · nível ${b.level} · ${people}`;
      }
      if (b.building) msg += ' · 🏗️ em obras';
    } else if (c.road[t]) msg = '🛣️ Estrada';
    else if (c.zone[t]) msg = `${ZONE_INFO[c.zone[t]].name}: os prédios nascem encostados numa estrada`;
    else msg = BLOCK_DEFS[hit.id] ? BLOCK_DEFS[hit.id].name : '';
    if (msg) this.ui.toast(msg, 2200);
  }

  // ---------------------------------------------------------------- explorar

  enterExplore() {
    if (!this.world || this.mode === 'explore') return;
    this.mode = 'explore';
    this.drag = null;
    this.pendingSpecial = null;
    this.clearPreview();
    const t = this.cityCam.target;
    const x = clamp(Math.floor(t.x), 0, this.world.sx - 1), z = clamp(Math.floor(t.z), 0, this.world.sz - 1);
    const y = this.world.topY(x, z) + 1;
    this.fp.enter(x + 0.5, Math.max(y, this.world.waterLevel + 1), z + 0.5, this.cityCam.yaw);
    this.camera.fov = 72;
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
    this.cityInput.enabled = false;
    this.cityInput.reset();
    this.city.overlay.visible = false;
    this.ui.showExplore();
  }

  exitExplore() {
    if (this.mode !== 'explore') return;
    this.mode = 'city';
    this.fp.exit();
    this.fpHold = null;
    const cam = this.cityCam;
    cam.target.set(this.fp.pos.x, this.fp.pos.y, this.fp.pos.z);
    cam.yaw = this.fp.yaw;
    cam.dist = Math.min(cam.dist, 45);
    cam.clampTarget();
    this.camera.fov = 50;
    this.camera.near = 0.3;
    this.camera.updateProjectionMatrix();
    this.cityInput.enabled = true;
    this.city.overlay.visible = true;
    this.highlight.visible = false;
    this.ui.showCity();
  }

  updateFpTarget() {
    const cam = this.camera.position;
    const d = this.fp.forward(this.tmpV);
    this.fpHit = this.world.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, 7, false);
    if (this.fpHit) {
      this.highlight.position.set(this.fpHit.x + 0.5, this.fpHit.y + 0.5, this.fpHit.z + 0.5);
      this.highlight.material.color.setHex(0x111111);
      this.highlight.visible = true;
    } else this.highlight.visible = false;
  }

  fpAction(kind) {
    if (!this.fpHit) return;
    this.blockAction(this.fpHit, kind);
    this.updateFpTarget();
  }

  startFpHold(kind) {
    this.fpAction(kind);
    this.fpHold = { kind, timer: 0.3 };
  }

  stopFpHold() {
    this.fpHold = null;
  }

  // ---------------------------------------------------------------- teclado

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!this.world || this.mode === 'menu' || this.ui.modalOpen()) {
        if (e.code === 'Escape') this.ui.closeModals();
        return;
      }
      this.keys.add(e.code);
      if (this.mode === 'city') this.cityKey(e);
      else this.exploreKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousedown', (e) => {
      if (this.mode !== 'explore' || !this.fp.locked) return;
      if (e.button === 0) this.startFpHold('break');
      else if (e.button === 2) this.startFpHold('place');
      else if (e.button === 1) { e.preventDefault(); this.fpAction('pick'); }
    });
    document.addEventListener('mouseup', () => this.stopFpHold());
    document.addEventListener('contextmenu', (e) => { if (this.mode === 'explore') e.preventDefault(); });
    document.addEventListener('wheel', (e) => {
      if (this.mode !== 'explore' || !this.fp.locked) return;
      this.slot = (this.slot + (e.deltaY > 0 ? 1 : 8)) % 9;
      this.ui.refreshHotbar();
    }, { passive: true });
  }

  cityKey(e) {
    const digit = e.code.match(/^Digit(\d)$/);
    if (digit) {
      const i = digit[1] === '0' ? 9 : Number(digit[1]) - 1;
      if (TOOLS[i]) this.setTool(TOOLS[i].id);
      return;
    }
    if (e.code === 'Escape') this.setTool('navegar');
    else if (e.code === 'Space') { e.preventDefault(); this.ui.togglePause(); }
    else if (e.code === 'KeyR' && this.tool === 'especial') this.rotateSpecial();
  }

  exploreKey(e) {
    const digit = e.code.match(/^Digit([1-9])$/);
    if (digit) { this.slot = Number(digit[1]) - 1; this.ui.refreshHotbar(); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.fp.tapJump(); }
    else if (e.code === 'KeyF' && !e.repeat) this.ui.toast(this.fp.toggleFly() ? '🕊️ Voando' : '🚶 Andando', 900);
    else if (e.code === 'KeyE' && !e.repeat) this.ui.openPalette();
    else if ((e.code === 'KeyC' || e.code === 'Tab') && !e.repeat) { e.preventDefault(); this.exitExplore(); }
  }

  // ---------------------------------------------------------------- dia e noite

  updateEnvironment(dt, simDt, rebuilt) {
    if (this.dayMode === 'ciclo') {
      this.time = (this.time + simDt * 24 / DAY_SECONDS) % 24;
    } else {
      const target = this.dayMode === 'dia' ? 11 : 22.5;
      let diff = target - this.time;
      if (diff > 12) diff -= 24;
      if (diff < -12) diff += 24;
      this.time = (this.time + clamp(diff, -dt * 6, dt * 6) + 24) % 24;
    }
    const ang = (this.time - 6) / 24 * Math.PI * 2;
    const sunY = Math.sin(ang), sunX = Math.cos(ang);
    const day = smoothstep(-0.1, 0.25, sunY);
    const dusk = clamp(1 - Math.abs(sunY - 0.05) / 0.3, 0, 1);

    const sky = this.scene.background;
    sky.setRGB(lerp(0.04, 0.55, day), lerp(0.06, 0.79, day), lerp(0.16, 0.95, day));
    sky.lerp(this.tmpColor(0xf29a5a), dusk * 0.45);
    this.scene.fog.color.copy(sky);

    const isSun = sunY > -0.05;
    const lx = isSun ? sunX : -sunX, ly = Math.max(isSun ? sunY : -sunY, 0.25);
    const len = Math.hypot(lx, ly, 0.45);
    const cx = this.world.sx / 2, cz = this.world.sz / 2;
    this.sun.position.set(cx + lx / len * 400, ly / len * 400, cz + 0.45 / len * 400);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.intensity = isSun ? lerp(0.15, 0.95, day) : 0.2;
    this.sun.color.setHex(isSun ? 0xfff1d6 : 0x9fb6ff);
    if (isSun && dusk > 0) this.sun.color.lerp(this.tmpColor(0xffb070), dusk * 0.6);
    this.hemi.intensity = lerp(0.3, 0.62, day);
    this.hemi.color.setRGB(lerp(0.45, 0.89, day), lerp(0.52, 0.94, day), lerp(0.8, 1.0, day));
    this.materials.opaque.emissiveIntensity = clamp(1 - day * 1.15, 0, 1);
    this.oceanMat.color.setRGB(lerp(0.05, 0.2, day), lerp(0.1, 0.44, day), lerp(0.25, 0.75, day));

    if (this.mode === 'explore') {
      this.scene.fog.near = 40; this.scene.fog.far = 170;
    } else {
      const d = this.cityCam.dist;
      this.scene.fog.near = Math.max(120, d * 2.2);
      this.scene.fog.far = this.scene.fog.near + 350 + this.world.sx;
    }

    if (this.sun.castShadow) {
      this.shadowTimer -= dt;
      if (this.shadowTimer <= 0 || (rebuilt && this.shadowTimer < 0.15)) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowTimer = this.dayMode === 'ciclo' ? 0.4 : 1.5;
      }
    }
    this.isNight = day < 0.4;
  }

  clockText() {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60 / 10) * 10;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------- laço

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.world) return;
    const simDt = dt * this.speed;

    if (this.mode === 'city') {
      this.cityCam.update(dt, this.keys);
    } else if (this.mode === 'explore') {
      this.fp.update(dt, this.keys);
      this.updateFpTarget();
      if (this.fpHold) {
        this.fpHold.timer -= dt;
        if (this.fpHold.timer <= 0) { this.fpAction(this.fpHold.kind); this.fpHold.timer = 0.22; }
      }
    }

    this.city.update(simDt);
    this.city.updateOverlay();
    const focus = this.mode === 'explore' ? this.fp.pos : this.cityCam.target;
    const rebuilt = this.world.updateDirty(IS_TOUCH ? 2 : 4, focus.x, focus.z);
    this.traffic.update(dt, simDt);
    this.smoke.update(dt, simDt, this.city);
    this.clouds.update(dt, this.camera.position.y);
    this.updateEnvironment(dt, simDt, rebuilt);

    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = 0.5;
      this.ui.updateStats();
    }
    this.saveTimer += dt;
    if (this.saveTimer > AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.autosave();
    }
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('fatal');
    if (el) {
      el.classList.remove('hidden');
      el.querySelector('p').textContent = 'Seu navegador não conseguiu iniciar o 3D (WebGL). Tente atualizar o navegador ou usar outro aparelho. Detalhe: ' + err.message;
    }
  }
});
