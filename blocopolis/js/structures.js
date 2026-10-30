// Blocópolis — geradores procedurais de árvores, casas, prédios e construções especiais

// Formato de árvore: lista de [dx, dy, dz, bloco] a partir da base do tronco
function treeShape(kind, rng, small = false) {
  const out = [];
  if (kind === 'pinheiro') {
    const h = small ? 4 : randInt(rng, 6, 8);
    for (let y = 0; y < h; y++) out.push([0, y, 0, B.LOG]);
    let r = small ? 1 : 2;
    for (let y = 2; y <= h; y++) {
      const rr = y === h ? 0 : r;
      for (let dz = -rr; dz <= rr; dz++) {
        for (let dx = -rr; dx <= rr; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rr + (rr > 1 ? 0 : 1)) continue;
          if (dx === 0 && dz === 0 && y < h) continue;
          out.push([dx, y, dz, B.PINE_LEAVES]);
        }
      }
      if (y % 2 === 1 && r > 1) r--;
      else if (y % 2 === 0 && !small && y < h - 2) r = 2;
    }
    out.push([0, h, 0, B.PINE_LEAVES]);
    out.push([0, h + 1, 0, B.PINE_LEAVES]);
    return out;
  }
  const log = kind === 'betula' ? B.BIRCH_LOG : B.LOG;
  const h = small ? 3 : randInt(rng, 4, kind === 'betula' ? 6 : 5);
  for (let y = 0; y < h; y++) out.push([0, y, 0, log]);
  const r = small ? 1 : 2;
  for (let y = h - 2; y <= h + 1; y++) {
    const rr = y >= h ? 1 : r;
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx === 0 && dz === 0 && y < h) continue;
        const corner = Math.abs(dx) === rr && Math.abs(dz) === rr;
        if (corner && (y === h + 1 || rng() < 0.6)) continue;
        out.push([dx, y, dz, B.LEAVES]);
      }
    }
  }
  return out;
}

// Planta de construção em coordenadas locais (u = largura, v = profundidade, y = altura)
// v = 0 é a frente (lado da rua). y = -1 é o chão do lote.
class Blueprint {
  constructor(w, d) {
    this.w = w;
    this.d = d;
    this.map = new Map();
    this.smoke = [];
  }
  key(u, y, v) {
    return ((y + 2) * 256 + v) * 256 + u;
  }
  set(u, y, v, id) {
    if (u < 0 || v < 0 || u >= this.w || v >= this.d || y < -1) return;
    if (id) this.map.set(this.key(u, y, v), id);
    else this.map.delete(this.key(u, y, v));
  }
  get(u, y, v) {
    return this.map.get(this.key(u, y, v)) || 0;
  }
  box(u0, y0, v0, u1, y1, v1, id) {
    for (let y = y0; y <= y1; y++)
      for (let v = v0; v <= v1; v++)
        for (let u = u0; u <= u1; u++) this.set(u, y, v, id);
  }
  walls(u0, y0, v0, u1, y1, v1, id) {
    for (let y = y0; y <= y1; y++) {
      for (let u = u0; u <= u1; u++) { this.set(u, y, v0, id); this.set(u, y, v1, id); }
      for (let v = v0; v <= v1; v++) { this.set(u0, y, v, id); this.set(u1, y, v, id); }
    }
  }
  // Percorre o perímetro de um retângulo chamando fn(u, v, lado)
  perimeter(u0, v0, u1, v1, fn) {
    for (let u = u0; u <= u1; u++) { fn(u, v0, 'frente'); if (v1 !== v0) fn(u, v1, 'fundo'); }
    for (let v = v0 + 1; v < v1; v++) { fn(u0, v, 'esq'); if (u1 !== u0) fn(u1, v, 'dir'); }
  }
  tree(u, y, v, kind, rng, small = true) {
    for (const [dx, dy, dz, id] of treeShape(kind, rng, small)) {
      if (this.get(u + dx, y + dy, v + dz) && id !== B.LOG) continue;
      this.set(u + dx, y + dy, v + dz, id);
    }
  }
  lampPost(u, y, v, h = 2) {
    for (let k = 0; k < h; k++) this.set(u, y + k, v, B.METAL);
    this.set(u, y + h, v, B.LAMP);
  }
  list() {
    const out = [];
    for (const [k, id] of this.map) {
      const u = k % 256, v = Math.floor(k / 256) % 256, y = Math.floor(k / 65536) - 2;
      out.push([u, y, v, id]);
    }
    return out;
  }
}

