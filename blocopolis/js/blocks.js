// Blocópolis — tipos de bloco e texturas geradas por código (sem imagens externas)

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, PLANKS: 8,
  BRICK: 9, COBBLE: 10, GLASS: 11, CONCRETE: 12, ASPHALT: 13, ROAD_X: 14, ROAD_Z: 15,
  SIDEWALK: 16, ROOF_RED: 17, ROOF_GRAY: 18, WINDOW: 19, WINDOW_DARK: 20, WALL_WHITE: 21,
  WALL_YELLOW: 22, WALL_BLUE: 23, WALL_PINK: 24, WALL_GREEN: 25, WALL_ORANGE: 26,
  WALL_RED: 27, WALL_DARK: 28, METAL: 29, SNOW: 30, FLOWERS: 31, LAMP: 32, OFFICE: 33,
  OFFICE_DARK: 34, AWNING_RED: 35, AWNING_BLUE: 36, DOOR_LOW: 37, DOOR_HIGH: 38,
  GRAVEL: 39, HEDGE: 40, GOLD: 41, ROOF_GREEN: 42, LAWN: 43, DARK_PLANKS: 44,
  PINE_LEAVES: 45, BIRCH_LOG: 46, TANK: 47,
};

const BLOCK_COUNT = 48;
const BLOCK_DEFS = new Array(BLOCK_COUNT).fill(null);

// Propriedades rápidas usadas pelo gerador de malhas e pela física
const BLOCK_OPAQUE = new Uint8Array(BLOCK_COUNT);
const BLOCK_TRANSPARENT = new Uint8Array(BLOCK_COUNT);
const BLOCK_SOLID = new Uint8Array(BLOCK_COUNT);
const BLOCK_PLANT = new Uint8Array(BLOCK_COUNT);

function defBlock(id, name, tiles, opts = {}) {
  const t = typeof tiles === 'string' ? { top: tiles, side: tiles, bottom: tiles } : tiles;
  BLOCK_DEFS[id] = {
    id,
    name,
    top: t.top,
    side: t.side,
    bottom: t.bottom || t.top,
    transparent: !!opts.transparent,
    liquid: !!opts.liquid,
    solid: opts.solid !== false,
    palette: opts.palette !== false,
    plant: !!opts.plant,
  };
}

