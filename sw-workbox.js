/* global workbox */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  console.log(`Workbox berhasil dimuat.`);
  
  workbox.core.clientsClaim();
  self.skipWaiting();

  workbox.precaching.precacheAndRoute([
    // Aset Inti (App Shell)
    { url: './', revision: null },
    { url: 'index.html', revision: null },
    { url: 'script.js', revision: null },
    { url: 'style.css', revision: null },
    { url: 'manifest.json', revision: null },
    { url: 'logo-data.js', revision: null },

    // Gambar Penting
    { url: 'icons-logo.png', revision: null },
    { url: 'logo-main.png', revision: null },
    { url: 'background-image.png', revision: null },
    { url: 'dark-background-image.jpg', revision: null },

    // Aset Eksternal bisa dimasukkan di sini jika versinya jarang berubah
    // Namun, lebih baik menggunakan runtime caching untuk ini.
  ]);

  // --- RUNTIME CACHING ---

  // Strategi untuk navigasi halaman (HTML) - Network First
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'banplex-pages',
    })
  );

  // Strategi untuk aset CSS, JS, dan Web Worker - Stale While Revalidate
  workbox.routing.registerRoute(
    ({ request }) => 
      request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'worker',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'banplex-static-assets',
    })
  );

  // Strategi untuk gambar - Cache First (hemat bandwidth)
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'banplex-images',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 60, // Simpan hingga 60 gambar
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 hari
        }),
      ],
    })
  );

  // Strategi untuk Google Fonts - Stale While Revalidate
  workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'banplex-google-fonts',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 10 }),
      ],
    })
  );

  // --- Logika Pesan ---
  // Listener untuk mengaktifkan Service Worker baru saat diminta oleh klien
  self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
      self.skipWaiting();
    }
  });

} else {
  console.log(`Workbox gagal dimuat.`);
}