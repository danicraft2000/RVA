// Renderiza a vinheta quadro a quadro no Chromium headless (WebGL) e codifica com FFmpeg.
//
//   node render/render.mjs                         → MP4 final 3840x2160 @ 30 fps com áudio
//   node render/render.mjs --width 1280            → render reduzido (teste)
//   node render/render.mjs --preview 0,2.5,8.2     → PNGs dos instantes (s) em output/preview/
//   node render/render.mjs --contact               → folha de contato (1 quadro a cada 0,5 s)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const WIDTH = +(args.width || 3840);
const HEIGHT = Math.round(WIDTH * 9 / 16);
const OUT_DIR = path.join(ROOT, 'output');
const NAME = args.name || 'RVA_Vanguarda_News_2160p30';
fs.mkdirSync(OUT_DIR, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.wav': 'audio/wav' };

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} saiu com ${c}`))));
  });
}

const mezzaninePath = () => path.join(OUT_DIR, 'mezzanine', `${NAME}.lossless.mkv`);

/** 2ª etapa: MP4 de entrega (H.264 High 5.1, 4:2:0, BT.709) + trilha AAC 320 kb/s. */
async function encodeDelivery() {
  const t0 = Date.now();
  const final = path.join(OUT_DIR, `${NAME}.mp4`);
  await run('ffmpeg', ['-v', 'error', '-y', '-i', mezzaninePath(), '-i', path.join(ROOT, 'assets/audio/vanguarda-news-theme.wav'),
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', args.preset || 'slow', '-crf', String(args.crf || 16), '-profile:v', 'high', '-level:v', '5.1',
    '-x264-params', 'keyint=30:min-keyint=1:aq-mode=3:aq-strength=0.9:deblock=-1,-1',
    '-bsf:v', 'h264_metadata=sample_aspect_ratio=1/1',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-r', '30',
    '-movflags', '+faststart', '-metadata', 'title=VANGUARDA NEWS — RVA Remake',
    '-metadata', 'comment=Remake programado (Three.js + Motion + FFmpeg). Trilha original sintetizada.', final]);
  console.log(`MP4 final: ${final}  (${fs.statSync(final).size / 1e6} MB, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}

async function main() {
  if (args['encode-only']) return encodeDelivery();
  // 1) bundle
  await run('npx', ['esbuild', 'src/entry.js', '--bundle', '--format=esm', '--outfile=dist/bundle.js', '--log-level=warning'], { cwd: ROOT });

  // 2) consumidor de quadros
  let onFrame;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/frame/')) {
      const idx = +req.url.split('/').pop();
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        try { await onFrame(idx, Buffer.concat(chunks)); res.end('ok'); } catch (e) { console.error(e); res.statusCode = 500; res.end(); }
      });
      return;
    }
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  // 3) navegador
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => { if (!/GPU stall|GL Driver/.test(m.text())) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  if (args.debug) await page.addInitScript((d) => { window.RVA_DEBUG = d; }, JSON.parse(args.debug));
  await page.goto(`http://127.0.0.1:${port}/render/page.html`);
  await page.waitForFunction(() => window.RVA_READY === true, null, { timeout: 120000 });
  const info = await page.evaluate(([w, h]) => window.RVA.init(w, h), [WIDTH, HEIGHT]);
  const total = info.frames;
  console.log(`cena pronta: ${WIDTH}x${HEIGHT}, ${total} quadros`);

  const toPng = (buf, file) => new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${WIDTH}x${HEIGHT}`, '-i', '-',
      '-vf', 'vflip', '-frames:v', '1', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    ff.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('png'))));
    ff.stdin.end(buf);
  });

  if (args.anchors) {
    const t = Number(args.anchors);
    const data = await page.evaluate((tt) => window.RVA.projectAnchors(tt), t);
    const f = path.join(OUT_DIR, `anchors_${t}.json`);
    fs.writeFileSync(f, JSON.stringify({ t, width: WIDTH, height: HEIGHT, items: data }));
    console.log('âncoras salvas em', f);
  } else if (args.preview || args.contact) {
    const times = args.contact
      ? Array.from({ length: Math.floor(info.frames / 15) + 1 }, (_, i) => Math.min(i * 15, total - 1) / 30)
      : String(args.preview).split(',').map(Number);
    const dir = path.join(OUT_DIR, 'preview');
    fs.mkdirSync(dir, { recursive: true });
    const frames = times.map((s) => Math.min(total - 1, Math.round(s * 30)));
    onFrame = (i, buf) => toPng(buf, path.join(dir, `f${String(i).padStart(4, '0')}.png`));
    const t0 = Date.now();
    await page.evaluate((fr) => window.RVA.run(fr), frames);
    console.log(`prévia: ${frames.length} quadros em ${((Date.now() - t0) / 1000).toFixed(1)} s → ${dir}`);
  } else {
    const from = +(args.from || 0), to = +(args.to || total);
    // 1ª etapa: master intermediário SEM PERDAS (RGB) — permite recodificar sem re-renderizar
    const mezz = mezzaninePath();
    fs.mkdirSync(path.dirname(mezz), { recursive: true });
    const ff = spawn('ffmpeg', ['-v', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${WIDTH}x${HEIGHT}`, '-framerate', '30', '-i', '-',
      '-vf', 'vflip,format=rgb24', '-c:v', 'libx264rgb', '-preset', 'ultrafast', '-qp', '0', '-r', '30', mezz],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((r, j) => ff.on('exit', (c) => (c === 0 ? r() : j(new Error('ffmpeg')))));
    let next = from, written = 0;
    const t0 = Date.now();
    onFrame = async (i, buf) => {
      if (i !== next) throw new Error(`quadro fora de ordem ${i} != ${next}`);
      if (buf.length !== WIDTH * HEIGHT * 4) throw new Error(`tamanho inválido ${buf.length}`);
      next++;
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      written++;
      if (written % 15 === 0 || i === to - 1) {
        const el = (Date.now() - t0) / 1000;
        console.log(`quadro ${i + 1}/${to}  ${(el / written).toFixed(2)} s/quadro  ETA ${((to - from - written) * el / written / 60).toFixed(1)} min`);
      }
    };
    // lotes de 15 quadros por chamada (evita timeouts longos do evaluate)
    for (let s = from; s < to; s += 15) {
      const batch = Array.from({ length: Math.min(15, to - s) }, (_, k) => s + k);
      await page.evaluate((fr) => window.RVA.run(fr), batch);
    }
    ff.stdin.end();
    await done;
    console.log(`master sem perdas: ${mezz}  (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    await browser.close();
    server.close();
    await encodeDelivery();
    return;
  }
  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