const WALL_COLORS = [B.WALL_WHITE, B.WALL_YELLOW, B.WALL_BLUE, B.WALL_PINK, B.WALL_GREEN, B.WALL_ORANGE];
const winBlock = (rng, lit = 0.55) => (rng() < lit ? B.WINDOW : B.WINDOW_DARK);
const officeBlock = (rng, lit = 0.6) => (rng() < lit ? B.OFFICE : B.OFFICE_DARK);

// Janelas em uma faixa horizontal nas 4 fachadas
function windowBand(bp, u0, v0, u1, v1, y, rng, every = 2, block = null, lit = 0.55) {
  bp.perimeter(u0, v0, u1, v1, (u, v, side) => {
    const along = side === 'frente' || side === 'fundo' ? u - u0 : v - v0;
    const len = side === 'frente' || side === 'fundo' ? u1 - u0 : v1 - v0;
    if (along === 0 || along === len) return;
    if (every > 1 && along % every !== 1 % every) return;
    bp.set(u, y, v, block ? block(rng, lit) : winBlock(rng, lit));
  });
}

function door(bp, u, v) {
  bp.set(u, 0, v, B.DOOR_LOW);
  bp.set(u, 1, v, B.DOOR_HIGH);
}

function flatRoof(bp, u0, v0, u1, v1, y, parapet, rng) {
  bp.box(u0, y, v0, u1, y, v1, B.CONCRETE);
  if (parapet) bp.perimeter(u0, v0, u1, v1, (u, v) => bp.set(u, y + 1, v, parapet));
  if (rng && u1 - u0 >= 2 && v1 - v0 >= 2 && rng() < 0.75) {
    // a famosa caixa d'água azul em cima dos prédios
    bp.set(randInt(rng, u0 + 1, u1 - 1), y + 1, randInt(rng, v0 + 1, v1 - 1), B.TANK);
  }
}

// ---------------------------------------------------------------- residencial

function buildHouse(w, d, rng) {
  const bp = new Blueprint(w, d);
  const wall = pick(rng, [...WALL_COLORS, B.BRICK, B.PLANKS]);
  const roofId = rng() < 0.7 ? B.ROOF_RED : B.ROOF_GRAY;
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.GRASS);
  const v0 = d >= 4 ? 1 : 0, v1 = d - 1, u0 = 0, u1 = w - 1;
  bp.box(u0, -1, v0, u1, -1, v1, B.PLANKS);
  bp.walls(u0, 0, v0, u1, 2, v1, wall);
  if (rng() < 0.5) {
    const pillar = wall === B.PLANKS ? B.LOG : B.WALL_WHITE;
    for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) for (let y = 0; y <= 2; y++) bp.set(u, y, v, pillar);
  }
  const du = Math.floor((u0 + u1) / 2);
  door(bp, du, v0);
  for (let u = u0 + 1; u < u1; u++) if (u !== du) bp.set(u, 1, v0, winBlock(rng));
  for (let u = u0 + 1; u < u1; u++) bp.set(u, 1, v1, winBlock(rng));
  for (let v = v0 + 1; v < v1; v++) { bp.set(u0, 1, v, winBlock(rng)); bp.set(u1, 1, v, winBlock(rng)); }

  // Telhado de duas águas em degraus
  const bw = u1 - u0 + 1, bd = v1 - v0 + 1;
  const alongU = bw >= bd;
  const span = alongU ? bd : bw;
  let top = 3;
  for (let k = 0; k * 2 < span; k++) {
    const y = 3 + k;
    top = y;
    for (let u = u0; u <= u1; u++) {
      for (let v = v0; v <= v1; v++) {
        const a = alongU ? v - v0 : u - u0;
        const end = alongU ? (u === u0 || u === u1) : (v === v0 || v === v1);
        if (a < k || a > span - 1 - k) continue;
        if (a === k || a === span - 1 - k) bp.set(u, y, v, roofId);
        else if (end) bp.set(u, y, v, wall);
        else if (k === 0) bp.set(u, y, v, B.PLANKS);
      }
    }
  }
  if (rng() < 0.45) {
    const cu = alongU ? u1 - 1 : u0 + 1, cv = alongU ? v1 - 1 : v1 - 1;
    for (let y = 3; y <= top + 1; y++) bp.set(cu, y, cv, B.BRICK);
  }
  // Jardim da frente
  if (v0 === 1) {
    for (let u = 0; u < w; u++) {
      if (u === du) bp.set(u, -1, 0, B.GRAVEL);
      else if (rng() < 0.35) bp.set(u, -1, 0, B.FLOWERS);
      else if (rng() < 0.3) bp.set(u, 0, 0, B.HEDGE);
    }
  }
  return bp;
}

