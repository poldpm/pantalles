/* PANTALLES · Comunicació amb el servei (Apps Script) i utilitats compartides */
(function () {
  'use strict';
  var Pnt = window.Pnt = window.Pnt || {};
  var CFG = window.PANTALLES_CONFIG || {};

  Pnt.apiConfigurada = function () {
    return !!(CFG.apiUrl && /^https?:\/\//.test(CFG.apiUrl) && CFG.apiUrl.indexOf('ENGANXA') < 0);
  };

  /** Crida una acció del servei. Llança un Error amb .code si falla. */
  Pnt.api = function (action, dades, opcions) {
    opcions = opcions || {};
    var cos = Object.assign({ action: action }, dades || {});
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var temps = setTimeout(function () { if (ctrl) ctrl.abort(); }, opcions.timeout || 45000);
    return fetch(CFG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita la petició prèvia CORS
      body: JSON.stringify(cos),
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) { var e0 = new Error('El servei ha respost amb un error (' + r.status + ').'); e0.code = 'HTTP'; throw e0; }
      return r.json();
    }).then(function (j) {
      clearTimeout(temps);
      if (!j.ok) { var e = new Error(j.error || 'Error'); e.code = j.code || 'ERR'; throw e; }
      return j;
    }, function (err) {
      clearTimeout(temps);
      if (err && err.code) throw err;
      var e2 = new Error('No hi ha connexió amb el servei. Comprova la xarxa.');
      e2.code = 'XARXA';
      throw e2;
    });
  };

  /** base64 → Uint8Array */
  Pnt.b64aBytes = function (b64) {
    var bin = atob(b64), n = bin.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  /** ArrayBuffer/Uint8Array → base64 (per trossos, per no rebentar la pila) */
  Pnt.bytesAB64 = function (bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = '', pas = 0x8000;
    for (var i = 0; i < b.length; i += pas) s += String.fromCharCode.apply(null, b.subarray(i, i + pas));
    return btoa(s);
  };

  /** Descarrega un fitxer de la biblioteca per trossos. Retorna un Blob. */
  Pnt.descarregaMitja = function (mediaId, meta, credencials, enProgres) {
    var trossos = [];
    var offset = 0;
    function seguent(intents) {
      if (offset >= meta.size && meta.size > 0) return Promise.resolve(new Blob(trossos, { type: meta.mime }));
      return Pnt.api('chunk', Object.assign({ mediaId: mediaId, offset: offset }, credencials), { timeout: 120000 })
        .then(function (r) {
          var bytes = Pnt.b64aBytes(r.data);
          if (!bytes.length) throw new Error('Tros buit');
          trossos.push(bytes);
          offset += bytes.length;
          if (enProgres) enProgres(offset, meta.size);
          return seguent(0);
        }, function (err) {
          if (err.code === 'NO_EXISTEIX' || err.code === 'TOKEN' || err.code === 'SESSIO' || intents >= 3) throw err;
          return new Promise(function (ok) { setTimeout(ok, 2000 * (intents + 1)); }).then(function () { return seguent(intents + 1); });
        });
    }
    return seguent(0);
  };

  /* ---------- Hora local de l'escola (Europe/Madrid) ---------- */
  var formatador = null;
  try {
    formatador = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23'
    });
  } catch (e) { formatador = null; }
  var DIES_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /** Descompon un instant en data/hora de l'escola. */
  Pnt.horaLocal = function (ms) {
    var d = new Date(ms);
    if (formatador && formatador.formatToParts) {
      var p = {};
      formatador.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      var h = p.hour === '24' ? '00' : p.hour;
      return {
        date: p.year + '-' + p.month + '-' + p.day, time: h + ':' + p.minute,
        dow: DIES_EN[p.weekday], mins: parseInt(h, 10) * 60 + parseInt(p.minute, 10),
        y: +p.year, m: +p.month, d: +p.day, h: +h, mi: +p.minute, s: +p.second
      };
    }
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    return {
      date: d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()), time: z(d.getHours()) + ':' + z(d.getMinutes()),
      dow: d.getDay(), mins: d.getHours() * 60 + d.getMinutes(), y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(),
      h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds()
    };
  };

  function minuts(hhmm) { var p = String(hhmm).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }

  /** Diu si un horari {from,to,days,tFrom,tTo} està actiu en aquest moment. */
  Pnt.dinsHorari = function (h, local) {
    if (!h) return true;
    if (h.from && local.date < h.from) return false;
    if (h.to && local.date > h.to) return false;
    if (h.days && h.days.length && h.days.indexOf(local.dow) < 0) return false;
    if (h.tFrom || h.tTo) {
      var a = h.tFrom ? minuts(h.tFrom) : 0, b = h.tTo ? minuts(h.tTo) : 24 * 60;
      if (a <= b) { if (local.mins < a || local.mins >= b) return false; }
      else if (local.mins < a && local.mins >= b) return false; // creua mitjanit
    }
    return true;
  };

  var NOMS_DIES = ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'];
  Pnt.NOMS_DIES = NOMS_DIES;
  Pnt.NOMS_DIES_LLARGS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
  Pnt.NOMS_MESOS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

  function dataCurta(iso) { var p = iso.split('-'); return +p[2] + '/' + +p[1] + (p[0] !== String(new Date().getFullYear()) ? '/' + p[0] : ''); }

  /** Text llegible d'un horari: «del 3/11 al 7/11 · dl-dv · 8:00–9:30» */
  Pnt.resumHorari = function (h) {
    if (!h) return 'Sempre';
    var t = [];
    if (h.from && h.to) t.push(h.from === h.to ? 'el ' + dataCurta(h.from) : 'del ' + dataCurta(h.from) + ' al ' + dataCurta(h.to));
    else if (h.from) t.push('a partir del ' + dataCurta(h.from));
    else if (h.to) t.push('fins al ' + dataCurta(h.to));
    if (h.days && h.days.length) {
      var d = h.days.join(',');
      t.push(d === '1,2,3,4,5' ? 'feiners' : d === '0,6' ? 'caps de setmana' : h.days.map(function (x) { return NOMS_DIES[x]; }).join(', '));
    }
    if (h.tFrom || h.tTo) t.push((h.tFrom || '00:00') + '–' + (h.tTo || '24:00'));
    return t.join(' · ');
  };

  /** Estat d'un horari respecte avui: 'actiu' | 'futur' | 'caducat' | 'fora' */
  Pnt.estatHorari = function (h, local) {
    if (!h) return 'actiu';
    if (h.to && local.date > h.to) return 'caducat';
    if (h.from && local.date < h.from) return 'futur';
    return Pnt.dinsHorari(h, local) ? 'actiu' : 'fora';
  };

  Pnt.escapa = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** Converteix un enllaç de YouTube en l'adreça per incrustar-lo. */
  Pnt.youtubeEmbed = function (url, ambSo) {
    var id = null, llista = null, m;
    if ((m = url.match(/[?&]v=([\w-]{6,})/))) id = m[1];
    else if ((m = url.match(/youtu\.be\/([\w-]{6,})/))) id = m[1];
    else if ((m = url.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/))) id = m[1];
    if ((m = url.match(/[?&]list=([\w-]+)/))) llista = m[1];
    if (!id && !llista) return null;
    var base = 'https://www.youtube-nocookie.com/embed/' + (id || 'videoseries');
    var q = ['autoplay=1', 'mute=' + (ambSo ? 0 : 1), 'controls=0', 'rel=0', 'modestbranding=1', 'playsinline=1', 'loop=1'];
    if (llista) q.push('list=' + llista); else q.push('playlist=' + id);
    return base + '?' + q.join('&');
  };
})();
