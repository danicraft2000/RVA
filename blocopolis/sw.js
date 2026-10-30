// Blocópolis — guarda os arquivos do jogo para funcionar sem internet
const CACHE = 'blocopolis-v1';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'lib/three.min.js',
  'js/noise.js',
  'js/blocks.js',
  'js/structures.js',
  'js/world.js',
  'js/save.js',
  'js/city.js',
  'js/life.js',
  'js/controls.js',
  'js/ui.js',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (para pegar atualizações); sem internet, usa a cópia guardada
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