function buildTownhouse(w, d, rng) {
  const bp = new Blueprint(w, d);
  const wall = pick(rng, [...WALL_COLORS, B.BRICK, B.BRICK]);
  const trim = pick(rng, [B.WALL_WHITE, B.CONCRETE, B.WALL_DARK]);
  const v0 = d >= 4 ? 1 : 0;
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.SIDEWALK);
  const floors = randInt(rng, 2, 4);
  const H = floors * 3;
  bp.box(0, 0, v0, w - 1, H - 1, d - 1, wall);
  for (let f = 0; f < floors; f++) windowBand(bp, 0, v0, w - 1, d - 1, f * 3 + 1, rng, w >= 5 ? 2 : 1);
  for (let f = 1; f < floors; f++) bp.perimeter(0, v0, w - 1, d - 1, (u, v) => bp.set(u, f * 3, v, trim));
  const du = Math.floor((w - 1) / 2);
  door(bp, du, v0);
  flatRoof(bp, 0, v0, w - 1, d - 1, H, trim, rng);
  if (v0 === 1) {
    bp.set(0, 0, 0, B.HEDGE);
    bp.set(w - 1, 0, 0, B.HEDGE);
  }
  return bp;
}

function buildApartmentTower(w, d, rng, maxH) {
  const bp = new Blueprint(w, d);
  const wall = pick(rng, [B.WALL_WHITE, B.CONCRETE, B.WALL_WHITE, B.WALL_YELLOW, B.WALL_BLUE, B.BRICK]);
  const accent = pick(rng, [B.WALL_DARK, B.WALL_RED, B.WALL_BLUE, B.WALL_ORANGE, B.CONCRETE]);
  const v0 = d >= 5 ? 1 : 0;
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.SIDEWALK);
  const floors = Math.min(randInt(rng, 6, 6 + w * 2), Math.floor((maxH - 6) / 3));
  const H = floors * 3;
  bp.box(0, 0, v0, w - 1, H - 1, d - 1, wall);
  for (let f = 1; f < floors; f++) {
    windowBand(bp, 0, v0, w - 1, d - 1, f * 3 + 1, rng, 1);
    windowBand(bp, 0, v0, w - 1, d - 1, f * 3 + 2, rng, 1);
  }
  for (const [u, v] of [[0, v0], [w - 1, v0], [0, d - 1], [w - 1, d - 1]]) bp.box(u, 0, v, u, H - 1, v, accent);
  // Térreo com portaria de vidro
  for (let u = 1; u < w - 1; u++) bp.set(u, 1, v0, B.WINDOW);
  door(bp, Math.floor((w - 1) / 2), v0);
  flatRoof(bp, 0, v0, w - 1, d - 1, H, accent, null);
  bp.box(1, H + 1, v0 + 1, Math.min(2, w - 2), H + 2, Math.min(v0 + 2, d - 2), B.WALL_DARK);
  bp.set(w - 2, H + 1, d - 2, B.TANK);
  bp.set(w - 2, H + 2, d - 2, B.TANK);
  if (rng() < 0.6) bp.lampPost(Math.min(2, w - 2), H + 3, v0 + 1, 2);
  if (v0 === 1) for (let u = 0; u < w; u += 2) bp.set(u, 0, 0, B.HEDGE);
  return bp;
}

