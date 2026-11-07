/* =====================================================================
 *  PANTALLES · Reproductor
 *  S'obre a qualsevol aparell amb navegador connectat a la tele.
 *  - Primer cop: mostra un codi per vincular-la des del panell.
 *  - Després: descarrega el contingut, el guarda i el va mostrant.
 *    Si cau la xarxa, continua mostrant el que té guardat.
 * ===================================================================== */
(function () {
  'use strict';
  var VERSIO = '1.0.0';
  var Pnt = window.Pnt;
  var qs = new URLSearchParams(location.search);
  var PREVIA = qs.get('preview');            // id de pantalla (vista prèvia des del panell)
  var INTERVAL_SYNC = Math.max(2000, (parseInt(qs.get('_sync'), 10) || 30) * 1000); // _sync només per a proves
  var $ = function (id) { return document.getElementById(id); };
  var escenari = $('escenari'), contingut = $('contingut'), sup = $('capes-sup');

  /* ---------------------------------------------------------------
   *  Emmagatzematge local (IndexedDB) — config i fitxers
   * ------------------------------------------------------------- */
  var BD = null;
  function obreBd() {
    return new Promise(function (ok) {
      if (!window.indexedDB) return ok(null);
      try {
        var r = indexedDB.open('pantalles', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); r.result.createObjectStore('mitjans'); };
        r.onsuccess = function () { BD = r.result; ok(BD); };
        r.onerror = function () { ok(null); };
        r.onblocked = function () { ok(null); };
      } catch (e) { ok(null); }
    });
  }
  function bdOp(magatzem, mode, fn) {
    return new Promise(function (ok) {
      if (!BD) return ok(undefined);
      try {
        var tx = BD.transaction(magatzem, mode), st = tx.objectStore(magatzem), r = fn(st);
        tx.oncomplete = function () { ok(r && r.result); };
        tx.onerror = tx.onabort = function () { ok(undefined); };
      } catch (e) { ok(undefined); }
    });
  }
  var kv = {
    get: function (k) { return bdOp('kv', 'readonly', function (s) { return s.get(k); }); },
    set: function (k, v) { return bdOp('kv', 'readwrite', function (s) { return s.put(v, k); }); }
  };
  var memoriaPrevia = {}; // a la vista prèvia no guardem res al disc
  var mitjans = {
    get: function (id) { return PREVIA ? Promise.resolve(memoriaPrevia[id]) : bdOp('mitjans', 'readonly', function (s) { return s.get(id); }); },
    set: function (id, v) { if (PREVIA) { memoriaPrevia[id] = v; return Promise.resolve(); } return bdOp('mitjans', 'readwrite', function (s) { return s.put(v, id); }); },
    del: function (id) { return bdOp('mitjans', 'readwrite', function (s) { return s['delete'](id); }); },
    claus: function () { return PREVIA ? Promise.resolve(Object.keys(memoriaPrevia)) : bdOp('mitjans', 'readonly', function (s) { return s.getAllKeys(); }).then(function (r) { return r || []; }); }
  };

  function llegeixLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function escriuLS(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* res */ } }

  /* ---------------------------------------------------------------
   *  Estat
   * ------------------------------------------------------------- */
  var token = null;
  var config = null;
  var desfasament = 0;                 // diferència entre l'hora del servidor i la de l'aparell
  var enLinia = true, darreraConnexio = Date.now();
  var presents = {};                   // id fitxer → true si el tenim guardat
  var urls = {};                       // id fitxer → objectURL (només els que s'estan fent servir)
  var descarregant = false;
  var darreraOrdre = llegeixLS('pnt_ordre');
  var inici = Date.now();
  var darrerError = '';
  var actual = null;                   // { item, capa, fi }
  var temporitzador = null;
  var darrerAvanc = Date.now();
  var mode = 'inici';
  var fallades = 0;

  function ara() { return Date.now() + desfasament; }
  function local() { return Pnt.horaLocal(ara()); }

  /* ---------------------------------------------------------------
   *  Arrencada
   * ------------------------------------------------------------- */
  function amagaInici() { var m = $('missatge-inici'); if (m) m.classList.add('amagat'); }

  function engega() {
    ajustaEscenari();
    window.addEventListener('resize', ajustaEscenari);
    if (!Pnt.apiConfigurada()) {
      amagaInici();
      return pantallaSistema('<h1>Falta configurar el servei</h1><p>Cal posar l\'adreça d\'Apps Script al fitxer <b>config.js</b>.</p>');
    }
    if (PREVIA) {
      document.body.classList.add('previa');
      return carregaPrevia();
    }
    var t = qs.get('t');
    if (t && /^[a-f0-9]{40,80}$/i.test(t)) {
      escriuLS('pnt_token', t);
      history.replaceState(null, '', location.pathname); // no deixem la clau a la barra d'adreces
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* opcional */ });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    obreBd().then(function () {
      token = llegeixLS('pnt_token');
      if (!token) return kv.get('token').then(function (tk) {
        if (tk) { token = tk; escriuLS('pnt_token', tk); arrencaReproductor(); } else vinculacio();
      });
      kv.set('token', token);
      arrencaReproductor();
    });
    configuraInteraccio();
    setInterval(vigilant, 30000);
  }

  function arrencaReproductor() {
    kv.get('config').then(function (c) {
      if (c) { config = c; aplicaConfig(); }
      return refrescaPresents();
    }).then(function () {
      amagaInici();
      if (config) seguent(); else pantallaSistema('<div class="inici-roda" style="width:5em;height:5em;border-width:.6em"></div><p style="margin-top:1.5em">Carregant el contingut…</p>');
      sync();
    });
  }

  /* ---------------------------------------------------------------
   *  Vinculació (primer cop)
   * ------------------------------------------------------------- */
  function infoAparell() {
    return { res: screen.width + 'x' + screen.height, ua: navigator.userAgent.substr(0, 200), v: VERSIO };
  }

  function vinculacio() {
    amagaInici();
    mode = 'vinculacio';
    Pnt.api('pairStart', { info: infoAparell() }).then(function (r) {
      pantallaSistema(
        '<div class="tall"></div><div class="etiqueta">Pantalla nova</div>' +
        '<p>Per vincular-la, entra al <b>panell de Pantalles</b> → <b>Afegir pantalla</b> i escriu aquest codi:</p>' +
        '<div class="codi">' + r.code.substr(0, 3) + ' ' + r.code.substr(3) + '</div>' +
        '<p class="petit">El codi canvia cada 30 minuts · ' + Pnt.escapa(location.host) + '</p>');
      var fi = Date.now() + r.expiresIn * 1000 - 60000;
      (function comprova() {
        if (Date.now() > fi) return vinculacio();
        Pnt.api('pairCheck', { code: r.code, secret: r.secret }).then(function (c) {
          if (c.status === 'ok') {
            token = c.token; escriuLS('pnt_token', token); kv.set('token', token);
            netejaSistema();
            arrencaReproductor();
          } else if (c.status === 'expired') vinculacio();
          else setTimeout(comprova, 4000);
        }, function () { setTimeout(comprova, 8000); });
      })();
    }, function (e) {
      pantallaSistema('<h1>Sense connexió</h1><p>No es pot contactar amb el servei. Es tornarà a provar sol.</p><p class="petit">' + Pnt.escapa(e.message) + '</p>');
      setTimeout(vinculacio, 15000);
    });
  }

  function desvincula() {
    token = null; config = null;
    escriuLS('pnt_token', null); kv.set('token', null); kv.set('config', null);
    aturaTot();
    contingut.innerHTML = '';
    vinculacio();
  }

  /* ---------------------------------------------------------------
   *  Sincronització amb el servei
   * ------------------------------------------------------------- */
  function estatActual() {
    var claus = Object.keys(presents);
    var falten = config ? Object.keys(config.media).filter(function (id) { return !presents[id]; }).length : 0;
    return {
      item: actual && actual.item ? nomItem(actual.item) : (mode === 'buit' ? '(sense contingut)' : mode === 'repos' ? '(fora d\'horari)' : ''),
      itemId: actual && actual.item ? actual.item.id : '', items: config ? elegibles().length : 0,
      cached: claus.length, missing: falten, res: window.innerWidth + 'x' + window.innerHeight,
      ua: navigator.userAgent.substr(0, 200), v: VERSIO, mode: avisPle() ? 'avis' : mode,
      up: Math.round((Date.now() - inici) / 1000), err: darrerError, online: true
    };
  }

  var syncEnCurs = false;
  function sync() {
    if (syncEnCurs) return;
    syncEnCurs = true;
    var t0 = Date.now();
    Pnt.api('sync', { token: token, rev: config ? config.rev : null, lastCommand: darreraOrdre, status: estatActual() }, { timeout: 30000 })
      .then(function (r) {
        desfasament = r.serverTime + (Date.now() - t0) / 2 - Date.now();
        posaEnLinia(true);
        if (r.config) {
          config = r.config;
          kv.set('config', config);
          aplicaConfig();
          if (mode !== 'normal' || !actual) seguent();
        }
        if (r.command) executaOrdre(r.command);
        return sincronitzaMitjans();
      })
      .catch(function (e) {
        if (e.code === 'TOKEN') { syncEnCurs = false; desvincula(); return; }
        darrerError = e.message;
        posaEnLinia(false);
      })
      .then(function () {
        syncEnCurs = false;
        if (token) setTimeout(sync, INTERVAL_SYNC + Math.random() * 5000);
      });
  }

  function posaEnLinia(si) {
    enLinia = si;
    if (si) darreraConnexio = Date.now();
    // El punt taronja només surt si porta més de 3 minuts sense connexió.
    document.body.classList.toggle('fora-linia', !si && Date.now() - darreraConnexio > 180000);
  }

  function refrescaPresents() {
    return mitjans.claus().then(function (claus) {
      presents = {};
      claus.forEach(function (k) { presents[k] = true; });
    });
  }

  /** Descarrega els fitxers que falten i esborra els que ja no es fan servir. */
  function sincronitzaMitjans() {
    if (descarregant || !config) return Promise.resolve();
    descarregant = true;
    var cred = PREVIA ? { session: llegeixLS('pnt_session') } : { token: token };
    var necessaris = Object.keys(config.media);
    // Primer els fitxers de les diapositives que toquen ara.
    var araIds = [];
    elegibles(true).forEach(function (it) { if (it.mediaId) araIds.push(it.mediaId); (it.photos || []).forEach(function (x) { araIds.push(x); }); });
    var logos = [config.settings.logoMediaId, config.settings.logoNegMediaId];
    var prio = function (id) { return logos.indexOf(id) >= 0 ? 0 : araIds.indexOf(id) >= 0 ? 1 : 2; };
    necessaris.sort(function (a, b) { return prio(a) - prio(b); });
    var falten = necessaris.filter(function (id) { return !presents[id]; });
    var cadena = Promise.resolve();
    falten.forEach(function (id) {
      cadena = cadena.then(function () {
        if (!config || !config.media[id]) return;
        return Pnt.descarregaMitja(id, config.media[id], cred).then(function (blob) {
          return mitjans.set(id, blob).then(function () {
            presents[id] = true;
            if (logos.indexOf(id) >= 0) refrescaLogos();
            if (mode === 'buit' || mode === 'inici') seguent();
          });
        }, function (e) { darrerError = 'Descàrrega: ' + e.message; });
      });
    });
    return cadena.then(function () {
      if (PREVIA || !config) return;
      var sobrers = Object.keys(presents).filter(function (id) { return !config.media[id]; });
      return Promise.all(sobrers.map(function (id) {
        if (actual && actual.item && actual.item.mediaId === id) return null;
        delete presents[id];
        if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
        return mitjans.del(id);
      }));
    }).then(function () { descarregant = false; }, function () { descarregant = false; });
  }

  /* ---------------------------------------------------------------
   *  Vista prèvia (des del panell)
   * ------------------------------------------------------------- */
  function carregaPrevia() {
    var etiq = document.createElement('div');
    etiq.className = 'prev-etiqueta'; etiq.textContent = 'Vista prèvia';
    document.body.appendChild(etiq);
    Pnt.api('preview', { session: llegeixLS('pnt_session'), screenId: PREVIA }).then(function (r) {
      desfasament = r.serverTime - Date.now();
      config = r.config;
      aplicaConfig();
      amagaInici();
      seguent();
      sincronitzaMitjans();
    }, function (e) {
      amagaInici();
      pantallaSistema('<h1>No es pot mostrar</h1><p>' + Pnt.escapa(e.message) + '</p>');
    });
    window.addEventListener('message', function (ev) {
      if (ev.origin !== location.origin || !ev.data) return;
      if (ev.data.tipus === 'seguent') seguent();
      if (ev.data.tipus === 'anterior') seguent(-1);
    });
  }

  /* ---------------------------------------------------------------
   *  Ordres remotes
   * ------------------------------------------------------------- */
  function executaOrdre(o) {
    if (o.id === darreraOrdre) return;
    darreraOrdre = o.id;
    escriuLS('pnt_ordre', o.id);
    if (o.type === 'reload') setTimeout(function () { location.reload(); }, 500);
    if (o.type === 'identify') identifica();
    if (o.type === 'clearcache') {
      mitjans.claus().then(function (claus) {
        return Promise.all(claus.map(function (k) { return mitjans.del(k); }));
      }).then(function () { location.reload(); });
    }
  }

  function identifica() {
    var d = document.createElement('div');
    d.className = 'identifica';
    d.innerHTML = '<div class="etiqueta">Aquesta pantalla és</div><div class="nom">' + Pnt.escapa(config ? config.screen.name : 'Pantalla') + '</div>' +
      '<div class="lloc">' + Pnt.escapa(config ? config.screen.location || '' : '') + '</div>' +
      '<div class="det">' + window.innerWidth + '×' + window.innerHeight + ' · v' + VERSIO + '</div>';
    sup.appendChild(d);
    setTimeout(function () { d.remove(); }, 20000);
  }

  /* ---------------------------------------------------------------
   *  Configuració → escenari i superposicions
   * ------------------------------------------------------------- */
  function ajustaEscenari() {
    var W = window.innerWidth, H = window.innerHeight;
    var rot = config ? (config.screen.orientation || 0) : 0;
    var w = rot % 180 ? H : W, h = rot % 180 ? W : H;
    escenari.style.width = w + 'px';
    escenari.style.height = h + 'px';
    escenari.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg)';
    Pnt.diapo.escala(escenari, w, h);
    if (window.Pnt && actual && actual.capa) { var dp = actual.capa.querySelector('.dp'); if (dp) Pnt.diapo.ajusta(dp); }
    pintaCinta();
  }

  function aplicaConfig() {
    if (!config) return;
    document.documentElement.style.setProperty('--accent', config.settings.accent || '#c8102e');
    ajustaEscenari();
    pintaSuperposicions();
  }

  var elRellotge = null, elCinta = null, elProgres = null, elAvis = null, ivRellotge = null;
  function treu(e) { if (e && e.parentNode) e.parentNode.removeChild(e); return null; }

  function pintaSuperposicions() {
    var o = config.screen.overlays || {};
    // Rellotge
    if (o.clock && !elRellotge) {
      elRellotge = document.createElement('div');
      elRellotge.className = 'sup-rellotge';
      elRellotge.innerHTML = '<div class="h"></div><div class="d"></div>';
      sup.appendChild(elRellotge);
      var pinta = function () {
        if (!elRellotge) return;
        var l = local();
        elRellotge.querySelector('.h').textContent = l.time;
        elRellotge.querySelector('.d').textContent = Pnt.dataLlarga(l);
      };
      pinta(); ivRellotge = setInterval(pinta, 5000);
    } else if (!o.clock && elRellotge) { elRellotge = treu(elRellotge); clearInterval(ivRellotge); }
    // Logotips: es preparen perquè les diapositives els tinguin a punt
    carregaLogos(function () {});
    // Barra de progrés
    if (o.progress && !elProgres) { elProgres = document.createElement('div'); elProgres.className = 'sup-progres'; sup.appendChild(elProgres); }
    else if (!o.progress) elProgres = treu(elProgres);
    pintaCinta();
    pintaAvisos();
  }

  var textCinta = '';
  function pintaCinta() {
    if (!config) return;
    var o = config.screen.overlays || {};
    var msgs = (config.ticker || []).map(function (t) { return t.text; });
    var mostrar = o.ticker !== false && msgs.length > 0 && !avisPle();
    document.body.classList.toggle('amb-cinta', mostrar);
    if (!mostrar) { elCinta = treu(elCinta); textCinta = ''; return; }
    var nou = msgs.join('|');
    if (!elCinta) {
      elCinta = document.createElement('div');
      elCinta.className = 'sup-cinta';
      elCinta.innerHTML = '<div class="etiqueta">INFO</div><div class="pista"><div class="text"></div></div>';
      sup.appendChild(elCinta);
      textCinta = '';
    }
    var t = elCinta.querySelector('.text');
    if (nou !== textCinta) {
      textCinta = nou;
      t.innerHTML = msgs.map(Pnt.escapa).join('<span class="sep">●</span>');
    }
    requestAnimationFrame(function () {
      var pista = elCinta && elCinta.querySelector('.pista');
      if (!pista) return;
      var amplePista = pista.clientWidth, ampleText = t.scrollWidth;
      var em = parseFloat(escenari.style.fontSize) || 10;
      var vel = (config.settings.tickerSpeed || 90) * em / 10.8; // px per segon (a 1080p)
      t.style.setProperty('--inici', amplePista + 'px');
      t.style.setProperty('--fi', -ampleText + 'px');
      t.style.animation = 'none';
      void t.offsetWidth;
      t.style.animation = 'cinta ' + ((amplePista + ampleText) / vel).toFixed(1) + 's linear infinite';
    });
  }

  function avisosActius() {
    if (!config) return [];
    var t = ara();
    return (config.alerts || []).filter(function (a) { return a.on !== false && (!a.until || Date.parse(a.until) > t); });
  }
  function avisPle() { return avisosActius().some(function (a) { return a.mode === 'full'; }); }

  var signaturaAvis = '', ivAvis = null, idxAvis = 0;
  function pintaAvisos() {
    var actius = avisosActius();
    var plens = actius.filter(function (a) { return a.mode === 'full'; });
    var llista = plens.length ? plens : actius;
    var sig = JSON.stringify(llista);
    if (sig === signaturaAvis) return;
    signaturaAvis = sig;
    clearInterval(ivAvis);
    elAvis = treu(elAvis);
    if (!llista.length) { pintaCinta(); controlaVideo(); return; }
    idxAvis = 0;
    var pinta = function () {
      var a = llista[idxAvis % llista.length];
      idxAvis++;
      var nou = document.createElement('div');
      var tema = a.tema === 'info' || a.tema === 'neutre' ? a.tema : 'urgent';
      var etiqueta = a.label || (tema === 'urgent' ? 'Avís urgent' : 'Avís');
      nou.className = (a.mode === 'full' ? 'avis-complet' : 'avis-banda') + ' tema-' + tema;
      var titol = a.title ? '<div class="titol">' + Pnt.escapa(a.title) + '</div>' : '';
      var text = a.text ? '<div class="text">' + Pnt.escapa(a.text).replace(/\n/g, '<br>') + '</div>' : '';
      if (a.mode === 'full') {
        nou.innerHTML = '<div class="tall"></div><div class="etiqueta">' + Pnt.escapa(etiqueta) + '</div>' + titol +
          (titol && text ? '<div class="ratlla"></div>' : '') + text + '<div class="logo-avis"></div>';
        var lg = logoUrl(tema !== 'info');
        $logoAvis(nou.querySelector('.logo-avis'), lg);
      } else {
        nou.innerHTML = '<div class="etiqueta">' + Pnt.escapa(etiqueta) + '</div><div class="cos">' + titol + text + '</div>';
      }
      treu(elAvis);
      elAvis = nou;
      sup.appendChild(nou);
    };
    pinta();
    if (llista.length > 1) ivAvis = setInterval(pinta, 12000);
    pintaCinta();
    controlaVideo();
  }

  /** Si hi ha un avís a pantalla completa, el vídeo de sota es posa en pausa. */
  function controlaVideo() {
    var v = actual && actual.capa && actual.capa.querySelector('video');
    if (!v) return;
    if (avisPle()) v.pause(); else v.play().catch(function () {});
  }

  /* ---------------------------------------------------------------
   *  Selecció del que toca mostrar
   * ------------------------------------------------------------- */
  function nomItem(it) {
    if (it.name) return it.name;
    if (it.kind === 'media') { var m = config.media[it.mediaId]; return m ? m.name : 'fitxer'; }
    if (it.kind === 'collage') return it.caption ? it.caption.split('\n')[0] : 'Collage de ' + (it.photos || []).length + ' fotos';
    if (it.text && it.text.title) return it.text.title;
    if (it.url) return it.url;
    return it.kind;
  }

  function enHorariPantalla() {
    var h = config && config.screen.hours;
    if (!h || !h.on) return true;
    return Pnt.dinsHorari({ days: h.days, tFrom: h.from, tTo: h.to }, local());
  }

  /** Elements que es poden mostrar ara mateix (horari + fitxer descarregat). */
  function elegibles(ignoraPresents) {
    if (!config) return [];
    var l = local();
    return config.items.filter(function (it) {
      if (it.on === false) return false;
      if (!Pnt.dinsHorari(it.playlistSchedule, l) || !Pnt.dinsHorari(it.schedule, l)) return false;
      if (it.kind === 'media') return !!config.media[it.mediaId] && (ignoraPresents || !!presents[it.mediaId]);
      if (it.kind === 'collage') {
        var fotos = (it.photos || []).filter(function (id) { return config.media[id] && (ignoraPresents || presents[id]); });
        return fotos.length >= 2 && fotos.length === (it.photos || []).filter(function (id) { return config.media[id]; }).length;
      }
      if ((it.kind === 'web' || it.kind === 'youtube') && !navigator.onLine && !PREVIA) return false;
      return true;
    });
  }

  function durada(it) {
    if (it.duration) return it.duration;
    if (it.kind === 'media' && config.media[it.mediaId] && config.media[it.mediaId].kind === 'video') return null; // fins al final
    if (it.kind === 'youtube') return 60;
    if (it.kind === 'web') return 30;
    return config.screen.duration || config.settings.defaultDuration || 10;
  }

  /* ---------- Logotips (color i negatiu) ---------- */
  function idsLogos() {
    var s = config ? config.settings : {};
    return [s.logoMediaId, s.logoNegMediaId].filter(function (x) { return x && config.media[x]; });
  }
  function carregaLogos(cb) {
    var ids = idsLogos(), queden = ids.length;
    if (!queden) return cb();
    ids.forEach(function (id) { urlMitja(id, function () { if (!--queden) cb(); }); });
  }
  /** negatiu=true → per a fons foscos (granat, fotos). Si només n'hi ha un, es fa servir aquell. */
  function logoUrl(negatiu) {
    if (!config) return null;
    var s = config.settings;
    var neg = s.logoNegMediaId && urls[s.logoNegMediaId], col = s.logoMediaId && urls[s.logoMediaId];
    return negatiu ? (neg || null) : (col || null);
  }
  function $logoAvis(cont, u) {
    if (!cont) return;
    cont.innerHTML = u ? '<img alt="">' : '<div class="nom">' + Pnt.escapa((config && config.settings.schoolName) || 'Vedruna Escorial Vic') + '</div>';
    if (u) cont.querySelector('img').src = u;
  }
  function ctxDiapo() {
    return {
      ara: ara,
      urlMitja: function (id) { return urls[id] || null; },
      logo: { color: logoUrl(false), neg: logoUrl(true) },
      escola: (config && config.settings.schoolName) || 'Vedruna Escorial Vic'
    };
  }
  /** Peu de foto corporatiu i logotip sobre fotos i vídeos. */
  function decoraMitja(capa, item) {
    if (item.caption) capa.appendChild(Pnt.diapo.peuFoto(item.caption));
    var o = config.screen.overlays || {};
    if (o.logo) {
      var u = logoUrl(true);
      if (u) { var i = document.createElement('img'); i.className = 'logo-foto'; i.alt = ''; i.src = u; capa.appendChild(i); }
    }
  }

  function urlMitja(id, cb) {
    if (urls[id]) return cb(urls[id]);
    mitjans.get(id).then(function (blob) {
      if (!blob) return cb(null);
      if (!urls[id]) urls[id] = URL.createObjectURL(blob);
      cb(urls[id]);
    });
  }

  /* ---------------------------------------------------------------
   *  Reproducció
   * ------------------------------------------------------------- */
  var historial = [];
  function seguent(direccio) {
    clearTimeout(temporitzador);
    darrerAvanc = Date.now();
    if (!config) return;
    pintaAvisos();
    if (!enHorariPantalla() && !PREVIA) return mostraRepos();
    var llista = elegibles();
    if (!llista.length) return mostraBuit();
    var pos = actual && actual.item ? llista.map(function (x) { return x.id; }).indexOf(actual.item.id) : -1;
    var item;
    if (direccio === -1 && historial.length > 1) {
      historial.pop();
      var idAnt = historial.pop();
      item = llista.filter(function (x) { return x.id === idAnt; })[0] || llista[0];
    } else item = llista[(pos + 1) % llista.length];
    // Només hi ha una cosa per mostrar i ja s'està mostrant: no cal tornar-la a carregar.
    if (llista.length === 1 && actual && actual.item && actual.item.id === item.id && mode === 'normal' && item.kind !== 'web') {
      programa(item);
      return;
    }
    historial.push(item.id);
    if (historial.length > 30) historial.shift();
    mostra(item, llista.length);
  }

  function programa(item) {
    var d = durada(item);
    if (d) temporitzador = setTimeout(seguent, d * 1000);
    if (elProgres) {
      elProgres.style.transition = 'none'; elProgres.style.width = '0';
      if (d) { void elProgres.offsetWidth; elProgres.style.transition = 'width ' + d + 's linear'; elProgres.style.width = '100%'; }
    }
  }

  function mostra(item, total) {
    var capa = document.createElement('div');
    var tr = item.transition || config.screen.transition || config.settings.defaultTransition || 'fade';
    capa.className = 'capa tr-' + tr;
    var ajust = item.fit || config.screen.fit || 'cover';
    capa.classList.add('ajust-' + ajust);
    var d = durada(item);
    var llest = false;
    var vigilancia = setTimeout(function () { if (!llest) falla(capa, item, 'No s\'ha pogut carregar a temps'); }, 20000);
    prepara(item, capa, d).then(function () {
      if (llest) return;
      llest = true; clearTimeout(vigilancia);
      fallades = 0;
      mode = 'normal';
      netejaSistema();
      intercanvia(capa, item);
      var v = capa.querySelector('video');
      if (v) {
        v.onended = function () { if (actual && actual.capa === capa) { if (total === 1) { v.currentTime = 0; v.play().catch(function () {}); } else seguent(); } };
        v.onerror = function () { if (actual && actual.capa === capa) seguent(); };
        if (!avisPle()) v.play().catch(function () { v.muted = true; v.play().catch(function () {}); });
        if (!d) {
          var maxim = ((config.media[item.mediaId] || {}).duration || 600) + 15;
          temporitzador = setTimeout(seguent, maxim * 1000);
        }
      }
      if (d || !v) programa(item);
      if (item.kind === 'web' && item.reload && total === 1) {
        temporitzador = setTimeout(seguent, item.reload * 60000);
      }
    }, function (e) { llest = true; clearTimeout(vigilancia); falla(capa, item, e && e.message); });
  }

  function falla(capa, item, motiu) {
    darrerError = 'No s\'ha pogut mostrar «' + nomItem(item) + '»: ' + (motiu || '');
    fallades++;
    if (fallades > 8) { fallades = 0; mostraBuit(); temporitzador = setTimeout(seguent, 30000); return; }
    temporitzador = setTimeout(seguent, 800);
  }

  function prepara(item, capa, d) {
    return new Promise(function (ok, ko) {
      if (item.kind === 'media') {
        var meta = config.media[item.mediaId];
        urlMitja(item.mediaId, function (u) {
          if (!u) return ko(new Error('fitxer no descarregat'));
          var ajust = item.fit || config.screen.fit || 'cover';
          if (meta.kind === 'image') {
            if (ajust === 'contain') { var fb = document.createElement('div'); fb.className = 'fons-borros'; fb.style.backgroundImage = 'url("' + u + '")'; capa.appendChild(fb); }
            var img = new Image();
            img.className = 'mitja'; img.alt = '';
            img.onload = function () { (img.decode ? img.decode() : Promise.resolve()).catch(function () {}).then(ok); };
            img.onerror = function () { ko(new Error('imatge malmesa')); };
            img.src = u;
            if (item.kenburns) { capa.classList.add('kenburns'); capa.style.setProperty('--durada', (d || 10) + 's'); }
            capa.appendChild(img);
            decoraMitja(capa, item);
          } else {
            var v = document.createElement('video');
            v.className = 'mitja';
            v.muted = !config.screen.sound;
            v.setAttribute('muted', v.muted ? '' : null);
            v.playsInline = true; v.setAttribute('playsinline', '');
            v.preload = 'auto';
            v.oncanplay = function () { v.oncanplay = null; ok(); };
            v.onerror = function () { ko(new Error('vídeo no compatible')); };
            v.src = u;
            capa.appendChild(v);
            decoraMitja(capa, item);
            v.load();
          }
        });
      } else if (item.kind === 'collage') {
        var ids = (item.photos || []).filter(function (id) { return config.media[id]; }), queden = ids.length;
        var fesCollage = function () {
          var n = Pnt.diapo.crea(item, ctxDiapo());
          capa.appendChild(n);
          // Espera que les fotos estiguin descodificades per evitar parpellejos
          var carregades = 0;
          ids.forEach(function (id) {
            var im = new Image();
            im.onload = im.onerror = function () { if (++carregades === ids.length) ok(); };
            im.src = urls[id];
          });
          if (!ids.length) ok();
        };
        if (!queden) return ko(new Error('collage sense fotos'));
        ids.forEach(function (id) { urlMitja(id, function () { if (!--queden) fesCollage(); }); });
      } else if (item.kind === 'web' || item.kind === 'youtube') {
        var src = item.kind === 'youtube' ? Pnt.youtubeEmbed(item.url, config.screen.sound) : item.url;
        if (!src) return ko(new Error('enllaç no vàlid'));
        var f = document.createElement('iframe');
        var z = (item.zoom || 100) / 100;
        var rect = escenari.getBoundingClientRect();
        var w = parseFloat(escenari.style.width) || rect.width, h = parseFloat(escenari.style.height) || rect.height;
        f.style.width = (w / z) + 'px'; f.style.height = (h / z) + 'px';
        f.style.transform = 'scale(' + z + ')';
        f.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
        f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        f.setAttribute('scrolling', 'no');
        var fet = false;
        f.onload = function () { if (!fet) { fet = true; setTimeout(ok, 600); } };
        setTimeout(function () { if (!fet) { fet = true; ok(); } }, 9000);
        f.src = src;
        capa.appendChild(f);
        contingut.appendChild(capa); // s'ha de carregar dins el document
      } else {
        var bgId = item.text && item.text.bgMediaId;
        var fes = function () {
          var n = Pnt.diapo.crea(item, ctxDiapo());
          if (!n) return ko(new Error('tipus desconegut'));
          capa.appendChild(n);
          var imgs = n.querySelectorAll('img');
          if (!imgs.length) return ok();
          var queden = imgs.length;
          for (var i = 0; i < imgs.length; i++) {
            if (imgs[i].complete) { if (!--queden) ok(); }
            else imgs[i].onload = imgs[i].onerror = function () { if (!--queden) ok(); };
          }
        };
        carregaLogos(function () { if (bgId) urlMitja(bgId, fes); else fes(); });
      }
    });
  }

  function intercanvia(capa, item) {
    var anterior = actual;
    if (!capa.parentNode) contingut.appendChild(capa);
    actual = { item: item, capa: capa };
    var dp = capa.querySelector('.dp');
    if (dp) Pnt.diapo.ajusta(dp);
    void capa.offsetWidth;
    capa.classList.add('visible');
    if (anterior && anterior.capa) {
      anterior.capa.classList.add('sortint');
      anterior.capa.style.zIndex = 0; capa.style.zIndex = 1;
      setTimeout(function () { destrueix(anterior.capa); }, 1300);
    }
  }

  function destrueix(capa) {
    if (!capa) return;
    capa.querySelectorAll('.dp').forEach(function (n) { if (n.atura) n.atura(); });
    var v = capa.querySelector('video');
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    var f = capa.querySelector('iframe');
    if (f) f.src = 'about:blank';
    treu(capa);
  }

  function aturaTot() {
    clearTimeout(temporitzador);
    if (actual) destrueix(actual.capa);
    actual = null;
  }

  /* ---------- Pantalles del sistema ---------- */
  var elSistema = null, ivSistema = null;
  function pantallaSistema(html, classe) {
    netejaSistema();
    elSistema = document.createElement('div');
    elSistema.className = 'sistema' + (classe ? ' ' + classe : '');
    elSistema.innerHTML = html;
    sup.appendChild(elSistema);
    return elSistema;
  }
  function netejaSistema() { clearInterval(ivSistema); elSistema = treu(elSistema); }

  /** No hi ha res programat: logotip, nom de l'escola i hora. */
  function mostraBuit() {
    var abans = mode;
    mode = 'buit';
    aturaTot();
    if (abans !== 'buit' || !elSistema) {
      var s = config.settings;
      var el = pantallaSistema('<div class="tall"></div><div class="marca"></div><div class="hora-gran"></div><div class="data"></div>');
      pintaMarcaBuit(el);
      var pinta = function () {
        var l = local();
        el.querySelector('.hora-gran').textContent = l.time;
        el.querySelector('.data').textContent = Pnt.dataLlarga(l);
      };
      pinta(); ivSistema = setInterval(pinta, 5000);
    }
    temporitzador = setTimeout(seguent, 15000);
  }

  function pintaMarcaBuit(el) {
    carregaLogos(function () {
      var m = el.querySelector('.marca'), u = logoUrl(true);
      if (!m) return;
      if (u && m.dataset.url === u) return;
      m.dataset.url = u || '';
      m.innerHTML = u ? '<img class="logo" alt="">' : '<div class="nom-escola">' + Pnt.escapa((config && config.settings.schoolName) || 'Vedruna Escorial Vic') + '</div>';
      if (u) m.querySelector('img').src = u;
    });
  }
  /** Quan arriba un logotip nou, es posa allà on calgui sense esperar. */
  function refrescaLogos() {
    if (mode === 'buit' && elSistema) pintaMarcaBuit(elSistema);
    signaturaAvis = ''; pintaAvisos();
    if (actual && actual.item && actual.capa && (actual.item.kind === 'text' || actual.item.kind === 'clock' || actual.item.kind === 'countdown')) {
      clearTimeout(temporitzador); mostra(actual.item, elegibles().length);
    }
  }

  /** Fora de l'horari de la pantalla: negre (estalvia la tele i evita marques). */
  function mostraRepos() {
    var abans = mode;
    mode = 'repos';
    aturaTot();
    if (abans !== 'repos' || !elSistema) {
      var el = pantallaSistema('<div class="hora-gran"></div>', 'repos');
      var pinta = function () { el.querySelector('.hora-gran').textContent = local().time; el.style.paddingTop = (Math.random() * 40) + 'em'; };
      pinta(); ivSistema = setInterval(pinta, 60000);
    }
    temporitzador = setTimeout(seguent, 30000);
  }

  /* ---------------------------------------------------------------
   *  Vigilant: si alguna cosa s'encalla, es recupera sola
   * ------------------------------------------------------------- */
  var darreraRecarrega = Date.now();
  function vigilant() {
    if (!config || mode === 'vinculacio') return;
    var it = actual && actual.item;
    var max = 120000;
    if (it) {
      var d = durada(it);
      max = (d ? d : (((config.media[it.mediaId] || {}).duration) || 600)) * 1000 + 90000;
      if (it.kind === 'web' && it.reload) max = Math.max(max, it.reload * 60000 + 90000);
    }
    if (Date.now() - darrerAvanc > max) { darrerError = 'Reproducció encallada: recuperada'; seguent(); }
    pintaAvisos();
    // Recàrrega diària de neteja (entre les 4 i les 5 de la matinada) si hi ha connexió.
    var l = local();
    if (!PREVIA && l.h === 4 && enLinia && Date.now() - darreraRecarrega > 3 * 3600000 && Date.now() - inici > 3600000) location.reload();
  }
  window.addEventListener('error', function (e) { darrerError = String(e.message || e).substr(0, 180); });
  window.addEventListener('unhandledrejection', function (e) { darrerError = String((e.reason && e.reason.message) || e.reason).substr(0, 180); });
  window.addEventListener('online', function () { posaEnLinia(true); if (token) sync(); });

  /* ---------------------------------------------------------------
   *  Interacció (comandament de la tele / teclat / ratolí)
   * ------------------------------------------------------------- */
  var elInfo = null;
  function configuraInteraccio() {
    var tCursor;
    var mou = function () { document.body.classList.remove('sense-cursor'); clearTimeout(tCursor); tCursor = setTimeout(function () { document.body.classList.add('sense-cursor'); }, 3000); };
    document.addEventListener('mousemove', mou); mou();
    var ambDocument = function () { return document.fullscreenElement || document.webkitFullscreenElement; };
    var jaEsCompleta = function () {
      return !!ambDocument() || window.matchMedia('(display-mode: fullscreen)').matches ||
        (window.innerHeight >= screen.height - 2 && window.innerWidth >= screen.width - 2);
    };
    var pista = null;
    var amagaPista = function () { pista = treu(pista); };
    var mostraPista = function () {
      if (PREVIA || pista || jaEsCompleta()) return;
      pista = document.createElement('div');
      pista.className = 'pista-fs';
      pista.textContent = 'Prem qualsevol botó per posar la pantalla completa';
      sup.appendChild(pista);
    };
    var pantallaCompleta = function () {
      if (PREVIA || ambDocument()) return Promise.resolve();
      var d = document.documentElement;
      var fn = d.requestFullscreen || d.webkitRequestFullscreen;
      if (!fn) return Promise.reject(new Error('sense pantalla completa'));
      try {
        var r = fn.call(d, { navigationUI: 'hide' });
        return r && r.then ? r.then(amagaPista) : (amagaPista(), Promise.resolve());
      } catch (e) { return Promise.reject(e); }
    };
    // Qualsevol tecla o clic posa la pantalla completa (els navegadors només ho permeten així).
    document.addEventListener('click', function () { pantallaCompleta().catch(function () {}); });
    document.addEventListener('keydown', function () { pantallaCompleta().catch(function () {}); }, true);
    // Als 10 segons ho intenta sol; si el navegador no ho deixa, mostra l'avís fins que algú premi un botó.
    setTimeout(function () {
      if (jaEsCompleta()) return;
      pantallaCompleta().then(function () { if (!jaEsCompleta()) mostraPista(); }, mostraPista);
    }, 10000);
    var enCanviar = function () { if (ambDocument()) amagaPista(); else setTimeout(mostraPista, 1500); };
    document.addEventListener('fullscreenchange', enCanviar);
    document.addEventListener('webkitfullscreenchange', enCanviar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') seguent();
      if (e.key === 'ArrowLeft') seguent(-1);
      if (e.key === 'i' || e.key === 'I' || e.key === 'Info' || e.key === 'ColorF0Red') mostraInfo();
    });
    // Evita que la pantalla s'apagui
    var bloqueig = function () { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); };
    bloqueig();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') bloqueig(); });
  }

  function mostraInfo() {
    if (elInfo) { elInfo = treu(elInfo); return; }
    var e = estatActual();
    elInfo = document.createElement('div');
    elInfo.className = 'info';
    elInfo.innerHTML = [
      '<b>' + Pnt.escapa(config ? config.screen.name : 'Pantalla') + '</b>',
      'Mostrant: ' + Pnt.escapa(e.item || '—'),
      'Elements actius: ' + e.items + ' · Fitxers guardats: ' + e.cached + (e.missing ? ' (en falten ' + e.missing + ')' : ''),
      'Connexió: ' + (enLinia ? 'correcta' : 'SENSE XARXA (mostra el contingut guardat)'),
      'Resolució: ' + e.res + ' · Versió ' + VERSIO,
      e.err ? 'Últim avís: ' + Pnt.escapa(e.err) : ''
    ].join('<br>');
    sup.appendChild(elInfo);
    setTimeout(function () { elInfo = treu(elInfo); }, 20000);
  }

  // Exposat per a proves automàtiques
  window.__pantalla = { estat: estatActual, seguent: seguent, config: function () { return config; } };

  engega();
})();
