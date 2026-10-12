/**
 * Service worker do Gastos: permite abrir e usar o app sem internet.
 *
 * Estratégia: todos os arquivos do app são baixados juntos, numa única
 * instalação, para um cache com o nome da versão. As requisições são
 * atendidas a partir desse cache, então HTML, CSS e JavaScript sempre
 * pertencem à mesma versão — nunca um script novo com um HTML antigo.
 *
 * AO PUBLICAR QUALQUER ALTERAÇÃO, aumente VERSION (e APP_VERSION em
 * js/config.js). O navegador detecta que este arquivo mudou, baixa a nova
 * versão completa em segundo plano e o app oferece "Atualizar".
 *
 * Os dados do usuário ficam no localStorage e não passam por aqui.
 */
const VERSION = '1.1.1';
const CACHE_PREFIX = 'gastos-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

// Caminhos relativos à localização deste arquivo (funciona em subpastas do GitHub Pages).
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.webmanifest',
  './js/config.js',
  './js/dates.js',
  './js/money.js',
  './js/model.js',
  './js/storage.js',
  './js/store.js',
  './js/calc.js',
  './js/charts.js',
  './js/ui.js',
  './js/keypad.js',
  './js/expense-form.js',
  './js/backup.js',
  './js/router.js',
  './js/pwa.js',
  './js/views/home.js',
  './js/views/history.js',
  './js/views/analysis.js',
  './js/views/settings.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache: 'reload' ignora o cache HTTP, garantindo arquivos desta versão.
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
  // Sem skipWaiting aqui: uma atualização espera o usuário tocar em "Atualizar".
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

const scopePath = new URL(self.registration.scope).pathname;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Abrir o app (raiz ou index.html): responde com a página guardada, com ou sem internet.
  if (request.mode === 'navigate' && (url.pathname === scopePath || url.pathname === `${scopePath}index.html`)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('./index.html')) ?? fetch(request);
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached ?? fetch(request);
  })());
});