// ---------------------------------------------------------------- comercial

function buildShop(w, d, rng) {
  const bp = new Blueprint(w, d);
  const wall = pick(rng, [...WALL_COLORS, B.BRICK, B.CONCRETE]);
  const awning = rng() < 0.5 ? B.AWNING_RED : B.AWNING_BLUE;
  const sign = pick(rng, [B.WALL_RED, B.WALL_ORANGE, B.WALL_BLUE, B.WALL_GREEN, B.WALL_YELLOW]);
  const v0 = d >= 4 ? 1 : 0;
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.SIDEWALK);
  const floors = rng() < 0.5 ? 1 : 2;
  const H = floors * 3;
  bp.walls(0, 0, v0, w - 1, H - 1, d - 1, wall);
  bp.box(0, -1, v0, w - 1, -1, d - 1, B.CONCRETE);
  for (let u = 0; u < w; u++) { bp.set(u, 0, v0, B.WINDOW); bp.set(u, 1, v0, B.WINDOW); }
  door(bp, Math.floor((w - 1) / 2), v0);
  for (let u = 0; u < w; u++) bp.set(u, 2, v0, sign);
  if (v0 === 1) for (let u = 0; u < w; u++) bp.set(u, 2, 0, awning);
  if (floors === 2) windowBand(bp, 0, v0, w - 1, d - 1, 4, rng, 2);
  flatRoof(bp, 0, v0, w - 1, d - 1, H, wall, null);
  if (rng() < 0.5) bp.lampPost(Math.floor(w / 2), H + 1, d - 1, 1);
  return bp;
}

function buildOfficeMid(w, d, rng) {
  const bp = new Blueprint(w, d);
  const band = pick(rng, [B.CONCRETE, B.WALL_WHITE, B.WALL_DARK]);
  const glass = rng() < 0.5 ? officeBlock : winBlock;
  const v0 = d >= 4 ? 1 : 0;
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.SIDEWALK);
  const floors = randInt(rng, 3, 6);
  const H = floors * 3;
  bp.box(0, 0, v0, w - 1, H - 1, d - 1, band);
  for (let f = 0; f < floors; f++) {
    for (const y of [f * 3 + 1, f * 3 + 2]) {
      bp.perimeter(0, v0, w - 1, d - 1, (u, v) => {
        const corner = (u === 0 || u === w - 1) && (v === v0 || v === d - 1);
        if (!corner) bp.set(u, y, v, glass(rng, 0.65));
      });
    }
  }
  if (v0 === 1) for (let u = 0; u < w; u++) bp.set(u, 2, 0, rng() < 0.5 ? B.AWNING_RED : B.AWNING_BLUE);
  door(bp, Math.floor((w - 1) / 2), v0);
  flatRoof(bp, 0, v0, w - 1, d - 1, H, band, rng);
  return bp;
}