defBlock(B.GRASS, 'Grama', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' });
defBlock(B.DIRT, 'Terra', 'dirt');
defBlock(B.STONE, 'Pedra', 'stone');
defBlock(B.SAND, 'Areia', 'sand');
defBlock(B.WATER, 'Água', 'water', { transparent: true, liquid: true, solid: false });
defBlock(B.LOG, 'Tronco', { top: 'log_top', side: 'log_side' }, { plant: true });
defBlock(B.LEAVES, 'Folhas', 'leaves', { plant: true });
defBlock(B.PLANKS, 'Tábuas', 'planks');
defBlock(B.BRICK, 'Tijolo', 'brick');
defBlock(B.COBBLE, 'Pedregulho', 'cobble');
defBlock(B.GLASS, 'Vidro', 'glass', { transparent: true });
defBlock(B.CONCRETE, 'Concreto', 'concrete');
defBlock(B.ASPHALT, 'Asfalto', 'asphalt');
defBlock(B.ROAD_X, 'Faixa', { top: 'road_x', side: 'asphalt' }, { palette: false });
defBlock(B.ROAD_Z, 'Faixa', { top: 'road_z', side: 'asphalt' }, { palette: false });
defBlock(B.SIDEWALK, 'Calçada', 'sidewalk');
defBlock(B.ROOF_RED, 'Telha', 'roof_red');
defBlock(B.ROOF_GRAY, 'Telha Cinza', 'roof_gray');
defBlock(B.WINDOW, 'Janela', 'window');
defBlock(B.WINDOW_DARK, 'Janela Apagada', 'window_dark', { palette: false });
defBlock(B.WALL_WHITE, 'Parede Branca', 'wall_white');
defBlock(B.WALL_YELLOW, 'Parede Amarela', 'wall_yellow');
defBlock(B.WALL_BLUE, 'Parede Azul', 'wall_blue');
defBlock(B.WALL_PINK, 'Parede Rosa', 'wall_pink');
defBlock(B.WALL_GREEN, 'Parede Verde', 'wall_green');
defBlock(B.WALL_ORANGE, 'Parede Laranja', 'wall_orange');
defBlock(B.WALL_RED, 'Parede Vermelha', 'wall_red');
defBlock(B.WALL_DARK, 'Parede Grafite', 'wall_dark');
defBlock(B.METAL, 'Metal', 'metal');
defBlock(B.SNOW, 'Neve', 'snow');
defBlock(B.FLOWERS, 'Flores', { top: 'flowers', side: 'grass_side', bottom: 'dirt' });
defBlock(B.LAMP, 'Lâmpada', 'lamp');
defBlock(B.OFFICE, 'Vidro Espelhado', 'office');
defBlock(B.OFFICE_DARK, 'Vidro Espelhado', 'office_dark', { palette: false });
defBlock(B.AWNING_RED, 'Toldo Vermelho', 'awning_red');
defBlock(B.AWNING_BLUE, 'Toldo Azul', 'awning_blue');
defBlock(B.DOOR_LOW, 'Porta (baixo)', { top: 'dark_planks', side: 'door_low' });
defBlock(B.DOOR_HIGH, 'Porta (cima)', { top: 'dark_planks', side: 'door_high' });
defBlock(B.GRAVEL, 'Cascalho', 'gravel');
defBlock(B.HEDGE, 'Arbusto', 'hedge', { plant: true });
defBlock(B.GOLD, 'Ouro', 'gold');
defBlock(B.ROOF_GREEN, 'Cobre', 'roof_green');
defBlock(B.LAWN, 'Gramado', { top: 'lawn', side: 'grass_side', bottom: 'dirt' });
defBlock(B.DARK_PLANKS, 'Madeira Escura', 'dark_planks');
defBlock(B.PINE_LEAVES, 'Folhas de Pinheiro', 'pine_leaves', { plant: true });
defBlock(B.BIRCH_LOG, 'Tronco Claro', { top: 'birch_top', side: 'birch_side' }, { plant: true });
defBlock(B.TANK, "Caixa d'Água", { top: 'tank_top', side: 'tank_side' });

for (let id = 1; id < BLOCK_COUNT; id++) {
  const d = BLOCK_DEFS[id];
  if (!d) continue;
  BLOCK_TRANSPARENT[id] = d.transparent ? 1 : 0;
  BLOCK_OPAQUE[id] = d.transparent ? 0 : 1;
  BLOCK_SOLID[id] = d.solid ? 1 : 0;
  BLOCK_PLANT[id] = d.plant ? 1 : 0;
}

// Blocos que aparecem na paleta do jogador, em ordem
const PALETTE_ORDER = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.SAND, B.GRAVEL, B.WATER, B.SNOW,
  B.LOG, B.BIRCH_LOG, B.LEAVES, B.PINE_LEAVES, B.HEDGE, B.FLOWERS, B.LAWN,
  B.PLANKS, B.DARK_PLANKS, B.BRICK, B.CONCRETE, B.SIDEWALK, B.ASPHALT,
  B.WALL_WHITE, B.WALL_YELLOW, B.WALL_BLUE, B.WALL_PINK, B.WALL_GREEN, B.WALL_ORANGE,
  B.WALL_RED, B.WALL_DARK, B.WINDOW, B.GLASS, B.OFFICE, B.METAL, B.ROOF_RED, B.ROOF_GRAY,
  B.ROOF_GREEN, B.AWNING_RED, B.AWNING_BLUE, B.DOOR_LOW, B.DOOR_HIGH, B.LAMP, B.GOLD, B.TANK,
];

const ATLAS_SIZE = 256;
const TILE = 16;

