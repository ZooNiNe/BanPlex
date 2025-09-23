// Nama cache (versi dinaikkan untuk memicu pembaruan)
const STATIC_CACHE = 'banplex-static-v14'; // <-- Versi dinaikkan
const DYNAMIC_CACHE = 'banplex-dynamic-v14';
const IMG_CACHE = 'banplex-img-v14';
const FONT_CACHE = 'banplex-font-v14';

// Batas entri cache untuk mencegah cache membengkak
const IMG_CACHE_MAX_ENTRIES = 120;
const FONT_CACHE_MAX_ENTRIES = 10;

// Daftar aset inti yang akan disimpan saat instalasi (Precaching)
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './logo-main.png',
  './icons-logo.png',
  './background-image.png',
  'https://unpkg.com/dexie@3/dist/dexie.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js'
];

// Event 'install': Menyimpan semua aset inti ke dalam cache.
self.addEventListener('install', event => {
  console.log('[Service Worker] Menginstall...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[Service Worker] Precaching App Shell dan aset penting...');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.error('[Service Worker] Gagal melakukan precaching:', error);
      })
  );
});

// Event 'activate': Membersihkan cache lama dan mengambil alih kontrol.
self.addEventListener('activate', event => {
  console.log('[Service Worker] Mengaktifkan...');
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMG_CACHE && key !== FONT_CACHE) {
          console.log('[Service Worker] Menghapus cache lama:', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

// Fungsi utilitas untuk memangkas cache agar tidak melebihi batas
async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      await cache.delete(keys[0]); // Hapus entri tertua
      return trimCache(cacheName, maxEntries); // Rekursif jika masih berlebih
    }
  } catch (e) {
    console.error(`[Service Worker] Gagal memangkas cache ${cacheName}:`, e);
  }
}

// Event 'fetch': Menerapkan strategi caching yang sesuai untuk setiap jenis aset.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // [PERBAIKAN PENTING]
  // 0. Biarkan Permintaan API Firestore & Firebase Auth Lewat:
  // Firebase memiliki mekanisme offline canggih sendiri. Service worker tidak boleh
  // meng-cache permintaan ini agar tidak terjadi konflik.
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebaseapp.com')) {
    return; // Langsung lanjutkan ke jaringan (Firestore/Auth akan menanganinya)
  }

  // 1. Aset Inti (App Shell): Cache first.
  if (STATIC_ASSETS.includes(url.pathname) || STATIC_ASSETS.includes(url.href)) {
    event.respondWith(caches.match(request));
    return;
  }
  
  // 2. Navigasi Dokumen: Network first, fallback to cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 3. Font Google: Stale-While-Revalidate.
  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache => {
        return cache.match(request).then(response => {
          const fetchPromise = fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
              trimCache(FONT_CACHE, FONT_CACHE_MAX_ENTRIES);
            }
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
    return;
  }

  // 4. Gambar (termasuk Firebase Storage): Cache first, fallback to network.
  if (request.destination === 'image' || url.hostname.includes('firebasestorage.googleapis.com')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(cache => {
        return cache.match(request).then(response => {
          return response || fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
              trimCache(IMG_CACHE, IMG_CACHE_MAX_ENTRIES);
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 5. Aset Dinamis Lainnya: Cache first, fallback to network.
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then(cache => {
      return cache.match(request).then(response => {
        return response || fetch(request).then(networkResponse => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});

// Menerima pesan dari client untuk mengaktifkan service worker baru
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});