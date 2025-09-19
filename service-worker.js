// Cache names (bumped)
const STATIC_CACHE = 'banplex-static-v1';
const IMG_CACHE = 'banplex-img-v1';
const FONT_CACHE = 'banplex-font-v1';

// Limits (Android-friendly defaults)
const IMG_CACHE_MAX_ENTRIES = 120; // ~120 thumbnails/attachments
const FONT_CACHE_MAX_ENTRIES = 10;
// [DIUBAH] Menggunakan jalur relatif untuk semua aset lokal
// Precache only same-origin shell assets (cross-origin handled at runtime)
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './logo-main.png',
  './icons-logo.png'
];

// Event 'install': Menyimpan aset inti ke cache
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    try {
      await cache.addAll(STATIC_ASSETS);
      console.log('Static shell cached');
    } catch (e) {
      console.warn('Static precache failed', e);
    }
  })());
});

// [DIUBAH] Event 'activate': Membersihkan cache lama dan mengambil alih kontrol
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const valid = new Set([STATIC_CACHE, IMG_CACHE, FONT_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => !valid.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    // Delete oldest first (insertion order)
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxEntries);
  } catch (_) {}
}

// [DIUBAH] Event 'fetch': Menerapkan strategi "Stale-While-Revalidate" untuk pengalaman offline yang cepat
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // Navigasi dokumen: selalu fallback ke index.html saat offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    try {
      const resp = await fetch(req);
      if (resp && resp.ok) return resp;
      // Jika gagal dari jaringan, kembalikan cache index.html
      const cachedIndex = await cache.match('./index.html');
      return cachedIndex || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
    } catch (_) {
        const cachedIndex = await cache.match('./index.html');
        return cachedIndex || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
    }
  })());
  return;
  }

  // Font Google: layani dari cache jika offline, revalidate bila online
  const isGoogleFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');
  if (isGoogleFont) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const cached = await cache.match(req);
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) {
          cache.put(req, resp.clone()).catch(() => {});
          trimCache(FONT_CACHE, FONT_CACHE_MAX_ENTRIES);
        }
        return cached || resp;
      } catch (_) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Gambar (termasuk dari Firebase Storage) – cache-first dengan revalidate
  const isImage = req.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i) || url.hostname.includes('firebasestorage.googleapis.com');
  if (isImage) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(req);
      try {
        const resp = await fetch(req, { mode: req.mode });
        // Simpan response, termasuk opaque (no-cors) untuk <img>
        if (resp) {
          cache.put(req, resp.clone()).catch(() => {});
          trimCache(IMG_CACHE, IMG_CACHE_MAX_ENTRIES);
        }
        return cached || resp;
      } catch (_) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Hanya tangani request GET same-origin (kecuali yang di atas)
  if (url.origin !== self.location.origin) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    try {
      const resp = await fetch(req);
      if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'default')) {
        cache.put(req, resp.clone()).catch(() => {});
      }
      return cached || resp;
    } catch (e) {
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
