const CACHE_NAME = 'dm1-helper-v14.1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './motor_dm1_v14.1.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((keys) => {
        return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    }));
});

self.addEventListener('fetch', (event) => {
    event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
