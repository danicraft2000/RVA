// VANGUARDA NEWS — remake RVA. Animação 100% programada (Three.js + Motion).
// Cada quadro é função pura do tempo: renderFrame(t) desenha o quadro exato.
import * as THREE from 'three';
import cues from '../assets/cues.json';
import { buildLogo, setNeonFraction } from './logo.js';
import {
  initTextures, textures, buildSky, buildEnvironment, buildFloor, buildStreaks,
  buildPanels, buildDust, buildImpactFX, makeGlow,
} from './world.js';
import { buildComposer } from './post.js';
import { ease, tween, phase, springAt, pulse, keys, vecTrack, monotone, rng, clamp, mix } from './timeline.js';

export const FPS = 30;
export const DURATION = cues.duration;          // 10,5 s (definido pela trilha)

const S = {};                                    // estado da cena

// ---------------------------------------------------------------- câmera
// Chaves de posição/alvo (tempo em s). Interpolação cúbica monótona por eixo.
const camPos = vecTrack([
  [0.0, [5.0, -13.4, 162]],
  [1.0, [3.2, -12.9, 147]],
  [2.0, [0.4, -9.6, 129]],
  [3.0, [-5.2, -4.2, 108]],
  [4.0, [-14.5, 0.8, 86]],
  [5.0, [-26.5, 5.2, 69]],
  [6.0, [-25.0, 6.6, 66]],
  [7.0, [-15.5, 4.2, 65.5]],
  [8.0, [-5.2, -3.2, 65]],
  [10.5, [-4.5, -2.8, 61.2]],
]);
const camTgt = vecTrack([
  [0.0, [0.0, -15.2, 70]],
  [1.0, [-1.0, -13.6, 60]],
  [2.0, [-3.0, -5.5, 50]],
  [3.0, [-4.5, -1.2, 28]],
  [4.0, [-1.6, 0.0, 0]],
  [5.0, [1.2, 0.6, 0]],
  [6.0, [2.0, 1.0, 0]],
  [7.0, [1.4, 0.5, 0]],
  [8.0, [0.25, -0.2, 0]],
  [10.5, [0.15, -0.12, 0]],
]);
const camRoll = monotone([0, 1.5, 2.6, 3.4, 4.5, 6.0, 7.2, 8.0, 10.5], [0.02, -0.035, 0.06, -0.02, -0.05, 0.035, 0.012, 0, 0]);
const camFov = monotone([0, 2, 4, 6, 8, 10.5], [42, 39, 35, 33.5, 32, 31.6]);

