/* =====================================================================
 *  PANTALLES · Capa exterior del reproductor
 *  - És la que es posa en pantalla completa, i no es recarrega mai.
 *  - A dins hi ha el reproductor (reproductor.html). Quan es publica una
 *    versió nova, només es recarrega el reproductor: la pantalla completa
 *    es manté.
 *  Aquest fitxer ha de ser molt senzill (JS antic, per a teles velles).
 * ===================================================================== */
(function () {
  'use strict';
  var marc = document.getElementById('reproductor');
  var pista = document.getElementById('pista');
  var cerca = location.search;

  // El reproductor rep els mateixos paràmetres (?t=clau de vinculació, etc.)
  marc.src = 'reproductor.html' + cerca;
  if (/[?&]t=/.test(cerca)) {
    // Treiem la clau de la barra d'adreces
    var neta = cerca.replace(/([?&])t=[^&]*&?/, '$1').replace(/[?&]$/, '');
    history.replaceState(null, '', location.pathname + neta);
  }
  var proves = /[?&]_prog=(\d+)/.exec(cerca); // només per a proves automàtiques

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});

  /* ---------- Pantalla completa ---------- */
  function ambDocument() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function jaEsCompleta() {
    return !!ambDocument() || window.matchMedia('(display-mode: fullscreen)').matches ||
      (window.innerHeight >= screen.height - 2 && window.innerWidth >= screen.width - 2);
  }
  function mostraPista() { if (!jaEsCompleta()) pista.hidden = false; }
  function amagaPista() { pista.hidden = true; }
  function pantallaCompleta() {
    if (ambDocument()) return Promise.resolve();
    var d = document.documentElement;
    var fn = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!fn) return Promise.reject(new Error('sense pantalla completa'));
    try {
      var r = fn.call(d, { navigationUI: 'hide' });
      return r && r.then ? r.then(amagaPista) : (amagaPista(), Promise.resolve());
    } catch (e) { return Promise.reject(e); }
  }
  function prova() { pantallaCompleta().then(null, function () {}); }
  // Esc i F11 són per sortir a mà de la pantalla completa: no la tornem a posar.
  function esSortida(tecla) { return tecla === 'Escape' || tecla === 'Esc' || tecla === 'F11'; }
  document.addEventListener('click', prova);
  document.addEventListener('keydown', function (e) { if (!esSortida(e.key)) prova(); }, true);
  // El reproductor ens passa les tecles i clics que rep
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.tipus === 'gest' && !esSortida(e.data.tecla)) prova();
  });
  setTimeout(function () {
    if (jaEsCompleta()) return;
    pantallaCompleta().then(function () { if (!jaEsCompleta()) mostraPista(); }, mostraPista);
  }, 10000);
  function enCanviar() { if (ambDocument()) amagaPista(); else setTimeout(mostraPista, 1500); }
  document.addEventListener('fullscreenchange', enCanviar);
  document.addEventListener('webkitfullscreenchange', enCanviar);
  // El focus ha d'estar sempre al reproductor (perquè rebi el comandament)
  marc.addEventListener('load', function () { try { marc.contentWindow.focus(); } catch (e) { /* res */ } });

  /* ---------- Cursor i pantalla sempre encesa ---------- */
  var tCursor;
  function mou() { document.body.classList.remove('sense-cursor'); clearTimeout(tCursor); tCursor = setTimeout(function () { document.body.classList.add('sense-cursor'); }, 3000); }
  document.addEventListener('mousemove', mou); mou();
  function bloqueig() { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(null, function () {}); }
  bloqueig();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') bloqueig(); });

  /* ---------- Actualitzacions del programa ---------- */
  var PROGRAMA = ['reproductor.html', '../comu/compat.js', 'pantalla.js', 'pantalla.css', '../comu/api.js', '../comu/diapos.js', '../comu/diapos.css', '../comu/marca.css', '../config.js'];
  var CAPA = ['index.html', 'capa.js'];
  var empremtes = {};
  var capaNova = false;

  function empremta(fitxers) {
    return Promise.all(fitxers.map(function (f) {
      return fetch(f, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (t) {
        var h = 0;
        for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
        return t.length + ':' + h;
      });
    })).then(function (p) { return p.join('|'); });
  }
  function buidaCau() {
    if (!('caches' in window)) return Promise.resolve();
    return caches.keys().then(function (k) { return Promise.all(k.map(function (x) { return caches.delete(x); })); }, function () {});
  }
  /** Recarrega només el reproductor: la pantalla completa es manté. */
  function recarregaReproductor() {
    buidaCau().then(function () {
      try { marc.contentWindow.location.reload(); } catch (e) { marc.src = 'reproductor.html' + cerca; }
    });
  }
  /** Recarrega tota la pàgina (només si no fa perdre la pantalla completa, o de nit). */
  function recarregaTot() { buidaCau().then(function () { location.reload(); }); }

  function comprova() {
    if (!navigator.onLine) return;
    empremta(PROGRAMA).then(function (e) {
      if (empremtes.programa && e !== empremtes.programa) recarregaReproductor();
      empremtes.programa = e;
    }, function () {});
    empremta(CAPA).then(function (e) {
      if (empremtes.capa && e !== empremtes.capa) capaNova = true;
      empremtes.capa = e;
      // La capa només es renova si NO està en pantalla completa per botó (no la perdríem mai sense voler)
      if (capaNova && !ambDocument()) recarregaTot();
    }, function () {});
  }
  var cada = proves ? Math.max(3, +proves[1]) * 1000 : 180000;
  setTimeout(comprova, Math.min(15000, cada));
  setInterval(comprova, cada);

  window.__capa = { recarregaReproductor: recarregaReproductor };
})();
