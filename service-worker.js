const CACHE_NAME = 'banplex-cache-v15'; // Versi cache dinaikkan untuk memicu update
// [DIUBAH] Menggunakan jalur relatif untuk semua aset lokal
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './logo-main.png',
  './icons-logo.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

// Event 'install': Menyimpan aset inti ke cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching assets');
        return cache.addAll(urlsToCache);
      })
  );
});

// [DIUBAH] Event 'activate': Membersihkan cache lama dan mengambil alih kontrol
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ).then(() => self.clients.claim());
    })
  );
});

// [DIUBAH] Event 'fetch': Menerapkan strategi "Stale-While-Revalidate" untuk pengalaman offline yang cepat
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Hanya tangani request GET ke origin sendiri. Biarkan pihak ketiga (Google/Firebase) lewat.
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  // Hindari bug only-if-cached untuk request non-same-origin
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    try {
      const resp = await fetch(req);
      // Hanya cache response yang OK dan same-origin/basic
      if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'default')) {
        cache.put(req, resp.clone()).catch(() => {}); // jangan biarkan reject bocor
      }
      return cached || resp;
    } catch (e) {
      // Network gagal: fallback ke cache jika ada
      return cached || new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});

// [BARU] Menerima pesan dari client untuk mengaktifkan service worker baru
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
