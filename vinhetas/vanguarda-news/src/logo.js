// Logo VANGUARDA NEWS: letras cromadas extrudadas + tubos de neon do NEWS.
// Geometria e proporções vêm de assets/logo-geometry.json (medidas na referência).
import * as THREE from 'three';
import geo from '../assets/logo-geometry.json';

export const S = 0.01;                                  // unidade de fonte → mundo
export const LOGO_ANGLE = THREE.MathUtils.degToRad(-geo.angleDeg); // y-up: anti-horário
export const CENTER = geo.center;

const EXTRUDE = {
  depth: 150, bevelEnabled: true, bevelThickness: 22, bevelSize: 13, bevelOffset: -13,
  bevelSegments: 6, curveSegments: 14,
};

function glyphShapes(name) {
  const sp = new THREE.ShapePath();
  for (const c of geo.glyphs[name].path) {
    if (c[0] === 'M') sp.moveTo(c[1], c[2]);
    else if (c[0] === 'L') sp.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') sp.quadraticCurveTo(c[1], c[2], c[3], c[4]);
  }
  return sp.toShapes(false);
}

const toWorld = (x, y) => new THREE.Vector2((x - CENTER[0]) * S, (y - CENTER[1]) * S);

export function buildLogo(envIntensity = 1) {
  const group = new THREE.Group();          // gira no ângulo da composição
  group.rotation.z = LOGO_ANGLE;
  const letters = [];
  const neon = [];

  const capBase = new THREE.MeshPhysicalMaterial({
    color: 0xdfe5ee, metalness: 1.0, roughness: 0.17, clearcoat: 0.35, clearcoatRoughness: 0.08,
    envMapIntensity: envIntensity,
  });
  const sideBase = new THREE.MeshPhysicalMaterial({
    color: 0x9aa6b8, metalness: 1.0, roughness: 0.26, envMapIntensity: envIntensity * 0.9,
  });

  for (const el of geo.elements) {
    if (el.kind !== 'silver') continue;
    for (const gl of el.glyphs) {
      const g = new THREE.ExtrudeGeometry(glyphShapes(gl.g), EXTRUDE);
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
      // pivô no centro da letra, face frontal em z = 0
      g.translate(-cx, -cy, -bb.max.z);
      g.scale(S * el.scale, S * el.scale, S);
      const caps = capBase.clone(), sides = sideBase.clone();
      caps.emissive = new THREE.Color(0x9fc8ff);
      caps.emissiveIntensity = 0;
      const mesh = new THREE.Mesh(g, [caps, sides]);
      const home = toWorld(gl.x + cx * el.scale, gl.y + cy * el.scale);
      mesh.position.set(home.x, home.y, 0);
      mesh.userData = { home: new THREE.Vector3(home.x, home.y, 0), glyph: gl.g, caps, sides };
      group.add(mesh);
      letters.push(mesh);
    }
  }

  // ---- neon
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2a1418, metalness: 0.0, roughness: 0.15, transparent: true, opacity: 0.0,
    envMapIntensity: 1.2, depthWrite: false,
  });
  for (const el of geo.elements) {
    if (el.kind === 'silver') continue;
    const isEcho = el.kind === 'echo';
    const z = isEcho ? 0.22 : 0.42;
    const r = el.tubeRadius * S;
    for (const gl of el.glyphs) {
      for (const ring of gl.neon) {
        const pts = ring.points.map(([x, y]) => { const p = toWorld(x, y); return new THREE.Vector3(p.x, p.y, z); });
        const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
        const segs = Math.max(64, pts.length * 3);
        const tubeGeo = new THREE.TubeGeometry(curve, segs, r, 10, true);
        const litMat = new THREE.MeshBasicMaterial({
          color: isEcho ? new THREE.Color(2.0, 0.1, 0.08) : new THREE.Color(3.6, 0.2, 0.15),
          transparent: true, opacity: 1,
        });
        const lit = new THREE.Mesh(tubeGeo, litMat);
        lit.geometry.setDrawRange(0, 0);
        // halo: tubo mais largo com queda suave pelo ângulo de visão (brilho do gás)
        const haloGeo = new THREE.TubeGeometry(curve, segs, r * (isEcho ? 3.0 : 3.6), 10, true);
        const haloMat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          uniforms: { uColor: { value: new THREE.Color(isEcho ? 0.5 : 1.15, 0.035, 0.03) }, uI: { value: 0 } },
          vertexShader: `varying float vF; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
            vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz)));
            gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `varying float vF; uniform vec3 uColor; uniform float uI;
            void main(){ float a = pow(vF, 3.0); gl_FragColor = vec4(uColor * a * uI, 1.0); }`,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.geometry.setDrawRange(0, 0);
        halo.renderOrder = 3;
        const glass = new THREE.Mesh(tubeGeo, glassMat.clone());
        glass.renderOrder = 1;
        lit.renderOrder = 2;
        group.add(glass, lit, halo);
        neon.push({ el: el.name, glyph: gl.g, curve, segs, lit, glass, halo, litMat, baseColor: litMat.color.clone(), length: ring.length });
      }
    }
  }
  return { group, letters, neon };
}

/** Acende `frac` (0..1) do tubo a partir do ponto inicial. */
export function setNeonFraction(n, frac) {
  const f = THREE.MathUtils.clamp(frac, 0, 1);
  const idx = n.lit.geometry.index;
  const perSeg = 10 * 6;
  const count = Math.min(idx.count, Math.ceil(f * n.segs) * perSeg);
  n.lit.geometry.setDrawRange(0, count);
  n.halo.geometry.setDrawRange(0, count);
  n.lit.visible = n.halo.visible = f > 0;
}

export function logoGeometryInfo() {
  return { angleDeg: geo.angleDeg, bbox: geo.bboxRotated };
}
