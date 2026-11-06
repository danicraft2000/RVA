// Linha do tempo determinística: tudo é função pura do tempo t (segundos).
// As curvas de movimento vêm da biblioteca Motion (interpolate, easings, spring).
import {
  interpolate, spring, cubicBezier, clamp, progress, mix,
  easeIn, easeOut, easeInOut, circOut, circIn, backOut, anticipate,
} from 'motion';

export const ease = {
  linear: (x) => x,
  in: easeIn,
  out: easeOut,
  inOut: easeInOut,
  circOut,
  circIn,
  backOut,
  anticipate,
  // curvas autorais da vinheta
  glide: cubicBezier(0.45, 0.0, 0.15, 1.0),     // deslizes de câmera
  slam: cubicBezier(0.6, 0.0, 0.92, 0.35),      // aceleração até o impacto
  settle: cubicBezier(0.16, 1.0, 0.3, 1.0),     // assentamento suave
  expoOut: cubicBezier(0.16, 1, 0.3, 1),
  expoIn: cubicBezier(0.7, 0, 0.84, 0),
  sineInOut: cubicBezier(0.37, 0, 0.63, 1),
};

export { clamp, progress, mix };

/** Valor interpolado entre t0 e t1 com easing (Motion.interpolate, com clamp). */
export function tween(t, t0, t1, from, to, e = ease.inOut) {
  if (t1 <= t0) return t >= t1 ? to : from;
  return interpolate([t0, t1], [from, to], { ease: e, clamp: true })(t);
}

/** Interpolação multi-chave com easing por segmento. */
export function keys(t, times, values, easings) {
  return interpolate(times, values, { ease: easings, clamp: true })(t);
}

/** 0→1 normalizado (com clamp) e easing opcional. */
export function phase(t, t0, t1, e = ease.linear) {
  return e(clamp(0, 1, progress(t0, t1, t)));
}

// Molas Motion amostradas em tempo absoluto (cache por configuração).
const springCache = new Map();
/**
 * Amostra uma mola Motion iniciada em `t0`.
 * from/to: valores; velocity: velocidade inicial (unid./s).
 */
export function springAt(t, t0, { from = 0, to = 1, stiffness = 170, damping = 16, mass = 1, velocity = 0 } = {}) {
  if (t <= t0) return from;
  const key = `${from}|${to}|${stiffness}|${damping}|${mass}|${velocity}`;
  let gen = springCache.get(key);
  if (!gen) {
    gen = spring({ keyframes: [from, to], stiffness, damping, mass, velocity, restDelta: 1e-5, restSpeed: 1e-4 });
    springCache.set(key, gen);
  }
  return gen.next((t - t0) * 1000).value;
}

/** Pulso de envelope: ataque rápido e decaimento exponencial (flashes de sincronia). */
export function pulse(t, t0, attack = 0.03, decay = 0.35) {
  if (t < t0 - 1e-6) return 0;
  const dt = Math.max(0, t - t0);
  if (attack <= 0) return Math.exp(-dt / decay);   // pico exatamente no quadro do evento
  if (dt < attack) return dt / attack;
  return Math.exp(-(dt - attack) / decay);
}

/**
 * Interpolação cúbica monótona (Fritsch–Carlson) — C1 contínua, sem overshoot.
 * Usada para trajetórias de câmera por chaves temporais.
 */
export function monotone(times, values) {
  const n = times.length;
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((values[i + 1] - values[i]) / (times[i + 1] - times[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const s = 3 / Math.sqrt(h); m[i] = s * a * d[i]; m[i + 1] = s * b * d[i]; }
  }
  return (t) => {
    if (t <= times[0]) return values[0];
    if (t >= times[n - 1]) {
      // continua com a última velocidade (sem congelar)
      return values[n - 1] + m[n - 1] * (t - times[n - 1]);
    }
    let i = 0;
    while (t > times[i + 1]) i++;
    const h = times[i + 1] - times[i], s = (t - times[i]) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * values[i] + (s3 - 2 * s2 + s) * h * m[i]
      + (-2 * s3 + 3 * s2) * values[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

/** Trilha vetorial (x,y,z) por chaves com interpolação monótona por eixo. */
export function vecTrack(list) {
  const times = list.map((k) => k[0]);
  const fx = monotone(times, list.map((k) => k[1][0]));
  const fy = monotone(times, list.map((k) => k[1][1]));
  const fz = monotone(times, list.map((k) => k[1][2]));
  return (t, out) => out.set(fx(t), fy(t), fz(t));
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
