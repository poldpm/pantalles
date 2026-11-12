/* PANTALLES · Compatibilitat amb navegadors antics (Android 4.x, Samsung de fa anys…)
 * Només afegeix el que falta: als navegadors moderns no fa res. */
(function () {
  'use strict';
  if (typeof Object.assign !== 'function') {
    Object.assign = function (desti) {
      for (var i = 1; i < arguments.length; i++) {
        var o = arguments[i];
        if (o) for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) desti[k] = o[k];
      }
      return desti;
    };
  }
  if (!Array.prototype.forEach || typeof Promise === 'undefined') return; // massa antic: res a fer
  if (typeof window.fetch !== 'function') {
    // fetch mínim amb XMLHttpRequest (el que fa servir el reproductor: GET/POST, text, json, blob)
    window.fetch = function (url, opc) {
      opc = opc || {};
      return new Promise(function (ok, ko) {
        var x = new XMLHttpRequest();
        x.open(opc.method || 'GET', url, true);
        var h = opc.headers || {};
        for (var k in h) if (h.hasOwnProperty(k)) x.setRequestHeader(k, h[k]);
        if (opc.cache === 'no-store' || opc.cache === 'no-cache') x.setRequestHeader('Cache-Control', 'no-cache');
        x.responseType = 'blob';
        if (opc.signal) opc.signal.onabort = function () { x.abort(); };
        x.onload = function () {
          var blob = x.response;
          var llegeix = function () {
            return new Promise(function (r) { var fr = new FileReader(); fr.onload = function () { r(fr.result); }; fr.readAsText(blob); });
          };
          ok({
            ok: x.status >= 200 && x.status < 300, status: x.status,
            text: llegeix,
            json: function () { return llegeix().then(JSON.parse); },
            blob: function () { return Promise.resolve(blob); },
            clone: function () { return this; }
          });
        };
        x.onerror = x.onabort = function () { ko(new TypeError('Error de xarxa')); };
        x.send(opc.body || null);
      });
    };
  }
})();