// ------------------------------------------------------------------ init
export async function init({ width, height, canvas }) {
  S.width = width; S.height = height;
  try {
    const ff = new FontFace('AvantGardeDemi', 'url(/assets/fonts/ITCAvantGardeStd-Demi.ttf)');
    document.fonts.add(await ff.load());
  } catch (e) { console.warn('fonte Demi indisponível, usando Inter', e.message); }
  await document.fonts.ready;
  initTextures();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.FogExp2(0x03060d, 0.0036);
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 1.0;
  S.scene = scene;

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 2000);
  S.camera = camera;

  S.sky = buildSky(); scene.add(S.sky);
  S.floor = buildFloor(); scene.add(S.floor);
  S.streaks = buildStreaks(); scene.add(S.streaks.group);
  S.panels = buildPanels(renderer); scene.add(S.panels.group);
  S.dust = buildDust(); scene.add(S.dust);
  S.dust.material.uniforms.uScale.value = height / 540;     // tamanho de ponto independente da resolução

  S.logo = buildLogo(1.0);
  scene.add(S.logo.group);
  S.fx = buildImpactFX(S.logo.letters.length);
  S.logo.group.add(S.fx.group);

  // luzes (o cromado é metálico: luzes pontuais geram brilhos especulares)
  const key = new THREE.DirectionalLight(0xe9f1ff, 2.2);
  key.position.set(-20, 30, 40);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb6ff, 1.4);
  rim.position.set(25, -10, -30);
  scene.add(rim);
  S.neonLightN = new THREE.PointLight(0xff2a22, 0, 26, 1.6);
  S.neonLightE = new THREE.PointLight(0xff2a22, 0, 22, 1.6);
  S.logo.group.add(S.neonLightN, S.neonLightE);
  S.impactLight = new THREE.PointLight(0xbfdcff, 0, 30, 1.5);
  S.logo.group.add(S.impactLight);

  // centros de NEWS (no espaço da logo)
  const center = (name) => {
    const b = new THREE.Box3();
    for (const n of S.logo.neon) if (n.el === name) { n.lit.geometry.computeBoundingBox(); b.union(n.lit.geometry.boundingBox); }
    return b.getCenter(new THREE.Vector3());
  };
  S.nCenter = center('N'); S.ewsCenter = center('EWS');
  S.neonLightN.position.copy(S.nCenter).setZ(3.2);
  S.neonLightE.position.copy(S.ewsCenter).setZ(3.0);

  // brilhos do impacto final
  const mkSprite = (map, color) => new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  S.hitGlow = makeGlow(new THREE.Color(0.35, 0.5, 1.0), { falloff: 5 });
  S.hitGlow.position.set(0, 0, -6); S.hitGlow.scale.setScalar(80);
  S.logo.group.add(S.hitGlow);
  S.redGlow = makeGlow(new THREE.Color(1.0, 0.08, 0.07), { falloff: 4.5, stretch: 2.2 });
  S.redGlow.position.copy(S.nCenter).add(S.ewsCenter).multiplyScalar(0.5).setZ(-2.0);
  S.logo.group.add(S.redGlow);
  S.flare = makeGlow(new THREE.Color(1.0, 0.3, 0.28), { falloff: 3, stretch: 900 });
  scene.add(S.flare);
  S.flareBlue = makeGlow(new THREE.Color(0.45, 0.65, 1.3), { falloff: 3, stretch: 1600 });
  scene.add(S.flareBlue);
  S.head = mkSprite(textures.glow, new THREE.Color(2.4, 1.2, 1.0));
  S.head.scale.setScalar(1.8);
  S.logo.group.add(S.head);
  S.head2 = S.head.clone(); S.head2.material = S.head.material.clone(); S.logo.group.add(S.head2);
  S.head3 = S.head.clone(); S.head3.material = S.head.material.clone(); S.logo.group.add(S.head3);

  // parâmetros de voo de cada letra (determinísticos)
  const r = rng(97);
  S.flight = S.logo.letters.map((m, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    return {
      land: cues.letters[i],
      dur: 0.62,
      off: new THREE.Vector3(side * (5 + r() * 9), (r() - 0.35) * 12, 22 + r() * 16),
      rot: new THREE.Euler((r() - 0.5) * 2.4, side * (1.2 + r() * 1.0), (r() - 0.5) * 1.6),
      recoil: 6 + r() * 4,
    };
  });

  Object.assign(S, buildComposer(renderer, scene, camera, width, height));
  update(0);
  return { width, height, frames: Math.round(DURATION * FPS) };
}

// --------------------------------------------------------------- update
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const KICKS = [2.0, 2.5, 3.0, 3.5];
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function neonFlicker(t, t0, seed) {
  // padrão de ignição de neon: piscadas irregulares nos primeiros ~0,35 s
  if (t < t0) return 0;
  const dt = t - t0;
  if (dt > 0.36) return 1;
  const r = rng(seed + Math.floor(dt * 40));
  const on = r() > 0.35 + 0.5 * (1 - dt / 0.36) * 0.5;
  return on ? 0.6 + 0.4 * r() : 0.08;
}

