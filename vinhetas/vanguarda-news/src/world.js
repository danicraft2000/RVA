// Cenário: céu, ambiente de reflexo (PMREM), piso de sinais, feixes de dados,
// campo de telas de redação, poeira luminosa e efeitos de impacto.
import * as THREE from 'three';
import { rng } from './timeline.js';
import { makePanelTextures, PANEL_ASPECT } from './panels.js';

export const FLOOR_Y = -16;

// ------------------------------------------------------------------ texturas
function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);       // cabeça em v=1 (topo)
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.06, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 512);
  const h = ctx.createLinearGradient(0, 0, 32, 0);         // borda macia lateral
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 32, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const textures = {};
export function initTextures() {
  textures.glow = radialTexture([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  textures.dot = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']], 64);
  textures.streak = streakTexture();
  // flare anamórfico: faixa horizontal
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 64;
  const ctx = c.getContext('2d');
  const gh = ctx.createLinearGradient(0, 0, 1024, 0);
  gh.addColorStop(0, 'rgba(255,255,255,0)'); gh.addColorStop(0.5, 'rgba(255,255,255,1)'); gh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gh; ctx.fillRect(0, 0, 1024, 64);
  const gv = ctx.createLinearGradient(0, 0, 0, 64);
  gv.addColorStop(0, 'rgba(0,0,0,1)'); gv.addColorStop(0.5, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = gv; ctx.fillRect(0, 0, 1024, 64);
  textures.flare = new THREE.CanvasTexture(c);
  textures.flare.colorSpace = THREE.SRGBColorSpace;
}

/** Brilho analítico (calculado em ponto flutuante: sem banding de textura 8 bits). */
export function makeGlow(color, { stretch = 1, falloff = 4 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uStretch: { value: stretch }, uFall: { value: falloff } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform vec3 uColor; uniform float uOpacity; uniform float uStretch; uniform float uFall;
      void main(){
        vec2 d = (vUv - 0.5) * 2.0;
        float r2 = d.x * d.x + d.y * d.y * uStretch;
        float a = exp(-r2 * uFall) * (1.0 - smoothstep(0.7, 1.0, max(abs(d.x), abs(d.y))));
        a += 0.35 * exp(-r2 * uFall * 6.0);
        gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------- céu / ambiente
export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uGlow: { value: 0 }, uRed: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir; uniform float uGlow; uniform float uRed;
      void main(){
        float h = vDir.y;
        vec3 top = vec3(0.0003,0.0004,0.0012);
        vec3 hor = vec3(0.0024,0.0048,0.0125);
        vec3 col = mix(hor, top, smoothstep(-0.05, 0.55, h));
        col = mix(col, vec3(0.002,0.003,0.006), smoothstep(-0.02,-0.25,h));
        // brilho atrás da logo (direção -z)
        float c = pow(max(dot(normalize(vDir), vec3(0.0,0.05,-1.0)),0.0), 6.0);
        col += vec3(0.0045,0.010,0.026) * c * (0.6 + uGlow);
        col += vec3(0.020,0.0012,0.0016) * pow(c, 3.0) * uRed;
        gl_FragColor = vec4(col,1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  return sky;
}

/** Estúdio virtual só para reflexos do cromado (PMREM). */
export function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 p; void main(){
      vec3 c = mix(vec3(0.004,0.006,0.012), vec3(0.035,0.045,0.07), smoothstep(-0.2,0.9,p.y));
      c = mix(c, vec3(0.001), smoothstep(0.0,-0.5,p.y));
      c += vec3(0.04,0.08,0.18) * exp(-pow(p.y*9.0,2.0));
      // grande difusor frontal em degradê (reflexo principal das faces)
      float front = smoothstep(0.0, 0.85, p.z) * smoothstep(-0.5, 0.75, p.y);
      c += vec3(0.62,0.68,0.78) * front * front;
      gl_FragColor = vec4(c,1.); }`,
  }));
  env.add(room);
  const box = (w, h, color, intensity, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m); return m;
  };
  box(26, 5, 0xffffff, 2.6, [0, 30, -6], [Math.PI / 2, 0, 0]);          // softbox zenital
  box(2.2, 34, 0xe8f0ff, 3.4, [-28, 6, 10], [0, Math.PI / 2.4, 0]);     // faixa esquerda fria
  box(1.6, 30, 0xfff1e0, 2.6, [26, 4, 16], [0, -Math.PI / 2.5, 0]);     // faixa direita quente
  box(60, 1.2, 0x7fb6ff, 1.6, [0, -2, -40], [0, 0, 0]);                 // horizonte azul
  box(14, 1.0, 0xff3030, 2.2, [18, -6, -30], [0, -0.4, 0.15]);          // faixa vermelha
  box(1.2, 18, 0xffffff, 2.2, [6, 10, 44], [0, Math.PI, 0.5]);          // fio de luz frontal (diagonal)
  box(8, 3, 0xbcd4ff, 0.6, [-10, -6, 44], [0, Math.PI, 0]);             // rebatedor baixo
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.015);
  pm.dispose();
  return rt.texture;
}

// ------------------------------------------------------------------- piso
export function buildFloor() {
  const mat = new THREE.ShaderMaterial({
    transparent: false, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uBright: { value: 1 }, uTime: { value: 0 }, uPulse: { value: 0 },
      uWaveR: { value: new THREE.Vector4(-1, -1, -1, -1) }, uWaveA: { value: new THREE.Vector4() } },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; uniform vec3 uCam; uniform float uBright; uniform float uTime; uniform float uPulse;
      uniform vec4 uWaveR; uniform vec4 uWaveA;
      float line(float x, float w){ float d = abs(fract(x - 0.5) - 0.5); float fw = fwidth(x); return 1.0 - smoothstep(w, w + fw * 1.5, d); }
      void main(){
        vec2 p = vW.xz;
        float d = length(vW - uCam);
        float fade = exp(-d / 95.0);
        float minor = max(line(p.x / 4.0, 0.012), line(p.y / 4.0, 0.012));
        float major = max(line(p.x / 20.0, 0.006), line(p.y / 20.0, 0.006));
        vec3 base = vec3(0.006, 0.010, 0.022);
        vec3 g = vec3(0.05, 0.11, 0.26) * (minor * 0.3 + major * 0.8) * fade * uBright;
        // onda de pulso que corre pelo piso em direção à logo
        float wave = exp(-pow((p.y + uTime * 60.0 - 180.0) / 6.0, 2.0)) * uPulse;
        g += vec3(0.25, 0.45, 1.0) * wave * fade * (0.4 + major);
        // ondas de radar (tempos da introdução), centradas à frente da câmera
        float rr = length(p - vec2(2.0, 128.0));
        vec4 wv = exp(-pow((vec4(rr) - uWaveR) / 1.6, vec4(2.0))) * uWaveA;
        g += vec3(0.25, 0.5, 1.0) * (wv.x + wv.y + wv.z + wv.w) * (0.35 + major) * fade;
        // brilho de chão sob a logo
        float under = exp(-length(p - vec2(0.0, -2.0)) / 26.0);
        base += vec3(0.008, 0.014, 0.034) * under;
        gl_FragColor = vec4(base + g, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  return floor;
}

// ---------------------------------------------------------- feixes de dados
export function buildStreaks(count = 260, seed = 11) {
  const r = rng(seed);
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, -0.5, 0);           // cabeça na origem, cauda para trás
  const mat = new THREE.MeshBasicMaterial({
    map: textures.streak, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: true,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    map: textures.streak, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.3,
  });
  const core = new THREE.InstancedMesh(geo, mat, count);
  const glow = new THREE.InstancedMesh(geo, glowMat, count);
  const data = [];
  const palette = [new THREE.Color(0.75, 0.9, 1.6), new THREE.Color(0.5, 0.75, 1.8), new THREE.Color(1.8, 0.18, 0.16), new THREE.Color(1.4, 1.5, 1.7)];
  for (let i = 0; i < count; i++) {
    const lane = (r() * 2 - 1) * (r() < 0.6 ? 30 : 75);
    const red = r() < 0.16;
    data.push({
      x: Math.round(lane / 2) * 2 + (r() - 0.5) * 0.3,
      speed: 55 + r() * 95,
      len: 6 + r() * 22,
      width: 0.10 + r() * 0.16,
      phase: r() * 400,
      color: red ? palette[2] : palette[Math.floor(r() * 2)].clone().lerp(palette[3], r() * 0.5),
      lift: r() < 0.25 ? 0.4 + r() * 5 : 0.02,
    });
  }
  core.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  core.frustumCulled = glow.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    pos = new THREE.Vector3(), scl = new THREE.Vector3(), c = new THREE.Color();
  const Z0 = 230, SPAN = 420;
  function update(t, cam, intensity) {
    for (let i = 0; i < count; i++) {
      const d = data[i];
      const z = Z0 - ((d.phase + t * d.speed) % SPAN);
      pos.set(d.x, FLOOR_Y + d.lift, z);
      scl.set(d.width, d.len, 1);
      m.compose(pos, q, scl);
      core.setMatrixAt(i, m);
      scl.set(d.width * 9, d.len * 1.15, 1);
      pos.y = FLOOR_Y + 0.01;
      m.compose(pos, q, scl);
      glow.setMatrixAt(i, m);
      const dist = Math.hypot(d.x - cam.x, z - cam.z);
      const fade = Math.exp(-dist / 140) * Math.min(1, (Z0 - 10 - z) / 30);
      c.copy(d.color).multiplyScalar(intensity * Math.max(0, fade));
      core.setColorAt(i, c);
      glow.setColorAt(i, c);
    }
    core.instanceMatrix.needsUpdate = glow.instanceMatrix.needsUpdate = true;
    core.instanceColor.needsUpdate = glow.instanceColor.needsUpdate = true;
  }
  const group = new THREE.Group();
  group.add(glow, core);
  update(0, new THREE.Vector3(), 0);
  return { group, update };
}

// ------------------------------------------------------- telas de redação
export function buildPanels(renderer, count = 91, seed = 23) {
  const r = rng(seed);
  const texs = makePanelTextures(renderer);
  // versões desfocadas (simulam profundidade de campo na parede de fundo)
  const blurred = texs.map((t) => {
    const c = document.createElement('canvas');
    c.width = t.image.width; c.height = t.image.height;
    const ctx = c.getContext('2d');
    ctx.filter = 'blur(14px)';
    ctx.drawImage(t.image, 0, 0);
    const b = new THREE.CanvasTexture(c);
    b.colorSpace = THREE.SRGBColorSpace;
    return b;
  });
  const w = 6.4, h = w / PANEL_ASPECT;
  const plane = new THREE.PlaneGeometry(w, h);
  const frameGeo = new THREE.BoxGeometry(w + 0.22, h + 0.22, 0.12);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b0f17, metalness: 0.6, roughness: 0.55, envMapIntensity: 0.12 });
  const panels = [];
  const group = new THREE.Group();

  // túnel em torno do percurso da câmera (z 90..140)
  const axisAt = (z) => {
    const k = THREE.MathUtils.clamp((z - 92) / (132 - 92), 0, 1);
    return new THREE.Vector2(THREE.MathUtils.lerp(-11, 0, k), THREE.MathUtils.lerp(-1.5, -9, k));
  };
  // parede final atrás da logo (arco cilíndrico voltado para a câmera final)
  const COLS = 13, ROWS = 7;
  const wallCenter = new THREE.Vector3(-4, -2, 62), wallR = 132;

  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const fi = Math.floor(r() * texs.length);
    let bi = Math.floor(r() * texs.length);
    if (bi === fi) bi = (bi + 3) % texs.length;
    const fm = new THREE.MeshBasicMaterial({ map: texs[fi], color: new THREE.Color(1, 1, 1), toneMapped: true });
    const bm = new THREE.MeshBasicMaterial({ map: texs[bi], color: new THREE.Color(1, 1, 1), toneMapped: true });
    const front = new THREE.Mesh(plane, fm); front.position.z = 0.065;
    const back = new THREE.Mesh(plane, bm); back.position.z = -0.065; back.rotation.y = Math.PI;
    const fr = new THREE.Mesh(frameGeo, frameMat);
    g.add(fr, front, back);

    // posição no túnel (amostragem com distância mínima: telas não se atravessam)
    let z, a, rad, ax, tunnelPos;
    for (let tries = 0; tries < 60; tries++) {
      z = 76 + r() * 62;
      a = r() * Math.PI * 2;
      rad = 7.5 + r() * 13;
      ax = axisAt(z);
      tunnelPos = new THREE.Vector3(ax.x + Math.cos(a) * rad, Math.max(-14, ax.y + Math.sin(a) * rad * 0.75), z);
      if (panels.every((q) => q.tunnelPos.distanceTo(tunnelPos) > 7.4)) break;
    }
    const look = new THREE.Vector3(ax.x, ax.y, z + 6);
    const m = new THREE.Matrix4().lookAt(tunnelPos, look, new THREE.Vector3(0, 1, 0));
    const tunnelQ = new THREE.Quaternion().setFromRotationMatrix(m);
    tunnelQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, (r() - 0.5) * 0.5)));
    tunnelQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, (r() - 0.5) * 0.6, 0)));

    // posição na parede de fundo
    const col = i % COLS, row = Math.floor(i / COLS) % ROWS;
    const ang = (col - (COLS - 1) / 2) * 0.056;
    const wallPos = new THREE.Vector3(
      wallCenter.x + Math.sin(ang) * wallR,
      -13.5 + row * 4.3,
      wallCenter.z - Math.cos(ang) * wallR,
    );
    const wallQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(wallPos, new THREE.Vector3(wallCenter.x, wallPos.y, wallCenter.z), new THREE.Vector3(0, 1, 0)));
    wallQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)));

    g.position.copy(tunnelPos);
    g.quaternion.copy(tunnelQ);
    group.add(g);
    const outward = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.6 + 0.35, 0).normalize();
    panels.push({
      g, fm, bm, tunnelPos, tunnelQ, wallPos, wallQ, outward,
      flipBeat: i % 4, flipDelay: r() * 0.08, migDelay: THREE.MathUtils.clamp((z - 76) / 62 * 0.8 + r() * 0.2, 0, 1), dim: 0.55 + r() * 0.45,
      blurF: blurred[fi], blurB: blurred[bi], sharpF: texs[fi], sharpB: texs[bi], wallOn: r() < 0.18 ? 0.25 : 1,
      spin: (r() - 0.5) * 2,
    });
  }
  return { group, panels };
}

// ------------------------------------------------------------ poeira / bokeh
export function buildDust(count = 900, seed = 31) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() * 2 - 1) * 70;
    pos[i * 3 + 1] = -15 + r() * 48;
    pos[i * 3 + 2] = -60 + r() * 220;
    seeds[i * 4] = r(); seeds[i * 4 + 1] = r(); seeds[i * 4 + 2] = r(); seeds[i * 4 + 3] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMap: { value: textures.dot }, uScale: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec4 seed; uniform float uTime; uniform float uScale; varying float vA; varying vec3 vC;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * (0.2 + seed.x * 0.4) + seed.y * 6.28) * 1.6;
        p.y += uTime * (0.15 + seed.z * 0.35) + cos(uTime * 0.3 + seed.w * 6.28) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float big = step(0.93, seed.w);
        gl_PointSize = uScale * (0.06 + 0.22 * big + seed.x * 0.05) * 900.0 / -mv.z;
        vA = (0.25 + 0.75 * seed.z) * (big > 0.5 ? 0.35 : 1.0) * smoothstep(2.0, 12.0, -mv.z);
        vC = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.35, 0.3), step(0.85, seed.y));
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uAlpha; varying float vA; varying vec3 vC;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * t.a * vA * uAlpha, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// --------------------------------------------------------- efeitos de impacto
export function buildImpactFX(count, seed = 41) {
  const r = rng(seed);
  const group = new THREE.Group();
  const rings = [], flashes = [];
  const ringGeo = new THREE.RingGeometry(0.965, 1.0, 128);
  for (let i = 0; i < count; i++) {
    const rm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.7, 2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, rm);
    ring.visible = false;
    group.add(ring); rings.push(ring);
    const fm = new THREE.SpriteMaterial({ map: textures.glow, color: new THREE.Color(1.6, 1.9, 2.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const fl = new THREE.Sprite(fm);
    fl.visible = false;
    group.add(fl); flashes.push(fl);
  }
  // faíscas: 60 por impacto, cinemática analítica
  const per = 60, n = count * per;
  const pos = new Float32Array(n * 3), vel = [], col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, sp = 6 + r() * 16, up = (r() - 0.3) * 8;
    vel.push(new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp, up));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.16, map: textures.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  sparks.frustumCulled = false;
  group.add(sparks);
  return { group, rings, flashes, sparks, vel, per };
}
