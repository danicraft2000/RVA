// Ponto de entrada da página de render: expõe a API window.RVA para o Playwright.
import { init, renderFrame, renderOnly, projectAnchors, FPS, DURATION } from './main.js';

window.RVA = {
  FPS, DURATION,
  async init(width, height) {
    const canvas = document.createElement('canvas');
    canvas.style.width = '640px';
    document.body.appendChild(canvas);
    return init({ width, height, canvas });
  },
  /** Renderiza a lista de quadros e envia os pixels RGBA (binário) ao servidor local. */
  async run(frames, endpoint = '/frame') {
    for (const f of frames) {
      const px = renderFrame(f / FPS);
      const res = await fetch(`${endpoint}/${f}`, { method: 'POST', body: px });
      if (!res.ok) throw new Error(`frame ${f}: HTTP ${res.status}`);
    }
    return frames.length;
  },
  renderOnly,
  projectAnchors,
};
window.RVA_READY = true;