export function update(t) {
  const { camera, scene } = S;

  // ---- câmera
  camPos(t, camera.position);
  camTgt(t, _v);
  // micro-movimento orgânico (sem congelar no fim)
  camera.position.x += Math.sin(t * 0.9) * 0.08;
  camera.position.y += Math.sin(t * 1.3 + 1.0) * 0.05;
  camera.up.set(0, 1, 0);
  camera.lookAt(_v);
  camera.rotateZ(camRoll(t));
  camera.fov = camFov(t);
  camera.aspect = S.width / S.height;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // ---- energia global
  const hit = cues.hit;
  const gapDip = phase(t, cues.gap[0], cues.gap[1], ease.out) * (t < hit ? 1 : 0);
  const hitP = pulse(t, hit, 0, 0.3);
  S.renderer.toneMappingExposure = 1.0 - 0.15 * gapDip + 0.22 * hitP;
  S.bloom.strength = 0.5 + 0.1 * phase(t, 6.0, 7.75) + 0.5 * hitP + 0.1 * pulse(t, cues.echo, 0.05, 0.4);
  S.bloom.radius = 0.0;
  S.bloom.threshold = 0.95;
  S.grade.uniforms.uFlash.value = 0.12 * pulse(t, hit, 0, 0.07);
  S.grade.uniforms.uSeed.value = (t * 37.7) % 1;
  S.grade.uniforms.uFade.value = tween(t, 0, 0.3, 0.55, 1, ease.out);
  // varredura de luz no cromado: a faixa de reflexo atravessa e volta ao estado brilhante
  const sweep = Math.sin(Math.PI * phase(t, cues.sweep[0], cues.sweep[1] + 0.4, ease.sineInOut));
  scene.environmentRotation.set(0, -0.42 + 0.025 * t + 0.62 * sweep, 0.0);

  // ---- céu e piso
  S.sky.material.uniforms.uGlow.value = 0.3 + 0.5 * phase(t, 3.5, 6) + 1.0 * hitP;
  S.sky.material.uniforms.uRed.value = 0.35 * phase(t, 6.0, 7.8) + 0.6 * hitP;
  const fu = S.floor.material.uniforms;
  fu.uCam.value.copy(camera.position);
  fu.uBright.value = tween(t, 0, 0.8, 0.6, 1) * (1 - 0.6 * phase(t, 4, 7)) + 0.4 * hitP;
  fu.uTime.value = Math.max(0, t - hit);
  fu.uPulse.value = t > hit ? Math.exp(-(t - hit) / 1.2) * 1.4 : 0;
  // ondas de radar nos 4 tempos do 1º compasso
  [0, 0.5, 1.0, 1.5].forEach((b, j) => {
    const dt = t - b;
    fu.uWaveR.value.setComponent(j, dt >= 0 ? 6 + dt * 34 : -100);
    fu.uWaveA.value.setComponent(j, dt >= 0 ? Math.exp(-dt / 0.9) * (0.7 + 0.3 * j / 3) : 0);
  });

  // ---- feixes de dados
  const streakI = keys(t, [0, 0.6, 3.2, 4.6, 7.9, 8.05, 9.2, 10.5], [0.55, 1.2, 1.2, 0.2, 0.16, 0.6, 0.13, 0.12]);
  S.streaks.update(t, camera.position, streakI);

  // ---- telas de redação
  for (let i = 0; i < S.panels.panels.length; i++) {
    const p = S.panels.panels[i];
    const boot = cues.blips[i % cues.blips.length];   // cada blip da trilha liga um grupo de telas
    let bright = neonFlicker(t, boot, i * 13) * (0.85 + 0.15 * p.dim);
    // virada no tempo forte do bumbo
    const kt = KICKS[p.flipBeat] + p.flipDelay;
    const flip = springAt(t, kt, { from: 0, to: Math.PI, stiffness: 150, damping: 15 });
    bright += 0.9 * pulse(t, kt, 0, 0.22);
    _q.setFromAxisAngle(Y_AXIS, flip);
    _q.premultiply(p.tunnelQ);                         // tunnelQ * rotY(flip)
    // migração para a parede de fundo
    const m0 = 3.25 + p.migDelay * 1.9;
    const k = phase(t, m0, m0 + 1.9, ease.glide);
    if (k > 0) {
      _v.lerpVectors(p.tunnelPos, p.wallPos, k);
      _v.addScaledVector(p.outward, Math.sin(Math.PI * k) * 24);
      p.g.position.copy(_v);
      _q2.copy(p.wallQ).multiply(_flipQ);
      _q.slerp(_q2, ease.inOut(k));
      _e.set(0, 0, Math.sin(Math.PI * k) * p.spin);
      _q.multiply(new THREE.Quaternion().setFromEuler(_e));
      const row = Math.floor(i / 13) % 7;
      const wallB = (0.065 * p.dim + 0.018 * Math.sin(t * 1.7 + i)) * (1 - row * 0.11) * p.wallOn;
      const blur = k > 0.75;
      if (p.fm.map !== (blur ? p.blurF : p.sharpF)) { p.fm.map = blur ? p.blurF : p.sharpF; p.bm.map = blur ? p.blurB : p.sharpB; }
      bright = mix(bright, wallB, ease.out(k));
      // onda de luz no impacto final, do centro para fora
      const dc = Math.abs((i % 13) - 6) + Math.abs(Math.floor(i / 13) - 3);
      bright += 0.16 * pulse(t, hit + dc * 0.035, 0, 0.35);
    } else {
      p.g.position.copy(p.tunnelPos);
    }
    p.g.quaternion.copy(_q);
    p.fm.color.setScalar(bright);
    p.bm.color.setScalar(bright);
    p.g.visible = bright > 0.004 || k > 0;
  }

  // ---- poeira
  S.dust.material.uniforms.uTime.value = t;
  S.dust.material.uniforms.uAlpha.value = 0.45 + 0.3 * phase(t, 3, 6) + 0.3 * hitP;

  // ---- letras cromadas
  const fx = S.fx;
  const sparkPos = fx.sparks.geometry.attributes.position.array;
  const sparkCol = fx.sparks.geometry.attributes.color.array;
  let impactI = 0;
  S.logo.letters.forEach((m, i) => {
    const f = S.flight[i];
    const t0 = f.land - f.dur;
    const home = m.userData.home;
    if (t < t0) {
      m.visible = false;
    } else if (t < f.land) {
      m.visible = true;
      const k = phase(t, t0, f.land, ease.slam);
      m.position.copy(home).addScaledVector(f.off, 1 - k);
      const kr = phase(t, t0, f.land - 0.04, ease.out);
      m.rotation.set(f.rot.x * (1 - kr), f.rot.y * (1 - kr), f.rot.z * (1 - kr));
    } else {
      m.visible = true;
      // recuo elástico após o impacto (mola Motion com velocidade inicial)
      const d = springAt(t, f.land, { from: 0, to: 0, velocity: -f.recoil, stiffness: 260, damping: 12 });
      _v.copy(f.off).normalize();
      m.position.copy(home).addScaledVector(_v, d);
      m.rotation.set(0, 0, 0);
    }
    const ip = pulse(t, f.land, 0, 0.18);
    m.userData.caps.emissiveIntensity = 1.4 * ip;
    impactI += ip;

    // anel de choque + clarão + faíscas
    const tau = t - f.land;
    const ring = fx.rings[i], fl = fx.flashes[i];
    if (tau >= 0 && tau < 0.9) {
      const k = tau / 0.9;
      ring.visible = true;
      ring.position.set(home.x, home.y, 0.15);
      ring.scale.setScalar(0.8 + 4.2 * ease.expoOut(k));
      ring.material.opacity = 0.3 * (1 - k) ** 2.2;
      fl.visible = true;
      fl.position.set(home.x, home.y, 1.2);
      fl.scale.setScalar(4 + 4 * k);
      fl.material.opacity = 0.55 * Math.exp(-tau / 0.1);
    } else { ring.visible = false; fl.visible = false; }
    for (let s = 0; s < fx.per; s++) {
      const j = i * fx.per + s, v = fx.vel[j];
      if (tau >= 0 && tau < 1.0) {
        const kk = (1 - Math.exp(-3.2 * tau)) / 3.2;
        sparkPos[j * 3] = home.x + v.x * kk;
        sparkPos[j * 3 + 1] = home.y + v.y * kk - 2.0 * tau * tau;
        sparkPos[j * 3 + 2] = 0.3 + Math.abs(v.z) * kk;
        const a = Math.max(0, 1 - tau / (0.45 + (s % 5) * 0.12)) ** 1.6;
        sparkCol[j * 3] = 1.5 * a; sparkCol[j * 3 + 1] = 1.75 * a; sparkCol[j * 3 + 2] = 2.3 * a;
      } else {
        sparkPos[j * 3] = sparkPos[j * 3 + 1] = sparkPos[j * 3 + 2] = 0;
        sparkCol[j * 3] = sparkCol[j * 3 + 1] = sparkCol[j * 3 + 2] = 0;
      }
    }
  });
  fx.sparks.geometry.attributes.position.needsUpdate = true;
  fx.sparks.geometry.attributes.color.needsUpdate = true;
  S.impactLight.intensity = 60 * Math.min(1.5, impactI);
  const lastHit = S.flight.reduce((a, f) => (t >= f.land ? f : a), S.flight[0]);
  S.impactLight.position.copy(S.logo.letters[S.flight.indexOf(lastHit)].userData.home).setZ(4);

  // ---- neon NEWS
  const [n0, n1] = cues.neonN, [e0, e1] = cues.neonEWS;
  const glassA = 0.42 * phase(t, 5.6, 6.0);
  const gapFlick = t >= cues.gap[0] && t < hit ? (rng(Math.floor(t * 60))() > 0.5 ? 0.18 : 0.45) : 1;
  const over = 1 + 0.6 * hitP;
  const breathe = 1 + 0.03 * Math.sin(t * 9.1) + 0.02 * Math.sin(t * 23.3);
  const heads = [S.head, S.head2, S.head3];
  heads.forEach((h) => { h.visible = false; });
  let nBright = 0, eBright = 0;
  const ewsTimes = { E: [e0, e0 + 0.42], W: [e0 + 0.12, e0 + 0.6], S: [e0 + 0.26, e1] };
  let hi = 0;
  for (const n of S.logo.neon) {
    n.glass.material.opacity = n.el === 'ECHO' ? 0.25 * phase(t, cues.echo - 0.2, cues.echo) : glassA;
    let frac, flick;
    if (n.el === 'N') {
      frac = phase(t, n0, n0 + 0.92, ease.inOut);
      flick = neonFlicker(t, n0, 501);
    } else if (n.el === 'EWS') {
      const [a, b] = ewsTimes[n.glyph];
      frac = phase(t, a, b, ease.inOut);
      flick = neonFlicker(t, a, 777 + a * 100);
    } else {
      frac = t >= cues.echo ? 1 : 0;
      flick = neonFlicker(t, cues.echo, 919) * phase(t, cues.echo, cues.echo + 0.4);
    }
    setNeonFraction(n, frac);
    const b = flick * gapFlick * over * breathe;
    n.litMat.color.copy(n.baseColor).multiplyScalar(Math.max(0.05, b));
    n.litMat.opacity = n.el === 'ECHO' ? 0.75 * b : 1;
    n.halo.material.uniforms.uI.value = Math.max(0, b) * (n.el === 'ECHO' ? 0.6 : 1);
    if (frac > 0 && frac < 1 && hi < heads.length && n.el !== 'ECHO') {
      const h = heads[hi++];
      h.visible = true;
      h.position.copy(n.curve.getPointAt(frac)).setZ(0.7);
      h.material.opacity = 0.95;
      h.scale.setScalar(1.6 + 0.5 * Math.sin(t * 80));
    }
    if (n.el === 'N') nBright = frac * b;
    if (n.el === 'EWS') eBright = Math.max(eBright, frac * b);
  }
  S.neonLightN.intensity = 70 * nBright;
  S.neonLightE.intensity = 50 * eBright;
  S.redGlow.material.uniforms.uOpacity.value = 0.07 * Math.max(nBright, eBright) + 0.12 * hitP;
  S.redGlow.scale.set(30 + 8 * hitP, 18 + 6 * hitP, 1);
  S.hitGlow.material.uniforms.uOpacity.value = 0.18 * hitP;

  // ---- flares anamórficos no impacto final (espaço de mundo, voltados à câmera)
  S.logo.group.updateMatrixWorld();
  const nWorld = S.nCenter.clone().applyMatrix4(S.logo.group.matrixWorld);
  S.flare.position.copy(nWorld).setZ(nWorld.z + 1.5);
  S.flare.quaternion.copy(camera.quaternion);
  S.flare.scale.set(110, 2.2, 1);
  S.flare.material.uniforms.uOpacity.value = 0.7 * hitP;
  S.flareBlue.position.set(0, 0, 2);
  S.flareBlue.quaternion.copy(camera.quaternion);
  S.flareBlue.scale.set(150, 1.6, 1);
  S.flareBlue.material.uniforms.uOpacity.value = 0.5 * pulse(t, hit, 0.02, 0.45);
}

