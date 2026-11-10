// Only this app's declared static assets. No API/auth/location responses.
const CACHE_PREFIX = 'narvie-mytag-pwa:/mytag/:';
const CACHE = CACHE_PREFIX + '0.3.1';
const ASSET_PATHS = [
  './', './index.html', './installeren.html', './installeren.css', './installeren.js',
  './live.js', './styles.css', './app.js', './store.js', './adapters.js', './routes.js', './pwa.js',
  './assets/map.svg', './assets/icon.svg', './assets/install-qr.png', './manifest.webmanifest',
  './assets/icons/apple-touch-icon.png', './assets/icons/narvie-tags-192.png',
  './assets/icons/narvie-tags-512.png', './assets/icons/narvie-tags-maskable-512.png',
];
const STATIC_URLS = new Set(ASSET_PATHS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...STATIC_URLS])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'NARVIE_MYTAG_ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.search || !STATIC_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic' && !response.redirected && !/no-store/i.test(response.headers.get('cache-control') || '')) {
      await cache.put(url.href, response.clone());
    }
    return response;
  })().catch(() => new Response('Narvie is nog niet offline beschikbaar. Open de app één keer met internet.', {
    status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}
  })));
});
