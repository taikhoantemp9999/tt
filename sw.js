const CACHE_NAME = 'ksattt-v24';
const urlsToCache = [
    '/',
    '/login.html',
    '/login.js',
    '/list.html',
    '/list.js',
    '/auth.js',
    '/index.html',
    '/campus.html',
    '/campus.js',
    '/building.html',
    '/detail.html',
    '/style.css',
    '/building.css',
    '/script.js',
    '/building.js',
    '/detail.js'
];

self.addEventListener('install', event => {
    self.skipWaiting(); // Ép kích hoạt ngay lập tức bỏ qua thời gian chờ
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    // Bỏ qua các request đến domain khác (như Google Script, Firebase)
    if (!event.request.url.startsWith(self.location.origin)) {
        return; 
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// Loại bỏ những cache cũ khi khởi chạy version mới
self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim()); // Giành quyền kiểm soát trình duyệt ngay lập tức
    
    const cacheAllowlist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheAllowlist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