// ------------------------------------------------------------ render
/** QA: projeta pontos-âncora (cantos dos contornos) de cada glifo para a tela no tempo t. */
export function projectAnchors(t) {
  update(t);
  const out = [];
  const v = new THREE.Vector3();
  for (const m of S.logo.letters) {
    m.geometry.computeBoundingBox();
    const pos = m.geometry.attributes.position;
    const pts = [];
    for (let i = 0; i < pos.count; i += 7) {
      if (pos.getZ(i) < -1e-4) continue;            // só a face frontal (z = 0)
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix);          // plano da logo (sem rotação)
      const lx = v.x, ly = v.y;
      v.applyMatrix4(S.logo.group.matrixWorld).project(S.camera);
      pts.push([(v.x + 1) / 2 * S.width, (1 - v.y) / 2 * S.height, lx, ly]);
    }
    out.push({ glyph: m.userData.glyph, home: m.userData.home.toArray(), pts });
  }
  for (const n of S.logo.neon) {
    const pts = [];
    for (let k = 0; k < 64; k++) {
      v.copy(n.curve.getPointAt(k / 64));
      const lx = v.x, ly = v.y;
      v.applyMatrix4(S.logo.group.matrixWorld).project(S.camera);
      pts.push([(v.x + 1) / 2 * S.width, (1 - v.y) / 2 * S.height, lx, ly]);
    }
    out.push({ glyph: 'neon:' + n.el + ':' + n.glyph, pts });
  }
  return out;
}

function applyDebug() {
  const d = globalThis.RVA_DEBUG;
  if (!d) return;
  if (d.noBloom) S.bloom.strength = 0;
  if (d.noSky) S.sky.visible = false;
  if (d.noNeon) for (const n of S.logo.neon) { n.lit.visible = n.halo.visible = false; }
  if (d.noDust) S.dust.visible = false;
  if (d.noPanels) S.panels.group.visible = false;
}

export function renderFrame(t) {
  update(t);
  applyDebug();
  S.composer.render();
  const gl = S.renderer.getContext();
  const px = new Uint8Array(S.width * S.height * 4);
  gl.readPixels(0, 0, S.width, S.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}

export function renderOnly(t) {
  update(t);
  S.composer.render();
}
