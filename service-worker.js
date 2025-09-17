const CACHE_NAME = 'banplex-cache-v2'; // Versi cache diperbarui
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

// Event install: menyimpan aset inti ke cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache dibuka dan aset inti disimpan');
        return cache.addAll(urlsToCache);
      })
  );
});

// Event activate: membersihkan cache lama
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Event fetch: menerapkan strategi "Network First, then Cache"
self.addEventListener('fetch', event => {
  // Hanya terapkan strategi untuk permintaan GET
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Jika respons dari jaringan valid, simpan ke cache dan kembalikan
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Jika jaringan gagal, coba ambil dari cache
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }
            // Jika tidak ada di cache, bisa kembalikan halaman offline fallback (opsional)
          });
      })
  );
});


self.addEventListener('message', event => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

