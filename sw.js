// Service worker: rende l'app disponibile anche senza connessione a internet.
// Le richieste verso la stampante (fpmate.cgi) non passano mai dalla cache.

const VERSION = 'fpwizard-v18';
const FONT_CACHE = 'fpwizard-fonts'; // il carattere resta in cache anche tra una versione e l'altra
const LOGOS = ['01_epson', '02_pasqua', '03_halloween', '04_natalea', '05_nataleb', '06_valentino', '07_palloncini', '08_vacanze', '09_torta']
  .flatMap((n) => [`assets/logos/${n}_80.bin`, `assets/logos/${n}_58_60.bin`]);
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/state.js', 'js/fpmate.js', 'js/commands.js', 'js/simulator.js', 'js/logo.js', 'js/keyboards.js', 'js/sync.js',
  'js/views/general.js', 'js/views/config.js', 'js/views/tools.js', 'js/views/vp.js', 'js/views/dgfe.js', 'js/views/totals.js', 'js/views/extras.js', 'js/views/plu.js', 'js/views/diag.js', 'js/views/cassa.js', 'js/views/cambio.js', 'js/views/keys.js', 'js/views/prog.js', 'js/views/iva.js', 'js/views/net.js', 'js/views/tx.js', 'js/views/moduli.js', 'js/wizardxml.js',
  'icons/icon-32.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'assets/brand/logo-centro-ufficio.png',
  ...LOGOS,
  ...['sigillo', 'estrazione', 'cambio', 'inserimento'].map((n) => `assets/cambio/nativi/${n}.jpg`),
  ...['estrazione', 'cambio', 'inserimento'].map((n) => `assets/cambio/modificati/${n}.jpg`),
];

self.addEventListener('install', (e) => {
  // file per file: se uno manca (es. i file Epson esclusi dalla versione online) gli altri vengono salvati lo stesso
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // carattere Lato (Google Fonts): dalla cache se già scaricato, così funziona anche senza internet
  if (e.request.method === 'GET' && FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(FONT_CACHE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
        if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
        return r;
      }))).catch(() => new Response('', { status: 504 })),
    );
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/cgi-bin/')) return;
  // Rete prima (per avere sempre l'ultima versione), cache se offline.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
