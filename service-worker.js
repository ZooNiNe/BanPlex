const CACHE_NAME = 'portal-keuangan-cache-v4';
const FONTS_CACHE = 'fonts-cache-v1';
const URLS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'logo-main.png',
    'manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0'
];

self.addEventListener('install', event => {
    console.log('[SW] Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Opened cache:', CACHE_NAME);
                console.log('[SW] Pre-caching URLs:', URLS_TO_CACHE);
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);
    const isDevHost = /^(localhost|127\.0\.0\.1)$/i.test(self.location.hostname);

    // Bypass SW caching logic entirely during local development to avoid 504s
    if (isDevHost) {
        event.respondWith(fetch(req));
        return;
    }

    // Same-origin: cache-first; if both fail, return offline Response
    if (url.origin === self.location.origin) {
        event.respondWith((async () => {
            const cached = await caches.match(req);
            if (cached) {
                console.log('[SW] Cache hit:', url.pathname);
                return cached;
            }
            console.log('[SW] Cache miss:', url.pathname);
            try {
                const resp = await fetch(req);
                const clone = resp.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
                return resp;
            } catch (err) {
                console.warn('[SW] Network fetch failed:', url.href, err);
                // Offline fallback: try cached index.html for navigations
                if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
                    const fallback = await caches.match('index.html');
                    if (fallback) return fallback;
                }
                return new Response('', { status: 504, statusText: 'Offline' });
            }
        })());
        return;
    }

    // Google Fonts: stale-while-revalidate with safe offline fallbacks
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.hostname)) {
        event.respondWith((async () => {
            const cache = await caches.open(FONTS_CACHE);
            const cached = await cache.match(req);
            if (cached) return cached;
            try {
                const networkResp = await fetch(req);
                if (networkResp && networkResp.ok) {
                    cache.put(req, networkResp.clone());
                }
                return networkResp;
            } catch (err) {
                console.warn('[SW] Fonts fetch failed:', url.href, err);
                // Provide minimal valid responses to avoid Response conversion errors
                if (url.hostname.includes('googleapis.com')) {
                    return new Response('/* offline fonts css */', { status: 200, headers: { 'content-type': 'text/css' } });
                } else {
                    return new Response('', { status: 200, headers: { 'content-type': 'font/woff2' } });
                }
            }
        })());
        return;
    }

    // Default: network first, fallback to cache, then offline Response
    event.respondWith((async () => {
        try {
            return await fetch(req);
        } catch (err) {
            const cached = await caches.match(req);
            if (cached) return cached;
            return new Response('', { status: 504, statusText: 'Offline' });
        }
    })());
});

self.addEventListener('activate', event => {
    console.log('[SW] Activate event');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
