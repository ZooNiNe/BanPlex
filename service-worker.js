// Nama cache yang unik untuk versi aplikasi Anda
const CACHE_NAME = 'banplex-cache-v11';

// Daftar file inti yang diperlukan agar aplikasi dapat berjalan
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

// Event 'install': Menyimpan semua file penting dan langsung aktifkan service worker baru
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache berhasil dibuka. Menyimpan aset...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // [BARU] Memaksa service worker baru untuk aktif segera
        return self.skipWaiting();
      })
  );
});

// Event 'activate': Membersihkan cache lama agar aplikasi selalu menggunakan versi terbaru
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Menghapus cache lama', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Event 'fetch': Mengambil file dari cache jika offline (Cache First Strategy)
self.addEventListener('fetch', event => {
  // Hanya proses permintaan GET, abaikan yang lain (misal: POST ke Firestore)
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Jika file ada di cache, langsung kembalikan dari cache
        if (cachedResponse) {
          return cachedResponse;
        }

        // Jika tidak ada di cache, coba ambil dari jaringan
        return fetch(event.request).then(
          response => {
            // Jika berhasil, simpan ke cache untuk penggunaan selanjutnya dan kembalikan
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response.clone());
              return response;
            });
          }
        );
      })
  );
});

