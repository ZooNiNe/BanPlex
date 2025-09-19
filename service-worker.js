const CACHE_NAME = 'banplex-cache-v13'; // Versi cache dinaikkan untuk memicu update
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/logo-main.png',
  '/icons-logo.png',
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
  // Abaikan request non-GET dan request ke Firebase
  if (event.request.method !== 'GET' || event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Jika berhasil dari jaringan, update cache
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });

        // Kembalikan dari cache jika ada, sambil tetap mengambil versi baru dari jaringan
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// [BARU] Menerima pesan dari client untuk mengaktifkan service worker baru
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
