// Service worker: la app funciona sin conexión (el plató y la galería); las generaciones necesitan red.
const V = 'plato-studio-v14';
const SHELL = ['./', 'index.html', 'plato.html', 'css/app.css', 'js/app.js', 'js/core.js', 'js/catalog.js', 'js/providers.js', 'js/llm.js', 'js/studio.js', 'js/gallery.js', 'js/editor.js', 'js/chars.js', 'js/settings.js', 'js/director.js', 'js/mcp.js', 'js/lab.js', 'js/runner.js', 'js/registry.js', 'js/book.js', 'js/vendor/oga-models.js', 'js/qr.js', 'js/games.js', 'js/guide.js', 'js/home.js', 'js/local.js', 'js/subs.js', 'js/stock.js', 'js/device.js', 'js/learn.js', 'js/classroom.js', 'js/brands.js', 'js/brandart.js', 'js/localai.js', 'js/recast.js', 'js/taller.js', 'js/taller/circuit.js', 'js/taller/sim.js', 'js/taller/examples.js', 'js/vendor/avr8js.js', 'js/vendor/rp2040js.js', 'js/vendor/wokwi-elements.js', 'js/vendor/velxio-breadboards.js', 'taller/micropython-rp2040.bin', 'taller/art/pi-pico.svg', 'taller/art/breadboard-mini.svg', 'taller/art/breadboard-full.svg', 'taller/hex/blink.hex.txt', 'js/assistant.js', 'learn.html', 'ads.html', 'movil.html', 'movil.webmanifest', 'play.html', 'games/kit.js', 'games/pad.js', 'games/host.js', 'games/runtime.html', 'games/examples/ciudad.js', 'games/examples/pintabolas.js', 'vendor/three/three.module.min.js', 'vendor/three/addons/controls/OrbitControls.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'proxy/worker.js'];
const CDN = []; // three.js va incluido en vendor/: ya no depende de un CDN
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).then(() => Promise.all(CDN.map(u => c.add(u).catch(() => {})))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET') return;
  const same = u.origin === location.origin, cdn = u.hostname === 'cdn.jsdelivr.net';
  if (!same && !cdn) return; // las APIs de IA nunca se cachean
  if (cdn) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(e.request, c)); return res; }))); return; }
  // red primero (para recibir actualizaciones), caché si no hay conexión
  e.respondWith(fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(e.request, c)); } return res; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