function buildSkyscraper(w, d, rng, maxH) {
  const bp = new Blueprint(w, d);
  const frame = pick(rng, [B.METAL, B.CONCRETE, B.WALL_DARK, B.WALL_WHITE]);
  const v0 = d >= 5 ? 1 : 0;
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.SIDEWALK);
  const floors = Math.min(randInt(rng, 10, 10 + w * 4), Math.floor((maxH - 9) / 3));
  const H = floors * 3;
  // prédios largos podem ter recuos (escalonados) no alto
  const tiered = w >= 5 && d - v0 >= 4 && rng() < 0.6;
  const t1 = tiered ? Math.floor(floors * 0.55) * 3 : H;
  const t2 = tiered ? Math.floor(floors * 0.8) * 3 : H;
  let u0 = 0, u1 = w - 1, a0 = v0, a1 = d - 1;
  for (let y = 0; y < H; y++) {
    const inset = y >= t2 ? 2 : y >= t1 ? 1 : 0;
    u0 = inset; u1 = w - 1 - inset;
    a0 = Math.min(v0 + inset, d - 2); a1 = Math.max(d - 1 - inset, a0 + 1);
    const isBand = y % 3 === 0 || y === t1 - 1 || y === t2 - 1 || y === H - 1;
    bp.box(u0 + 1, y, a0 + 1, u1 - 1, y, a1 - 1, frame);
    bp.perimeter(u0, a0, u1, a1, (u, v) => {
      const corner = (u === u0 || u === u1) && (v === a0 || v === a1);
      bp.set(u, y, v, corner || isBand ? frame : officeBlock(rng, 0.62));
    });
  }
  const du = Math.floor((w - 1) / 2);
  door(bp, du, v0);
  bp.set(du - 1, 1, v0, B.OFFICE);
  bp.set(du + 1, 1, v0, B.OFFICE);
  bp.box(u0, H, a0, u1, H, a1, frame);
  const cu = Math.floor((u0 + u1) / 2), cv = Math.floor((a0 + a1) / 2);
  const spire = randInt(rng, 3, 7);
  for (let y = H + 1; y <= H + spire; y++) bp.set(cu, y, cv, B.METAL);
  bp.set(cu, H + spire + 1, cv, B.LAMP);
  return bp;
}

// ---------------------------------------------------------------- industrial

function buildWarehouse(w, d, rng) {
  const bp = new Blueprint(w, d);
  const v0 = d >= 4 ? 1 : 0;
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.GRAVEL);
  bp.box(0, 0, v0, w - 1, 3, d - 1, B.METAL);
  for (let u = 0; u < w; u++) {
    for (let v = v0; v < d; v++) {
      bp.set(u, 4, v, B.ROOF_GRAY);
      if (u % 3 === 0) bp.set(u, 5, v, B.ROOF_GRAY);
    }
  }
  const du = Math.floor((w - 1) / 2);
  for (let u = du; u <= Math.min(du + 1, w - 2); u++) for (let y = 0; y <= 2; y++) bp.set(u, y, v0, B.WALL_DARK);
  windowBand(bp, 0, v0, w - 1, d - 1, 3, rng, 2, null, 0.3);
  if (v0 === 1) for (let u = 0; u < w; u++) if (rng() < 0.3 && Math.abs(u - du) > 1) bp.set(u, 0, 0, B.PLANKS);
  return bp;
}

function buildFactory(w, d, rng) {
  const bp = new Blueprint(w, d);
  const v0 = d >= 4 ? 1 : 0;
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.GRAVEL);
  bp.box(0, 0, v0, w - 1, 5, d - 1, B.BRICK);
  windowBand(bp, 0, v0, w - 1, d - 1, 1, rng, 2, null, 0.35);
  windowBand(bp, 0, v0, w - 1, d - 1, 4, rng, 2, null, 0.35);
  bp.box(0, 6, v0, w - 1, 6, d - 1, B.ROOF_GRAY);
  const du = Math.floor((w - 1) / 2);
  for (let y = 0; y <= 2; y++) bp.set(du, y, v0, B.WALL_DARK);
  const cu = w - 2, cv = d - 2;
  if (rng() < 0.6) {
    const ch = randInt(rng, 11, 15);
    for (let y = 7; y < ch; y++) bp.set(cu, y, cv, y > ch - 3 ? B.WALL_RED : B.BRICK);
    bp.smoke.push([cu, ch, cv]);
  } else {
    // exaustores no telhado em vez de chaminé
    for (let u = 1; u < w - 1; u += 2) bp.set(u, 7, cv, B.METAL);
  }
  return bp;
}

