/* Cache-first para poder abrir y usar la app sin conexión en el taller. */
var CACHE_NAME = 'presupuestador-v20';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/firebase-config.js',
  './js/util.js',
  './js/store.js',
  './js/dolar.js',
  './js/precios.js',
  './js/pdf-lite.js',
  './js/budget-pdf.js',
  './js/materiales.js',
  './js/presupuestos.js',
  './js/ventas.js',
  './js/dashboard.js',
  './js/stock.js',
  './js/ajustes.js',
  './js/asistente.js',
  './js/firebase-sync.js',
  './js/sheets-sync.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/logo-mark.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // no interceptar Google Fonts, etc.

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var network = fetch(event.request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
