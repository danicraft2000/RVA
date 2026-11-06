// Pós-processamento: bloom HDR, tone mapping ACES e acabamento (vinheta, dither).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.42 },
    uFlash: { value: 0 },
    uAberr: { value: 0.00035 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSeed: { value: 0 },
    uFade: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uFlash; uniform float uAberr;
    uniform vec2 uRes; uniform float uSeed; uniform float uFade;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423) + uSeed); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // aberração cromática sutil nas bordas
      vec2 off = c * r2 * uAberr * 40.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float vig = 1.0 - uVignette * smoothstep(0.08, 0.62, r2 * 1.6);
      col *= vig;
      col = mix(col, vec3(1.0), uFlash);
      col *= uFade;
      // dither (evita banding em gradientes escuros de 8 bits)
      col += (hash(vUv * uRes) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function buildComposer(renderer, scene, camera, width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  composer.setSize(width, height);
  const render = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.0, 0.92);
  // peso por mip: brilho concentrado perto da fonte, sem véu no quadro inteiro
  bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.75, 0.38, 0.14, 0.05];
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uRes.value.set(width, height);
  composer.addPass(render);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);
  // bloom com resolução interna fixa: o halo tem o mesmo tamanho relativo em qualquer saída
  bloom.setSize(960, 540);
  return { composer, bloom, grade };
}