function buildPlant(w, d, rng, maxH) {
  const bp = new Blueprint(w, d);
  bp.box(0, -1, 0, w - 1, -1, d - 1, B.CONCRETE);
  const hallW = Math.max(3, w - 3);
  bp.box(0, 0, 1, hallW - 1, 4, d - 1, B.METAL);
  bp.box(0, 5, 1, hallW - 1, 5, d - 1, B.ROOF_GRAY);
  windowBand(bp, 0, 1, hallW - 1, d - 1, 2, rng, 2, null, 0.4);
  for (let y = 0; y <= 2; y++) bp.set(1, y, 1, B.WALL_DARK);
  // silos (2x2 quando cabe) e chaminés
  const sh = Math.min(randInt(rng, 9, 13), maxH - 4);
  const s0 = w >= 6 ? w - 2 : w - 1;
  const sv1 = d >= 5 ? 2 : 1;
  bp.box(s0, 0, 1, w - 1, sh - 1, sv1, B.CONCRETE);
  bp.box(s0, sh, 1, w - 1, sh, sv1, B.METAL);
  if (d >= 6) {
    bp.box(s0, 0, sv1 + 2, w - 1, sh - 3, sv1 + 3, B.CONCRETE);
    bp.box(s0, sh - 2, sv1 + 2, w - 1, sh - 2, sv1 + 3, B.METAL);
  }
  const ch = Math.min(randInt(rng, 16, 22), maxH - 2);
  for (let y = 6; y < ch; y++) {
    const stripe = y > ch - 5 ? ((y >> 1) % 2 ? B.WALL_RED : B.WALL_WHITE) : B.CONCRETE;
    bp.set(0, y, d - 2, stripe);
  }
  bp.smoke.push([0, ch, d - 2]);
  if (rng() < 0.5) {
    for (let y = 6; y < ch - 3; y++) bp.set(hallW - 1, y, d - 2, B.CONCRETE);
    bp.smoke.push([hallW - 1, ch - 3, d - 2]);
  }
  return bp;
}

// Escolhe o gerador conforme zona e nível
function generateBuilding(zone, level, w, d, seed, maxH) {
  const rng = makeRng(seed);
  if (zone === 1) {
    if (level === 1) return buildHouse(w, d, rng);
    if (level === 2) return buildTownhouse(w, d, rng);
    return buildApartmentTower(w, d, rng, maxH);
  }
  if (zone === 2) {
    if (level === 1) return buildShop(w, d, rng);
    if (level === 2) return buildOfficeMid(w, d, rng);
    return buildSkyscraper(w, d, rng, maxH);
  }
  if (level === 1) return buildWarehouse(w, d, rng);
  if (level === 2) return buildFactory(w, d, rng);
  return buildPlant(w, d, rng, maxH);
}

// ---------------------------------------------------------------- especiais

const SPECIALS = {
  arvore: { name: 'Árvore', icon: '🌳', w: 1, d: 1 },
  parque: { name: 'Parque', icon: '🌷', w: 7, d: 7 },
  praca: { name: 'Praça com Fonte', icon: '⛲', w: 7, d: 7 },
  prefeitura: { name: 'Prefeitura', icon: '🏛️', w: 9, d: 7 },
  igreja: { name: 'Igreja', icon: '⛪', w: 7, d: 11 },
  estadio: { name: 'Estádio', icon: '🏟️', w: 15, d: 11 },
  torre: { name: 'Torre de TV', icon: '📡', w: 3, d: 3 },
  farol: { name: 'Farol', icon: '🔦', w: 3, d: 3 },
};

