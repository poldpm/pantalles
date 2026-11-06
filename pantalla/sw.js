/* PANTALLES · Service worker del reproductor
 * Guarda l'aplicació perquè la pantalla torni a arrencar encara que no hi hagi xarxa.
 * Estratègia: primer la xarxa (així les actualitzacions arriben soles), si falla, la còpia. */
var CAU = 'pantalla-v1';
var FITXERS = ['./', './index.html', './pantalla.js', './pantalla.css', './manifest.webmanifest',
  '../config.js', '../comu/api.js', '../comu/diapos.js', '../comu/diapos.css', '../icona.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CAU).then(function (c) { return c.addAll(FITXERS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) {
    return Promise.all(k.filter(function (x) { return x !== CAU; }).map(function (x) { return caches.delete(x); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // el servei i YouTube van directes
  e.respondWith(new Promise(function (resol) {
    var fet = false;
    var deCau = function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
    };
    var t = setTimeout(function () { if (!fet) { fet = true; deCau().then(resol); } }, 5000);
    fetch(req).then(function (r) {
      if (r && r.ok) { var copia = r.clone(); caches.open(CAU).then(function (c) { c.put(req, copia); }); }
      if (!fet) { fet = true; clearTimeout(t); resol(r); }
    }, function () {
      if (!fet) { fet = true; clearTimeout(t); deCau().then(resol); }
    });
  }));
});
