// Telas de "redação" desenhadas proceduralmente em Canvas 2D (conteúdo original,
// abstrato, com referências regionais do Vale do Paraíba).
import * as THREE from 'three';
import { rng } from './timeline.js';

const W = 640, H = 360;   // espaço de desenho lógico (renderizado em 2x)
const SCALE = 2;
const RED = '#e8202a', CYAN = '#5cc0ff', WHITE = '#f2f5fa', DIM = 'rgba(220,232,255,0.35)';
const FONT = '"AvantGardeDemi", "Inter", sans-serif';

function base(ctx, r, hue = 0) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, hue ? '#1a0b10' : '#0b1830');
  g.addColorStop(1, hue ? '#090306' : '#050a16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // retícula fina
  ctx.strokeStyle = 'rgba(120,170,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
}

function frame(ctx) {
  ctx.strokeStyle = 'rgba(190,215,255,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
}

function bars(ctx, r, x, y, w, rows, h = 10, gap = 12, color = DIM) {
  ctx.fillStyle = color;
  for (let i = 0; i < rows; i++) ctx.fillRect(x, y + i * (h + gap), w * (0.45 + 0.55 * r()), h);
}

function tag(ctx, text, x, y, color = RED) {
  ctx.font = `700 26px ${FONT}`;
  const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 40);
  ctx.fillStyle = WHITE;
  ctx.fillText(text, x + 14, y + 29);
  return w;
}

const VARIANTS = [
  // 0 — ao vivo: serra/silhueta + linhas de texto
  (ctx, r) => {
    base(ctx, r);
    tag(ctx, 'AO VIVO', 24, 24);
    ctx.fillStyle = 'rgba(92,192,255,0.22)';
    ctx.beginPath(); ctx.moveTo(0, 300);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 230 - 60 * Math.sin(x / 90 + 1) * Math.sin(x / 37) - 30 * r());
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    bars(ctx, r, 24, 92, 300, 4, 12, 14, 'rgba(242,245,250,0.75)');
    ctx.fillStyle = RED; ctx.fillRect(0, H - 34, W, 34);
    ctx.font = `600 20px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText('VALE DO PARAÍBA  •  SÃO JOSÉ DOS CAMPOS', 18, H - 11);
  },
  // 1 — mapa: rio Paraíba do Sul e cidades
  (ctx, r) => {
    base(ctx, r);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, 250);
    const pts = [];
    for (let x = -10; x <= W + 10; x += 16) {
      const y = 230 - x * 0.18 + 26 * Math.sin(x / 45) + 10 * Math.sin(x / 13);
      pts.push([x, y]); ctx.lineTo(x, y);
    }
    ctx.stroke();
    const cities = [['JACAREÍ', 0.14], ['S. J. CAMPOS', 0.3], ['TAUBATÉ', 0.52], ['PINDA', 0.68], ['GUARÁ', 0.84]];
    ctx.font = `600 17px ${FONT}`;
    for (const [name, f] of cities) {
      const [x, y] = pts[Math.floor(f * (pts.length - 1))];
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(x, y - 2, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WHITE; ctx.fillText(name, x - 30, y - 22);
    }
    tag(ctx, 'REGIÃO', 24, 24, '#1d4f9a');
  },
  // 2 — economia: barras + linha
  (ctx, r) => {
    base(ctx, r);
    tag(ctx, 'ECONOMIA', 24, 24, '#1d4f9a');
    for (let i = 0; i < 9; i++) {
      const h = 50 + 150 * r();
      ctx.fillStyle = i === 6 ? RED : 'rgba(92,192,255,0.65)';
      ctx.fillRect(40 + i * 64, 330 - h, 40, h);
    }
    ctx.strokeStyle = WHITE; ctx.lineWidth = 4; ctx.beginPath();
    for (let i = 0; i < 9; i++) ctx.lineTo(60 + i * 64, 210 - i * 12 - 30 * r());
    ctx.stroke();
  },
  // 3 — tempo
  (ctx, r) => {
    base(ctx, r);
    tag(ctx, 'TEMPO', 24, 24, '#1d4f9a');
    ctx.fillStyle = '#ffcc4d'; ctx.beginPath(); ctx.arc(170, 200, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(235,242,255,0.92)';
    for (const [x, y, rr] of [[230, 236, 46], [280, 222, 58], [334, 240, 40], [262, 256, 40]]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = `700 110px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText('28°', 390, 250);
    bars(ctx, r, 400, 280, 200, 2, 10, 12);
  },
  // 4 — plantão / ticker
  (ctx, r) => {
    base(ctx, r, 1);
    ctx.fillStyle = RED; ctx.fillRect(0, 0, W, 88);
    ctx.font = `700 54px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText('PLANTÃO', 28, 64);
    bars(ctx, r, 28, 120, 560, 6, 14, 18, 'rgba(242,245,250,0.7)');
  },
  // 5 — sinal/forma de onda
  (ctx, r) => {
    base(ctx, r);
    ctx.strokeStyle = CYAN; ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 1 - k * 0.3; ctx.beginPath();
      for (let x = 0; x <= W; x += 4) ctx.lineTo(x, 190 + Math.sin(x / (18 + k * 7) + k) * (60 - k * 15) * Math.sin(x / 140));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    tag(ctx, 'SINAL', 24, 24);
  },
  // 6 — relógio de estúdio
  (ctx, r) => {
    base(ctx, r);
    ctx.font = `700 130px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText('20:00', 120, 230);
    ctx.fillStyle = RED;
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; if (i % 5 === 0) ctx.fillRect(320 + Math.cos(a) * 160 - 3, 180 + Math.sin(a) * 160 - 3, 6, 6); }
    bars(ctx, r, 120, 268, 400, 2, 10, 14);
  },
  // 7 — grade de matérias (miniaturas)
  (ctx, r) => {
    base(ctx, r);
    for (let i = 0; i < 6; i++) {
      const x = 24 + (i % 3) * 200, y = 24 + Math.floor(i / 3) * 168;
      const g = ctx.createLinearGradient(x, y, x + 180, y + 100);
      g.addColorStop(0, i === 1 ? '#7a1018' : '#18406f'); g.addColorStop(1, '#0a1426');
      ctx.fillStyle = g; ctx.fillRect(x, y, 180, 100);
      bars(ctx, r, x, y + 112, 170, 2, 8, 10);
    }
  },
];

export function makePanelTextures(renderer, seed = 7) {
  const r = rng(seed);
  return VARIANTS.map((draw) => {
    const c = document.createElement('canvas');
    c.width = W * SCALE; c.height = H * SCALE;
    const ctx = c.getContext('2d');
    ctx.scale(SCALE, SCALE);
    draw(ctx, r);
    frame(ctx);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  });
}

export const PANEL_ASPECT = W / H;