// Gera o atlas de texturas (cores) e o atlas de brilho (janelas acesas à noite)
class BlockAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS_SIZE;
    this.glowCanvas = document.createElement('canvas');
    this.glowCanvas.width = this.glowCanvas.height = ATLAS_SIZE;
    this.tileIndex = {};
    this.count = 0;
    this.rng = makeRng(20031);

    const ctx = this.canvas.getContext('2d');
    const gctx = this.glowCanvas.getContext('2d');
    this.img = ctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);
    this.glow = gctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);
    for (let i = 3; i < this.glow.data.length; i += 4) this.glow.data[i] = 255;

    paintAllTiles(this);

    ctx.putImageData(this.img, 0, 0);
    gctx.putImageData(this.glow, 0, 0);

    // UV de cada face de cada bloco: [u0, v0, u1, v1]
    this.faceUV = new Float32Array(BLOCK_COUNT * 6 * 4);
    const eps = 1 / 4096;
    for (let id = 1; id < BLOCK_COUNT; id++) {
      const d = BLOCK_DEFS[id];
      if (!d) continue;
      // ordem das faces: +x, -x, +y, -y, +z, -z
      const names = [d.side, d.side, d.top, d.bottom, d.side, d.side];
      for (let f = 0; f < 6; f++) {
        const ti = this.tileIndex[names[f]];
        if (ti === undefined) throw new Error('Textura ausente: ' + names[f]);
        const col = ti % 16, row = Math.floor(ti / 16);
        const o = (id * 6 + f) * 4;
        this.faceUV[o] = col / 16 + eps;
        this.faceUV[o + 1] = 1 - (row + 1) / 16 + eps;
        this.faceUV[o + 2] = (col + 1) / 16 - eps;
        this.faceUV[o + 3] = 1 - row / 16 - eps;
      }
    }
  }

  tile(name, paint, glowPaint) {
    const id = this.count++;
    this.tileIndex[name] = id;
    const ox = (id % 16) * TILE, oy = Math.floor(id / 16) * TILE;
    const rng = this.rng;
    const make = (img) => ({
      rng,
      set(x, y, c, a = 255) {
        if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
        const i = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
        img.data[i] = clamp(c[0] | 0, 0, 255);
        img.data[i + 1] = clamp(c[1] | 0, 0, 255);
        img.data[i + 2] = clamp(c[2] | 0, 0, 255);
        img.data[i + 3] = a;
      },
      get(x, y) {
        const i = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
        return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
      },
    });
    paint(make(this.img));
    if (glowPaint) glowPaint(make(this.glow));
  }

  // Desenha um ícone isométrico do bloco (para a paleta)
  icon(id, size = 48) {
    const d = BLOCK_DEFS[id];
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const s = size / 48;
    const src = (name) => {
      const ti = this.tileIndex[name];
      return [(ti % 16) * TILE, Math.floor(ti / 16) * TILE];
    };
    const face = (name, a, b, c, dd, e, f, shade) => {
      const [sx, sy] = src(name);
      ctx.setTransform(a * s, b * s, c * s, dd * s, e * s, f * s);
      ctx.drawImage(this.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
      if (shade > 0) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(0,0,0,${shade})`;
        ctx.fillRect(0, 0, TILE, TILE);
        ctx.globalCompositeOperation = 'source-over';
      }
    };
    face(d.top, 20 / 16, -10 / 16, 20 / 16, 10 / 16, 4, 14, 0);
    face(d.side, 20 / 16, 10 / 16, 0, 20 / 16, 4, 14, 0.18);
    face(d.side, 20 / 16, -10 / 16, 0, 20 / 16, 24, 24, 0.35);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return cv.toDataURL();
  }
}

// ---------------------------------------------------------------------------
// Pintura dos ladrilhos 16x16

function paintAllTiles(atlas) {
  const rng = atlas.rng;
  const vary = (c, amt) => {
    const f = 1 + (rng() - 0.5) * 2 * amt;
    return [c[0] * f, c[1] * f, c[2] * f];
  };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const fill = (t, c, amt, alpha = 255) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) t.set(x, y, vary(c, amt), alpha);
  };
  const speckle = (t, c, n, amt = 0.08) => {
    for (let i = 0; i < n; i++) t.set(randInt(rng, 0, 15), randInt(rng, 0, 15), vary(c, amt));
  };

  const GRASS = [95, 159, 53];
  const DIRT = [134, 96, 67];
  const ASPH = [62, 62, 66];

  const grassTop = (t) => {
    fill(t, GRASS, 0.16);
    speckle(t, [72, 130, 40], 22);
    speckle(t, [122, 186, 72], 14);
  };
  const dirt = (t) => {
    fill(t, DIRT, 0.16);
    speckle(t, [100, 70, 50], 18);
    speckle(t, [165, 124, 88], 10);
  };
  const plaster = (base) => (t) => {
    fill(t, base, 0.035);
    speckle(t, mix(base, [0, 0, 0], 0.08), 12, 0.02);
    speckle(t, mix(base, [255, 255, 255], 0.08), 8, 0.02);
  };
  const planks = (base) => (t) => {
    for (let y = 0; y < TILE; y++) {
      const board = y >> 2;
      const tint = 0.9 + ((board * 37) % 5) * 0.05;
      const seam = (board * 7 + 3) % 16;
      for (let x = 0; x < TILE; x++) {
        let c = vary([base[0] * tint, base[1] * tint, base[2] * tint], 0.05);
        if (y % 4 === 3 || x === seam) c = mix(c, [0, 0, 0], 0.35);
        t.set(x, y, c);
      }
    }
  };
  const roof = (base) => (t) => {
    for (let y = 0; y < TILE; y++) {
      const row = y >> 2;
      for (let x = 0; x < TILE; x++) {
        let c = vary(base, 0.06);
        if (y % 4 === 0) c = mix(c, [0, 0, 0], 0.3);
        else if (y % 4 === 1) c = mix(c, [255, 255, 255], 0.12);
        if (y % 4 !== 0 && (x + (row % 2) * 4) % 8 === 0) c = mix(c, [0, 0, 0], 0.2);
        t.set(x, y, c);
      }
    }
  };
  const windowTile = (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let c;
        if (x === 0 || y === 0 || x === 15 || y === 15) c = vary([228, 226, 220], 0.03);
        else if (x === 8 || y === 7) c = vary([205, 203, 198], 0.03);
        else {
          c = mix([58, 92, 138], [92, 130, 176], y / 15);
          if ((x + y) % 11 < 2) c = mix(c, [190, 215, 240], 0.45);
          c = vary(c, 0.03);
        }
        t.set(x, y, c);
      }
    }
  };
  const windowGlow = (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const frame = x === 0 || y === 0 || x === 15 || y === 15 || x === 8 || y === 7;
        t.set(x, y, frame ? [0, 0, 0] : vary([255, 206, 120], 0.06));
      }
    }
  };
  const office = (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let c;
        if (x === 0 || x === 8 || y === 0) c = [44, 54, 66];
        else {
          c = mix([78, 140, 178], [44, 92, 136], y / 15);
          if ((x + y) % 16 >= 3 && (x + y) % 16 <= 5) c = mix(c, [190, 225, 245], 0.35);
          c = vary(c, 0.02);
        }
        t.set(x, y, c);
      }
    }
  };
  const officeGlow = (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const frame = x === 0 || x === 8 || y === 0;
        t.set(x, y, frame ? [0, 0, 0] : vary([215, 228, 255], 0.05));
      }
    }
  };
  const awning = (c1) => (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let c = (x >> 2) % 2 ? c1 : [240, 236, 226];
        c = vary(c, 0.04);
        if (y === 15 || (y === 14 && x % 4 === 0)) c = mix(c, [0, 0, 0], 0.3);
        t.set(x, y, c);
      }
    }
  };
  const logTop = (bark, ring1, ring2) => (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        let c = d > 6.8 ? bark : (Math.floor(d * 0.9) % 2 ? ring1 : ring2);
        t.set(x, y, vary(c, 0.05));
      }
    }
  };

  atlas.tile('grass_top', grassTop);
  atlas.tile('grass_side', (t) => {
    dirt(t);
    for (let x = 0; x < TILE; x++) {
      const h = 3 + (rng() < 0.5 ? 1 : 0) + (rng() < 0.3 ? 1 : 0);
      for (let y = 0; y < h; y++) t.set(x, y, vary(GRASS, 0.14));
    }
  });
  atlas.tile('dirt', dirt);
  atlas.tile('stone', (t) => {
    fill(t, [128, 128, 128], 0.1);
    for (let i = 0; i < 7; i++) {
      const cx = randInt(rng, 0, 15), cy = randInt(rng, 0, 15);
      const c = rng() < 0.6 ? [104, 104, 106] : [150, 150, 150];
      t.set(cx, cy, vary(c, 0.04)); t.set(cx + 1, cy, vary(c, 0.04)); t.set(cx, cy + 1, vary(c, 0.04));
    }
  });
  atlas.tile('sand', (t) => { fill(t, [220, 208, 160], 0.06); speckle(t, [196, 182, 136], 16); });
  atlas.tile('water', (t) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) t.set(x, y, vary([44, 108, 200], 0.06), 175);
    for (const row of [2, 7, 12]) {
      const x0 = randInt(rng, 0, 10), len = randInt(rng, 3, 5);
      for (let x = x0; x < x0 + len; x++) t.set(x, row, vary([110, 165, 235], 0.04), 195);
    }
  });
  atlas.tile('log_side', (t) => {
    for (let x = 0; x < TILE; x++) {
      const shade = 0.82 + rng() * 0.3;
      for (let y = 0; y < TILE; y++) t.set(x, y, vary([104 * shade, 80 * shade, 50 * shade], 0.06));
    }
    speckle(t, [70, 52, 32], 5);
  });
  atlas.tile('log_top', logTop([104, 80, 50], [178, 142, 92], [150, 116, 72]));
  atlas.tile('leaves', (t) => {
    fill(t, [58, 128, 42], 0.25);
    speckle(t, [32, 82, 26], 30);
    speckle(t, [90, 160, 60], 14);
  });
  atlas.tile('planks', planks([178, 138, 88]));
  atlas.tile('dark_planks', planks([100, 70, 44]));
  atlas.tile('brick', (t) => {
    for (let y = 0; y < TILE; y++) {
      const row = y >> 2;
      const off = row % 2 ? 4 : 0;
      for (let x = 0; x < TILE; x++) {
        const mortar = y % 4 === 3 || (x + off) % 8 === 7;
        const brickId = row * 3 + Math.floor((x + off) / 8);
        const tint = 0.88 + ((brickId * 53) % 7) * 0.035;
        t.set(x, y, mortar ? vary([186, 178, 166], 0.04) : vary([156 * tint, 72 * tint, 54 * tint], 0.05));
      }
    }
  });
  atlas.tile('cobble', (t) => {
    const pts = [];
    for (let i = 0; i < 9; i++) pts.push([rng() * 16, rng() * 16, 110 + rng() * 50]);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let d1 = 1e9, d2 = 1e9, best = null;
        for (const p of pts) {
          for (let ox = -16; ox <= 16; ox += 16) {
            for (let oy = -16; oy <= 16; oy += 16) {
              const d = Math.hypot(x - p[0] - ox, y - p[1] - oy);
              if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
            }
          }
        }
        const g = d2 - d1 < 1.1 ? 78 : best[2];
        t.set(x, y, vary([g, g, g * 1.02], 0.05));
      }
    }
  });
  atlas.tile('glass', (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const border = x === 0 || y === 0 || x === 15 || y === 15;
        const shine = x > 2 && y > 2 && x < 13 && y < 13 && ((x - y + 16) % 16 === 4 || (x - y + 16) % 16 === 5 || (x - y + 16) % 16 === 9);
        if (border) t.set(x, y, [222, 232, 238], 255);
        else if (shine) t.set(x, y, [245, 250, 255], 130);
        else t.set(x, y, [180, 215, 236], 45);
      }
    }
  });
  atlas.tile('concrete', (t) => { fill(t, [188, 188, 182], 0.04); speckle(t, [170, 170, 165], 10, 0.02); });
  atlas.tile('asphalt', (t) => { fill(t, ASPH, 0.12); speckle(t, [92, 92, 94], 12); });
  atlas.tile('road_x', (t) => {
    fill(t, ASPH, 0.12);
    for (let x = 2; x <= 13; x++) for (let y = 7; y <= 8; y++) t.set(x, y, vary([238, 192, 40], 0.05));
  });
  atlas.tile('road_z', (t) => {
    fill(t, ASPH, 0.12);
    for (let y = 2; y <= 13; y++) for (let x = 7; x <= 8; x++) t.set(x, y, vary([238, 192, 40], 0.05));
  });
  atlas.tile('sidewalk', (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const line = x % 8 === 0 || y % 8 === 0;
        t.set(x, y, line ? vary([148, 146, 140], 0.03) : vary([182, 180, 174], 0.04));
      }
    }
  });
  atlas.tile('roof_red', roof([170, 62, 42]));
  atlas.tile('roof_gray', roof([86, 90, 100]));
  atlas.tile('roof_green', (t) => {
    fill(t, [92, 160, 140], 0.08);
    speckle(t, [70, 130, 115], 16);
    speckle(t, [140, 200, 180], 10);
    for (let x = 0; x < TILE; x++) t.set(x, 0, [70, 120, 105]);
  });
  atlas.tile('window', windowTile, windowGlow);
  atlas.tile('window_dark', windowTile);
  atlas.tile('wall_white', plaster([232, 228, 218]));
  atlas.tile('wall_yellow', plaster([236, 198, 86]));
  atlas.tile('wall_blue', plaster([104, 156, 206]));
  atlas.tile('wall_pink', plaster([228, 150, 170]));
  atlas.tile('wall_green', plaster([142, 198, 134]));
  atlas.tile('wall_orange', plaster([216, 128, 72]));
  atlas.tile('wall_red', plaster([188, 50, 46]));
  atlas.tile('wall_dark', plaster([72, 74, 82]));
  atlas.tile('metal', (t) => {
    const ribs = [1.1, 1.0, 0.84, 0.94];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const f = ribs[x % 4];
        let c = vary([158 * f, 164 * f, 170 * f], 0.03);
        if (y === 0) c = mix(c, [0, 0, 0], 0.25);
        t.set(x, y, c);
      }
    }
  });
  atlas.tile('snow', (t) => { fill(t, [244, 247, 252], 0.025); speckle(t, [222, 230, 244], 12, 0.02); });
  atlas.tile('flowers', (t) => {
    grassTop(t);
    const colors = [[232, 52, 52], [250, 222, 60], [255, 255, 255], [172, 92, 222], [255, 142, 40]];
    for (let i = 0; i < 9; i++) {
      const x = randInt(rng, 1, 14), y = randInt(rng, 1, 14);
      const c = pick(rng, colors);
      t.set(x, y, c); t.set(x + 1, y, c); t.set(x, y + 1, c); t.set(x - 1, y, c); t.set(x, y - 1, c);
      t.set(x, y, [250, 230, 120]);
    }
  });
  atlas.tile('lamp', (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const frame = x < 2 || y < 2 || x > 13 || y > 13;
        const d = Math.hypot(x - 7.5, y - 7.5);
        t.set(x, y, frame ? [62, 56, 50] : mix([255, 250, 215], [255, 205, 110], d / 8));
      }
    }
  }, (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const frame = x < 2 || y < 2 || x > 13 || y > 13;
        t.set(x, y, frame ? [0, 0, 0] : [255, 228, 160]);
      }
    }
  });
  atlas.tile('office', office, officeGlow);
  atlas.tile('office_dark', office);
  atlas.tile('awning_red', awning([204, 42, 42]));
  atlas.tile('awning_blue', awning([44, 92, 184]));
  atlas.tile('door_low', (t) => {
    planks([120, 80, 46])(t);
    for (let y = 0; y < TILE; y++) { t.set(0, y, [74, 50, 28]); t.set(15, y, [74, 50, 28]); }
    for (let x = 0; x < TILE; x++) t.set(x, 15, [74, 50, 28]);
    for (let y = 3; y <= 12; y++) { t.set(3, y, [92, 62, 34]); t.set(12, y, [92, 62, 34]); }
    t.set(12, 2, [235, 196, 64]); t.set(12, 1, [255, 225, 120]);
  });
  atlas.tile('door_high', (t) => {
    planks([120, 80, 46])(t);
    for (let y = 0; y < TILE; y++) { t.set(0, y, [74, 50, 28]); t.set(15, y, [74, 50, 28]); }
    for (let x = 0; x < TILE; x++) t.set(x, 0, [74, 50, 28]);
    for (let y = 4; y <= 10; y++) {
      for (let x = 4; x <= 11; x++) {
        const bar = x === 7 || x === 8 || y === 7;
        t.set(x, y, bar ? [92, 62, 34] : mix([100, 140, 180], [170, 205, 230], (x + y) / 22));
      }
    }
  });
  atlas.tile('gravel', (t) => {
    fill(t, [150, 146, 140], 0.08);
    for (let i = 0; i < 60; i++) {
      const g = 105 + rng() * 90;
      t.set(randInt(rng, 0, 15), randInt(rng, 0, 15), [g, g * 0.97, g * 0.93]);
    }
  });
  atlas.tile('hedge', (t) => { fill(t, [48, 108, 40], 0.22); speckle(t, [26, 70, 22], 26); speckle(t, [78, 140, 56], 12); });
  atlas.tile('gold', (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let c = vary([236, 190, 56], 0.05);
        if ((x + y) % 9 === 0) c = [255, 240, 150];
        if (x === 0 || y === 15) c = [188, 140, 32];
        t.set(x, y, c);
      }
    }
  });
  atlas.tile('lawn', (t) => {
    for (let y = 0; y < TILE; y++) {
      const c0 = (y >> 2) % 2 ? [104, 174, 62] : [86, 152, 50];
      for (let x = 0; x < TILE; x++) t.set(x, y, vary(c0, 0.06));
    }
  });
  atlas.tile('pine_leaves', (t) => {
    fill(t, [40, 96, 56], 0.22);
    speckle(t, [24, 62, 36], 30);
    speckle(t, [64, 124, 76], 12);
  });
  atlas.tile('birch_side', (t) => {
    fill(t, [222, 220, 210], 0.04);
    for (let i = 0; i < 9; i++) {
      const x = randInt(rng, 0, 13), y = randInt(rng, 0, 15);
      const len = randInt(rng, 2, 3);
      for (let k = 0; k < len; k++) t.set(x + k, y, [44, 44, 44]);
    }
  });
  atlas.tile('birch_top', logTop([222, 220, 210], [214, 196, 150], [190, 170, 124]));
  atlas.tile('tank_side', (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let c = vary([40, 112, 204], 0.04);
        if (y % 5 === 0) c = mix(c, [0, 0, 0], 0.28);
        if (x % 8 === 2) c = mix(c, [255, 255, 255], 0.18);
        t.set(x, y, c);
      }
    }
  });
  atlas.tile('tank_top', (t) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        let c = vary([40, 112, 204], 0.04);
        if (d > 3.5 && d < 4.6) c = mix(c, [0, 0, 0], 0.3);
        if (d < 1.2) c = [30, 80, 150];
        t.set(x, y, c);
      }
    }
  });
}