function buildSpecial(type, seed, maxH) {
  const rng = makeRng(seed);
  const s = SPECIALS[type];
  const bp = new Blueprint(s.w, s.d);
  const W = s.w, D = s.d;

  if (type === 'parque') {
    bp.box(0, -1, 0, W - 1, -1, D - 1, B.LAWN);
    for (let i = 0; i < W; i++) { bp.set(i, -1, 3, B.GRAVEL); bp.set(3, -1, i, B.GRAVEL); }
    for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) {
      if (bp.get(u, -1, v) === B.LAWN && rng() < 0.18) bp.set(u, -1, v, B.FLOWERS);
    }
    bp.set(3, -1, 3, B.WATER);
    bp.set(2, -1, 3, B.COBBLE); bp.set(4, -1, 3, B.COBBLE); bp.set(3, -1, 2, B.COBBLE); bp.set(3, -1, 4, B.COBBLE);
    for (const [u, v] of [[1, 1], [5, 1], [1, 5], [5, 5]]) bp.tree(u, 0, v, rng() < 0.3 ? 'betula' : 'carvalho', rng, true);
    bp.set(2, 0, 2, B.DARK_PLANKS); bp.set(4, 0, 4, B.DARK_PLANKS);
    bp.lampPost(2, 0, 4, 2); bp.lampPost(4, 0, 2, 2);
    for (const u of [0, 6]) for (const v of [0, 6]) if (bp.get(u, 0, v) === 0) bp.set(u, 0, v, B.HEDGE);
  } else if (type === 'praca') {
    bp.box(0, -1, 0, W - 1, -1, D - 1, B.SIDEWALK);
    bp.box(1, -1, 1, 5, -1, 5, B.COBBLE);
    bp.walls(1, 0, 1, 5, 0, 5, B.COBBLE);
    bp.box(2, 0, 2, 4, 0, 4, B.WATER);
    bp.set(3, 0, 3, B.COBBLE);
    bp.set(3, 1, 3, B.COBBLE);
    bp.set(3, 2, 3, B.WATER);
    for (const [u, v] of [[0, 0], [6, 0], [0, 6], [6, 6]]) bp.lampPost(u, 0, v, 2);
    for (const [u, v] of [[0, 3], [6, 3], [3, 6]]) bp.set(u, 0, v, B.DARK_PLANKS);
    for (const [u, v] of [[1, 0], [5, 0], [0, 1], [6, 5]]) bp.set(u, 0, v, B.HEDGE);
  } else if (type === 'prefeitura') {
    bp.box(0, -1, 0, W - 1, -1, D - 1, B.SIDEWALK);
    for (let u = 1; u < W - 1; u++) bp.set(u, 0, 0, B.COBBLE);
    bp.box(0, 0, 2, W - 1, 6, D - 1, B.WALL_WHITE);
    windowBand(bp, 0, 2, W - 1, D - 1, 1, rng, 2, null, 0.6);
    windowBand(bp, 0, 2, W - 1, D - 1, 4, rng, 2, null, 0.6);
    for (let u = 1; u < W - 1; u += 2) for (let y = 0; y <= 5; y++) bp.set(u, y, 1, B.WALL_WHITE);
    bp.box(0, 6, 1, W - 1, 6, 1, B.WALL_WHITE);
    door(bp, 4, 2);
    bp.box(0, 7, 1, W - 1, 7, D - 1, B.CONCRETE);
    for (let k = 0; k < 3; k++) bp.box(2 + k, 8 + k, 2 + k, 6 - k, 8 + k, 6 - k, B.ROOF_GREEN);
    bp.set(4, 11, 4, B.ROOF_GREEN);
    bp.set(4, 5, 1, B.GOLD);
    for (let y = 8; y <= 12; y++) bp.set(0, y, 1, B.METAL);
    bp.set(1, 12, 1, B.WALL_GREEN); bp.set(2, 12, 1, B.WALL_GREEN);
    bp.set(1, 11, 1, B.WALL_YELLOW); bp.set(2, 11, 1, B.WALL_BLUE);
  } else if (type === 'igreja') {
    bp.box(0, -1, 0, W - 1, -1, D - 1, B.SIDEWALK);
    // nave
    bp.walls(1, 0, 3, 5, 5, D - 1, B.WALL_WHITE);
    bp.perimeter(1, 3, 5, D - 1, (u, v) => bp.set(u, 0, v, B.WALL_BLUE));
    for (let v = 4; v < D - 1; v += 2) { bp.set(1, 2, v, B.WINDOW); bp.set(1, 3, v, B.WINDOW); bp.set(5, 2, v, B.WINDOW); bp.set(5, 3, v, B.WINDOW); }
    for (let k = 0; k < 3; k++) {
      for (let v = 3; v < D; v++) {
        bp.set(1 + k, 6 + k, v, B.ROOF_RED);
        bp.set(5 - k, 6 + k, v, B.ROOF_RED);
        for (let u = 2 + k; u <= 4 - k; u++) if (v === D - 1 || v === 3) bp.set(u, 6 + k, v, B.WALL_WHITE);
      }
    }
    for (let v = 3; v < D; v++) bp.set(3, 9, v, B.ROOF_RED);
    // torre da frente
    bp.box(2, 0, 0, 4, 11, 2, B.WALL_WHITE);
    bp.perimeter(2, 0, 4, 2, (u, v) => { bp.set(u, 0, v, B.WALL_BLUE); bp.set(u, 11, v, B.WALL_YELLOW); });
    door(bp, 3, 0);
    bp.set(3, 2, 0, B.WINDOW); bp.set(3, 5, 0, B.WINDOW); bp.set(3, 8, 0, B.WINDOW);
    bp.box(2, 12, 0, 4, 12, 2, B.ROOF_RED);
    bp.set(3, 13, 1, B.ROOF_RED);
    for (let y = 14; y <= 16; y++) bp.set(3, y, 1, B.GOLD);
    bp.set(2, 15, 1, B.GOLD); bp.set(4, 15, 1, B.GOLD);
    bp.set(0, 0, 0, B.HEDGE); bp.set(6, 0, 0, B.HEDGE);
  } else if (type === 'estadio') {
    bp.box(0, -1, 0, W - 1, -1, D - 1, B.CONCRETE);
    bp.box(3, -1, 3, W - 4, -1, D - 4, B.LAWN);
    for (let u = 3; u <= W - 4; u++) { bp.set(u, -1, 3, B.WALL_WHITE); bp.set(u, -1, D - 4, B.WALL_WHITE); }
    for (let v = 3; v <= D - 4; v++) { bp.set(3, -1, v, B.WALL_WHITE); bp.set(W - 4, -1, v, B.WALL_WHITE); bp.set(7, -1, v, B.WALL_WHITE); }
    for (let k = 0; k < 3; k++) {
      const seat = k % 2 ? B.WALL_BLUE : B.WALL_RED;
      bp.perimeter(2 - k, 2 - k, W - 3 + k, D - 3 + k, (u, v) => {
        for (let y = 0; y < k; y++) bp.set(u, y, v, B.CONCRETE);
        bp.set(u, k, v, seat);
      });
    }
    bp.box(6, 0, 0, 8, 2, 2, 0);
    for (const [u, v] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) {
      for (let y = 3; y < 9; y++) bp.set(u, y, v, B.METAL);
      bp.set(u, 9, v, B.LAMP);
    }
  } else if (type === 'torre') {
    bp.box(0, -1, 0, 2, -1, 2, B.CONCRETE);
    bp.box(0, 0, 0, 2, 1, 2, B.CONCRETE);
    door(bp, 1, 0);
    const h = Math.min(36, maxH - 10);
    const deck = Math.floor(h * 0.7);
    for (let y = 2; y < h; y++) {
      const c = Math.floor(y / 4) % 2 ? B.WALL_RED : B.WALL_WHITE;
      bp.set(1, y, 1, c);
      if (y < deck * 0.4) for (const [u, v] of [[0, 0], [2, 0], [0, 2], [2, 2]]) bp.set(u, y, v, B.METAL);
    }
    bp.box(0, deck, 0, 2, deck, 2, B.WALL_DARK);
    bp.walls(0, deck + 1, 0, 2, deck + 1, 2, B.WINDOW);
    bp.box(0, deck + 2, 0, 2, deck + 2, 2, B.WALL_DARK);
    for (let y = h; y < h + 6; y++) bp.set(1, y, 1, B.METAL);
    bp.set(1, h + 6, 1, B.LAMP);
  } else if (type === 'farol') {
    bp.box(0, -1, 0, 2, -1, 2, B.COBBLE);
    bp.box(0, 0, 0, 2, 0, 2, B.COBBLE);
    for (let y = 1; y < 14; y++) {
      const c = Math.floor((y - 1) / 3) % 2 ? B.WALL_RED : B.WALL_WHITE;
      bp.walls(0, y, 0, 2, y, 2, c);
      bp.set(1, y, 1, c);
    }
    door(bp, 1, 0);
    bp.walls(0, 14, 0, 2, 14, 2, B.GLASS);
    bp.set(1, 14, 1, B.LAMP);
    bp.box(0, 15, 0, 2, 15, 2, B.ROOF_RED);
    bp.set(1, 16, 1, B.ROOF_RED);
  }
  return bp;
}
