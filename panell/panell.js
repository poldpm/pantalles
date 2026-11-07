/* =====================================================================
 *  PANTALLES · Panell de control
 *  Funciona a l'ordinador i al mòbil. Tots els canvis es desen sols.
 * ===================================================================== */
(function () {
  'use strict';
  var Pnt = window.Pnt;
  var esc = Pnt.escapa;

  /* ------------------------------------------------------------------
   *  Utilitats
   * ---------------------------------------------------------------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function troba(llista, id) { for (var i = 0; i < (llista || []).length; i++) if (llista[i].id === id) return llista[i]; return null; }
  function mida(b) {
    if (!b) return '';
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' kB';
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' MB';
    return (b / 1024 / 1024 / 1024).toFixed(1).replace('.', ',') + ' GB';
  }
  function duradaText(s) {
    if (!s) return '';
    s = Math.round(s);
    if (s < 60) return s + ' s';
    var m = Math.floor(s / 60), r = s % 60;
    return m + ' min' + (r ? ' ' + r + ' s' : '');
  }
  function araServidor() { return Date.now() + (S.desfas || 0); }
  function fa(ms) {
    var s = Math.max(0, Math.round((araServidor() - ms) / 1000));
    if (s < 60) return 'fa uns segons';
    if (s < 3600) return 'fa ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'fa ' + Math.round(s / 3600) + ' h';
    var d = Math.round(s / 86400);
    return 'fa ' + d + (d === 1 ? ' dia' : ' dies');
  }
  function dataHora(iso) {
    var d = new Date(iso);
    var avui = new Date();
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    var h = z(d.getHours()) + ':' + z(d.getMinutes());
    if (d.toDateString() === avui.toDateString()) return 'avui ' + h;
    var ahir = new Date(avui.getTime() - 864e5);
    if (d.toDateString() === ahir.toDateString()) return 'ahir ' + h;
    return d.getDate() + '/' + (d.getMonth() + 1) + (d.getFullYear() !== avui.getFullYear() ? '/' + d.getFullYear() : '') + ' ' + h;
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
  function carregaScript(url, global) {
    if (window[global]) return Promise.resolve(window[global]);
    return new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = function () { window[global] ? ok(window[global]) : ko(new Error('No s\'ha pogut carregar ' + global)); };
      s.onerror = function () { ko(new Error('No s\'ha pogut carregar una eina necessària. Comprova la connexió.')); };
      document.head.appendChild(s);
    });
  }
  // Llibreries incloses al projecte (no depenem de cap servei extern)
  var LIB = {
    sortable: '../comu/vendor/Sortable.min.js',
    qr: '../comu/vendor/qrcode.js',
    pdf: '../comu/vendor/pdf.min.js',
    pdfWorker: new URL('../comu/vendor/pdf.worker.min.js', location.href).href
  };
  function urlReproductor() { return new URL('../pantalla/', location.href).href; }

  /* ------------------------------------------------------------------
   *  Estat global
   * ---------------------------------------------------------------- */
  var S = {
    session: ls('pnt_session'),
    user: null,
    d: null,          // dades del servei
    thumbs: {},
    rev: null,
    desfas: 0,
    edicio: null,     // llista que s'està editant
    logos: {}         // url dels logotips { color, neg }
  };
  try { S.user = JSON.parse(ls('pnt_user') || 'null'); } catch (e) { S.user = null; }

  /* ------------------------------------------------------------------
   *  Comunicació
   * ---------------------------------------------------------------- */
  var desantN = 0;
  function indicador(estat, text) {
    var el = $('#indicador');
    if (!el) return;
    el.className = 'indicador ' + (estat || '');
    el.textContent = text || '';
  }
  function crida(accio, dades, opc) {
    opc = opc || {};
    var d = Object.assign({ session: S.session }, dades || {});
    if (opc.desa) { desantN++; indicador('desant', 'Desant…'); }
    return Pnt.api(accio, d, opc).then(function (r) {
      if (opc.desa) { desantN--; if (!desantN) indicador('', 'Tot desat ✓'); }
      return r;
    }, function (e) {
      if (opc.desa) { desantN--; indicador('error', 'No s\'ha desat'); }
      if (e.code === 'SESSIO') { surt(true); throw e; }
      if (!opc.silenci) toast(e.message, 'error');
      throw e;
    });
  }

  /* Miniatures: es demanen només les que falten i es guarden al navegador */
  try { S.thumbs = JSON.parse(ls('pnt_mini') || '{}') || {}; } catch (e) { S.thumbs = {}; }
  function miniaturesQueFalten() {
    if (!S.d) return Promise.resolve(false);
    var falten = S.d.media.map(function (m) { return m.id; }).filter(function (id) { return !S.thumbs[id]; });
    if (!falten.length) return Promise.resolve(false);
    var lots = [];
    for (var i = 0; i < falten.length; i += 150) lots.push(falten.slice(i, i + 150));
    return Promise.all(lots.map(function (ids) { return crida('thumbs', { ids: ids }, { silenci: true }); })).then(function (rs) {
      var algun = false;
      rs.forEach(function (r) { Object.keys(r.thumbs).forEach(function (id) { S.thumbs[id] = r.thumbs[id]; algun = true; }); });
      // Netegem les que ja no existeixen i guardem (si hi cap)
      var vives = {};
      S.d.media.forEach(function (m) { if (S.thumbs[m.id]) vives[m.id] = S.thumbs[m.id]; });
      S.thumbs = vives;
      ls('pnt_mini', JSON.stringify(vives));
      return algun;
    }, function () { return false; });
  }

  function carrega() {
    return crida('state', {}).then(function (r) {
      aplicaEstat(r);
      return Promise.all([miniaturesQueFalten(), carregaLogos()]).then(function () { return r; });
    });
  }

  /* Logotips: es descarreguen sencers (amb transparència) i es guarden al navegador */
  var logosCarregats = {};
  function carregaLogos() {
    if (!S.d) return Promise.resolve();
    var s = S.d.settings;
    var feines = [['color', s.logoMediaId], ['neg', s.logoNegMediaId]].map(function (x) {
      var tipus = x[0], id = x[1];
      if (!id) { S.logos[tipus] = null; return Promise.resolve(); }
      if (logosCarregats[tipus] === id && S.logos[tipus]) return Promise.resolve();
      var desat = ls('pnt_logo_' + tipus);
      if (desat && desat.indexOf(id + '|') === 0) { S.logos[tipus] = desat.substr(id.length + 1); logosCarregats[tipus] = id; return Promise.resolve(); }
      var m = troba(S.d.media, id);
      if (!m) return Promise.resolve();
      return Pnt.descarregaMitja(id, m, { session: S.session }).then(function (blob) {
        return new Promise(function (ok) {
          var lector = new FileReader();
          lector.onload = function () {
            S.logos[tipus] = lector.result; logosCarregats[tipus] = id;
            if (lector.result.length < 400000) ls('pnt_logo_' + tipus, id + '|' + lector.result);
            ok();
          };
          lector.onerror = function () { ok(); };
          lector.readAsDataURL(blob);
        });
      }, function () {});
    });
    return Promise.all(feines).then(pintaMarca);
  }
  function pintaMarca() {
    var a = $('#menu-marca');
    if (a) {
      a.innerHTML = S.logos.neg ? '<img class="logo-menu" alt="Vedruna Escorial Vic"><span class="sub-marca">Pantalles</span>' :
        '<span class="nom-marca">' + esc((S.d && S.d.settings.schoolName) || 'Vedruna Escorial Vic') + '</span><span class="sub-marca">Pantalles</span>';
      if (S.logos.neg) $('img', a).src = S.logos.neg;
    }
  }
  function aplicaEstat(r) {
    S.desfas = r.serverTime - Date.now();
    if (r.same) { S.d.status = r.status; return; }
    S.d = r;
    S.rev = r.rev;
    S.user = r.user;
    ls('pnt_user', JSON.stringify(r.user));
  }

  /* Refresc periòdic: l'estat de les pantalles i els canvis d'altres persones */
  var tRefresc = null;
  function refresca() {
    clearTimeout(tRefresc);
    if (!S.session || document.hidden) { tRefresc = setTimeout(refresca, 20000); return; }
    crida('state', { rev: S.rev }, { silenci: true }).then(function (r) {
      var abans = S.rev;
      aplicaEstat(r);
      return miniaturesQueFalten().then(function () { reRenderSiSegur(abans); });
    }, function () { indicador('error', 'Sense connexió'); })
      .then(function () { tRefresc = setTimeout(refresca, 20000); });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.session) refresca(); });

  function reRenderSiSegur(revAbans) {
    if (!$('#capa-modal').hidden) return;
    var act = document.activeElement;
    if (act && /INPUT|TEXTAREA|SELECT/.test(act.tagName) && $('#vista').contains(act)) return;
    var r = ruta();
    if (S.rev === revAbans) {
      // Només ha canviat l'estat de les pantalles
      if (r.sec === 'inici' || r.sec === 'pantalles' || r.sec === 'pantalla') render(true);
      return;
    }
    if (r.sec === 'llista' && S.edicio && (S.edicio.pendent || S.edicio.desant)) return;
    render(true);
  }

  /* ------------------------------------------------------------------
   *  Avisos flotants i finestres
   * ---------------------------------------------------------------- */
  function toast(msg, tipus, ms) {
    var t = document.createElement('div');
    t.className = 'toast ' + (tipus || '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(function () { t.remove(); }, 300); }, ms || (tipus === 'error' ? 6000 : 3200));
  }

  var modalActual = null;
  function obreModal(o) {
    tancaModal();
    var capa = $('#capa-modal');
    capa.innerHTML = '<div class="modal ' + (o.classe || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.titol) + '">' +
      '<div class="modal-cap"><h2>' + esc(o.titol) + '</h2><button class="btn fantasma icona" data-tanca aria-label="Tanca">' + IC('tanca') + '</button></div>' +
      '<div class="modal-cos">' + (o.cos || '') + '</div>' +
      (o.peu ? '<div class="modal-peu">' + o.peu + '</div>' : '') + '</div>';
    capa.hidden = false;
    document.body.style.overflow = 'hidden';
    var el = capa.firstChild;
    var m = { el: el, tanca: tancaModal, enTancar: o.enTancar };
    modalActual = m;
    $$('[data-tanca]', el).forEach(function (b) { b.onclick = tancaModal; });
    capa.onmousedown = function (e) { if (e.target === capa) capa._clicFora = true; };
    capa.onmouseup = function (e) { if (e.target === capa && capa._clicFora && !o.noTancarFora) tancaModal(); capa._clicFora = false; };
    if (o.enObrir) o.enObrir(el, m);
    var primer = $('[autofocus]', el) || $('input,select,textarea', el);
    if (primer && window.innerWidth > 700) setTimeout(function () { primer.focus(); }, 50);
    return m;
  }
  function tancaModal() {
    var capa = $('#capa-modal');
    if (capa.hidden) return;
    var m = modalActual;
    modalActual = null;
    capa.hidden = true;
    capa.innerHTML = '';
    document.body.style.overflow = '';
    if (m && m.enTancar) m.enTancar();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { tancaDesplegable(); tancaModal(); } });

  function confirma(titol, text, opc) {
    opc = opc || {};
    return new Promise(function (ok) {
      var resolt = false;
      obreModal({
        titol: titol,
        cos: '<p style="margin:0">' + text + '</p>',
        peu: '<button class="btn" data-no>Cancel·la</button><button class="btn ' + (opc.perill ? 'perill-ple' : 'primari') + '" data-si>' + esc(opc.ok || 'D\'acord') + '</button>',
        enObrir: function (el) {
          $('[data-no]', el).onclick = function () { resolt = true; tancaModal(); ok(false); };
          $('[data-si]', el).onclick = function () { resolt = true; tancaModal(); ok(true); };
          setTimeout(function () { $('[data-si]', el).focus(); }, 30);
        },
        enTancar: function () { if (!resolt) ok(false); }
      });
    });
  }

  var desplegable = null;
  function obreDesplegable(boto, opcions) {
    tancaDesplegable();
    var d = document.createElement('div');
    d.className = 'desplegable';
    d.innerHTML = opcions.map(function (o, i) {
      if (o.html) return o.html;
      return '<button data-i="' + i + '"' + (o.perill ? ' style="color:var(--error)"' : '') + '>' + o.text + '</button>';
    }).join('');
    document.body.appendChild(d);
    var r = boto.getBoundingClientRect();
    var w = d.offsetWidth, h = d.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
    var top = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
    d.style.left = left + window.scrollX + 'px';
    d.style.top = Math.max(8, top) + window.scrollY + 'px';
    $$('button[data-i]', d).forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); tancaDesplegable(); opcions[+b.dataset.i].fes(); };
    });
    desplegable = d;
    setTimeout(function () { document.addEventListener('click', tancaDesplegable, { once: true }); }, 0);
  }
  function tancaDesplegable() { if (desplegable) { desplegable.remove(); desplegable = null; } }

  /* ------------------------------------------------------------------
   *  Entrada / sortida
   * ---------------------------------------------------------------- */
  function mostraLogin() {
    var desat = ls('pnt_logo_neg'), img = $('#logo-login');
    if (desat && img) { img.src = desat.substr(desat.indexOf('|') + 1); img.hidden = false; }
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#carregant').classList.add('amagat');
    var correu = ls('pnt_correu') || '';
    $('#correu').value = correu;
    $('#form-correu').hidden = false;
    $('#form-codi').hidden = true;
    $('#login-error').textContent = '';
    if (!Pnt.apiConfigurada()) {
      $('#login-error').innerHTML = 'Falta configurar l\'adreça del servei al fitxer <b>config.js</b> (vegeu la guia).';
    }
  }
  function configuraLogin() {
    var enviant = false;
    $('#form-correu').onsubmit = function (e) {
      e.preventDefault();
      if (enviant) return;
      var correu = $('#correu').value.trim().toLowerCase();
      var b = $('#form-correu button');
      enviant = true; b.disabled = true; b.innerHTML = '<span class="roda petita"></span> Enviant…';
      $('#login-error').textContent = '';
      Pnt.api('loginStart', { email: correu }).then(function () {
        ls('pnt_correu', correu);
        $('#correu-enviat').textContent = correu;
        $('#form-correu').hidden = true;
        $('#form-codi').hidden = false;
        $('#codi').value = '';
        $('#codi').focus();
      }, function (err) { $('#login-error').textContent = err.message; })
        .then(function () { enviant = false; b.disabled = false; b.textContent = 'Envia\'m un codi'; });
    };
    $('#codi').oninput = function () {
      var v = this.value.replace(/\D/g, '').slice(0, 6);
      this.value = v;
      if (v.length === 6) $('#form-codi').requestSubmit ? $('#form-codi').requestSubmit() : $('#form-codi button[type=submit]').click();
    };
    $('#form-codi').onsubmit = function (e) {
      e.preventDefault();
      if (enviant) return;
      var b = $('#form-codi button[type=submit]');
      enviant = true; b.disabled = true; b.innerHTML = '<span class="roda petita"></span> Comprovant…';
      $('#login-error').textContent = '';
      var disp = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
      Pnt.api('loginVerify', { email: ls('pnt_correu'), code: $('#codi').value, device: disp }).then(function (r) {
        S.session = r.session; S.user = r.user;
        ls('pnt_session', r.session); ls('pnt_user', JSON.stringify(r.user));
        entra();
      }, function (err) { $('#login-error').textContent = err.message; $('#codi').select(); })
        .then(function () { enviant = false; b.disabled = false; b.textContent = 'Entra'; });
    };
    $('#torna-correu').onclick = function () { $('#form-codi').hidden = true; $('#form-correu').hidden = false; $('#login-error').textContent = ''; };
  }

  function surt(caducada) {
    if (S.session && !caducada) Pnt.api('logout', { session: S.session }).catch(function () {});
    S.session = null; S.d = null;
    ls('pnt_session', null);
    ls('pnt_mini', null); S.thumbs = {};
    clearTimeout(tRefresc);
    tancaModal();
    mostraLogin();
    if (caducada) $('#login-error').textContent = 'La sessió ha caducat. Torna a entrar.';
  }

  function entra() {
    $('#login').hidden = true;
    $('#carregant').classList.remove('amagat');
    carrega().then(function () {
      $('#app').hidden = false;
      $('#carregant').classList.add('amagat');
      var u = S.user || {};
      var b = $('#boto-usuari');
      b.textContent = ((u.name || u.email || '?').trim()[0] || '?').toUpperCase();
      b.title = u.email;
      b.onclick = function (e) {
        e.stopPropagation();
        obreDesplegable(b, [
          { html: '<div class="qui"><b>' + esc(u.name || '') + '</b><br>' + esc(u.email) + '<br>' + (u.role === 'admin' ? 'Administrador/a' : 'Editor/a') + '</div>' },
          { text: IC('ajustos') + 'Ajustos', fes: function () { location.hash = '#ajustos'; } },
          { text: IC('recarrega') + 'Recarrega les dades', fes: function () { carrega().then(function () { render(); toast('Dades actualitzades', 'ok'); }); } },
          { text: IC('surt') + 'Tanca la sessió', fes: function () { surt(false); } }
        ]);
      };
      render();
      tRefresc = setTimeout(refresca, 20000);
    }, function () {
      if (S.session) {
        $('#carregant').classList.add('amagat');
        $('#app').hidden = false;
        $('#vista').innerHTML = '<div class="buit"><div class="gran-ic">' + IC('alerta') + '</div><h3>No es pot connectar amb el servei</h3><p>Comprova la connexió a internet.</p><button class="btn primari" onclick="location.reload()">Torna-ho a provar</button></div>';
      }
    });
  }

  /* ------------------------------------------------------------------
   *  Rutes
   * ---------------------------------------------------------------- */
  function ruta() {
    var h = (location.hash || '#inici').substr(1).split('/');
    return { sec: h[0] || 'inici', id: h[1] ? decodeURIComponent(h[1]) : null };
  }
  var SECCIO_MENU = { inici: 'inici', pantalles: 'pantalles', pantalla: 'pantalles', llistes: 'llistes', llista: 'llistes', biblioteca: 'biblioteca', avisos: 'avisos', ajustos: 'ajustos', registre: 'ajustos' };
  var VISTES = {};
  var rutaAnterior = '';
  function render(mantenirScroll) {
    if (!S.d) return;
    var r = ruta();
    var clau = r.sec + '/' + r.id;
    if (clau !== rutaAnterior) { mantenirScroll = false; if (S.edicio && r.sec !== 'llista') desaEdicioAra(); }
    rutaAnterior = clau;
    var scroll = window.scrollY;
    $$('#menu a[data-sec]').forEach(function (a) { a.classList.toggle('actiu', a.dataset.sec === SECCIO_MENU[r.sec]); });
    var avisosActius = actius(S.d.alerts).length;
    var aAvisos = $('#menu a[data-sec=avisos]');
    var badge = $('.badge', aAvisos);
    if (avisosActius && !badge) aAvisos.insertAdjacentHTML('beforeend', '<span class="badge accent">' + avisosActius + '</span>');
    else if (badge) { if (avisosActius) badge.textContent = avisosActius; else badge.remove(); }
    var fn = VISTES[r.sec] || VISTES.inici;
    registreDiapos = {};
    fn(r.id);
    omplirDiapos($('#vista'));
    if (mantenirScroll) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () { tancaModal(); render(); });

  function titol(text, tornaHref, tornaText) {
    $('#barra-titol').innerHTML = (tornaHref ? '<a class="torna" href="' + tornaHref + '">‹ ' + esc(tornaText) + '</a>' : '') + '<span class="nom">' + esc(text) + '</span>';
    document.title = text + ' · Pantalles';
  }

  /* ------------------------------------------------------------------
   *  Peces comunes
   * ---------------------------------------------------------------- */
  function actius(avisos) {
    var ara = araServidor();
    return (avisos || []).filter(function (a) { return a.on !== false && (!a.until || Date.parse(a.until) > ara); });
  }

  function estatPantalla(p) {
    var st = S.d.status[p.id];
    if (!st || !st.seen) return { classe: '', text: 'Mai connectada', detall: 'Encara no s\'ha obert cap aparell amb aquesta pantalla.' };
    var edat = araServidor() - st.seen;
    if (edat < 100000) {
      var extra = st.missing ? ' · descarregant ' + st.missing + ' fitxer' + (st.missing > 1 ? 's' : '') : '';
      if (st.mode === 'repos') return { classe: 'info', text: 'En repòs (fora d\'horari)', detall: 'Connectada' + extra, st: st };
      if (st.mode === 'buit') return { classe: 'avis', text: 'Connectada · sense contingut', detall: 'No hi ha res programat per ara' + extra, st: st };
      if (st.mode === 'avis') return { classe: 'error', text: 'Mostrant un avís', detall: 'Avís a pantalla completa' + extra, st: st };
      if (st.mode === 'vinculacio' || st.mode === 'inici') return { classe: 'info', text: 'Engegant…', detall: '', st: st };
      return { classe: 'ok', text: 'En línia', detall: (st.item ? 'Ara: ' + st.item : '') + extra, st: st };
    }
    if (edat < 10 * 60000) return { classe: 'avis', text: 'Connexió irregular', detall: 'Última connexió ' + fa(st.seen), st: st };
    return { classe: 'error', text: 'Sense connexió', detall: 'Última connexió ' + fa(st.seen) + '. Pot ser que la tele estigui apagada o sense xarxa (continua mostrant el contingut guardat si està encesa).', st: st };
  }

  function connectada(p) { var st = S.d.status[p.id]; return !!(st && st.seen && araServidor() - st.seen < 100000); }

  var ICONES = { media: IC('biblioteca'), text: IC('text'), web: IC('web'), youtube: IC('play'), clock: IC('rellotge'), countdown: IC('compte') };
  var NOMS_TIPUS = { text: 'Text', web: 'Web', youtube: 'YouTube', clock: 'Rellotge', countdown: 'Compte enrere', image: 'Foto', video: 'Vídeo' };

  function nomItem(it) {
    if (it.name) return it.name;
    if (it.kind === 'media') { var m = troba(S.d.media, it.mediaId); return m ? m.name : '(fitxer esborrat)'; }
    if (it.kind === 'clock') return (it.text && it.text.title) || 'Rellotge i data';
    if (it.text && it.text.title) return it.text.title;
    if (it.url) return it.url.replace(/^https?:\/\/(www\.)?/, '').substr(0, 60);
    return NOMS_TIPUS[it.kind] || it.kind;
  }
  function tipusItem(it) {
    if (it.kind === 'media') { var m = troba(S.d.media, it.mediaId); return m ? NOMS_TIPUS[m.kind] : 'Fitxer'; }
    return NOMS_TIPUS[it.kind];
  }
  var comptadorDiapos = 0;
  function miniItem(it, classe) {
    if (it.kind === 'media') {
      var m = troba(S.d.media, it.mediaId);
      var th = S.thumbs[it.mediaId];
      return '<div class="miniatura ' + (classe || '') + '" style="' + (th ? 'background-image:url(\'' + th + '\')' : '') + '">' + (th ? '' : IC('biblioteca')) +
        (m && m.kind === 'video' ? '<span class="tipus">' + IC('play') + (m.duration ? duradaText(m.duration) : 'vídeo') + '</span>' : '') + '</div>';
    }
    if (it.kind === 'text' || it.kind === 'clock' || it.kind === 'countdown') {
      var clau = 'd' + (++comptadorDiapos);
      registreDiapos[clau] = it;
      return '<div class="miniatura diapo ' + (classe || '') + '" data-diapo="' + clau + '"></div>';
    }
    if (it.kind === 'youtube') return '<div class="miniatura ' + (classe || '') + '" style="background:#e62117;color:#fff">' + IC('play') + '</div>';
    return '<div class="miniatura ' + (classe || '') + '">' + (ICONES[it.kind] || '?') + '</div>';
  }

  function chipLlista(l) {
    return '<span class="chip"><span class="color" style="background:' + esc(l.color) + '"></span>' + esc(l.name) + '</span>';
  }

  /** Elements que una pantalla mostraria ara mateix. */
  function elementsAra(p) {
    var l = Pnt.horaLocal(araServidor());
    var res = [];
    (p.playlists || []).forEach(function (id) {
      var ll = troba(S.d.playlists, id);
      if (!ll || ll.on === false || !Pnt.dinsHorari(ll.schedule, l)) return;
      ll.items.forEach(function (it) {
        if (it.on !== false && Pnt.dinsHorari(it.schedule, l)) res.push(it);
      });
    });
    return res;
  }

  function badgeHorari(h) {
    if (!h) return '';
    var e = Pnt.estatHorari(h, Pnt.horaLocal(araServidor()));
    var cls = { actiu: 'ok', futur: 'info', caducat: 'error', fora: '' }[e];
    var txt = { actiu: 'Ara actiu', futur: 'Encara no', caducat: 'Caducat', fora: 'Ara no toca' }[e];
    return '<span class="badge ' + cls + '" title="' + esc(Pnt.resumHorari(h)) + '">' + IC('calendari') + esc(Pnt.resumHorari(h)) + ' · ' + txt + '</span>';
  }

  /* ---------- Editor d'horaris (reutilitzable) ---------- */
  function htmlHorari(h, opc) {
    opc = opc || {};
    var prog = !!h;
    h = h || {};
    var dies = [1, 2, 3, 4, 5, 6, 0];
    return '<div class="pila horari" data-horari>' +
      '<div class="segment"><label><input type="radio" name="h-mode" value="sempre"' + (prog ? '' : ' checked') + '><span>' + esc(opc.sempre || 'Sempre') + '</span></label>' +
      '<label><input type="radio" name="h-mode" value="prog"' + (prog ? ' checked' : '') + '><span>Programat</span></label></div>' +
      '<div class="pila" data-h-detall' + (prog ? '' : ' hidden') + '>' +
      '<div class="btns"><span class="subtil">Ràpid:</span><button type="button" class="btn petit" data-preset="avui">Només avui</button>' +
      '<button type="button" class="btn petit" data-preset="setmana">Aquesta setmana</button><button type="button" class="btn petit" data-preset="mes">Un mes</button>' +
      '<button type="button" class="btn petit" data-preset="feiners">Feiners</button></div>' +
      '<div class="fila"><label class="camp">Des del dia<input type="date" data-h="from" value="' + esc(h.from || '') + '"></label>' +
      '<label class="camp">Fins al dia (inclòs)<input type="date" data-h="to" value="' + esc(h.to || '') + '"></label></div>' +
      '<div class="camp">Dies de la setmana <span class="ajuda">Si no en marques cap, tots els dies.</span><div class="dies">' +
      dies.map(function (d) { return '<label><input type="checkbox" data-dia="' + d + '"' + ((h.days || []).indexOf(d) >= 0 ? ' checked' : '') + '><span>' + Pnt.NOMS_DIES[d] + '</span></label>'; }).join('') +
      '</div></div>' +
      '<div class="fila"><label class="camp">Des de l\'hora<input type="time" data-h="tFrom" value="' + esc(h.tFrom || '') + '"></label>' +
      '<label class="camp">Fins a l\'hora<input type="time" data-h="tTo" value="' + esc(h.tTo || '') + '"></label></div>' +
      '<div class="subtil" data-h-resum></div></div></div>';
  }
  function activaHorari(cont, enCanvi) {
    var arrel = $('[data-horari]', cont);
    if (!arrel) return;
    var detall = $('[data-h-detall]', arrel);
    var resum = function () {
      var h = llegeixHorari(cont);
      $('[data-h-resum]', arrel).textContent = h ? 'Es mostrarà: ' + Pnt.resumHorari(h) : 'Completa almenys un camp.';
      if (enCanvi) enCanvi(h);
    };
    $$('input[name=h-mode]', arrel).forEach(function (r) {
      r.onchange = function () { detall.hidden = $('input[name=h-mode]:checked', arrel).value !== 'prog'; resum(); };
    });
    $$('input', detall).forEach(function (i) { i.addEventListener('change', resum); i.addEventListener('input', resum); });
    $$('[data-preset]', arrel).forEach(function (b) {
      b.onclick = function () {
        var l = Pnt.horaLocal(araServidor());
        var avui = l.date;
        var suma = function (dies) { var d = new Date(Date.UTC(l.y, l.m - 1, l.d) + dies * 864e5); return d.toISOString().substr(0, 10); };
        var p = b.dataset.preset;
        if (p === 'avui') { $('[data-h=from]', arrel).value = avui; $('[data-h=to]', arrel).value = avui; }
        if (p === 'setmana') { $('[data-h=from]', arrel).value = avui; $('[data-h=to]', arrel).value = suma((7 - l.dow) % 7); }
        if (p === 'mes') { $('[data-h=from]', arrel).value = avui; $('[data-h=to]', arrel).value = suma(30); }
        if (p === 'feiners') $$('[data-dia]', arrel).forEach(function (c) { c.checked = ['1', '2', '3', '4', '5'].indexOf(c.dataset.dia) >= 0; });
        resum();
      };
    });
    if (!detall.hidden) resum();
  }
  function llegeixHorari(cont) {
    var arrel = $('[data-horari]', cont);
    if (!arrel || $('input[name=h-mode]:checked', arrel).value !== 'prog') return null;
    var h = {
      from: $('[data-h=from]', arrel).value, to: $('[data-h=to]', arrel).value,
      tFrom: $('[data-h=tFrom]', arrel).value, tTo: $('[data-h=tTo]', arrel).value,
      days: $$('[data-dia]:checked', arrel).map(function (c) { return +c.dataset.dia; })
    };
    if (h.from && h.to && h.to < h.from) { var t = h.from; h.from = h.to; h.to = t; }
    if (h.days.length === 7) h.days = [];
    if (!h.from && !h.to && !h.days.length && !h.tFrom && !h.tTo) return null;
    return h;
  }

  /* ------------------------------------------------------------------
   *  INICI
   * ---------------------------------------------------------------- */
  var VERSIO_SERVEI = '1.2.0';
  function serveiAntic() {
    var v = (S.d && S.d.version) || '0';
    var a = v.split('.').map(Number), b = VERSIO_SERVEI.split('.').map(Number);
    for (var i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) < b[i]; }
    return false;
  }
  function htmlAvisServei() {
    if (!serveiAntic()) return '';
    return '<div class="avis-servei"><b>Cal actualitzar el servei de Google.</b> El panell ja té la versió ' + VERSIO_SERVEI +
      ', però el servei de Google encara és la ' + esc(S.d.version || '?') + '. ' +
      (S.user && S.user.role === 'admin' ? 'Ves a <a href="#ajustos">Ajustos → Servei</a> i prem «Actualitza ara». Si és el primer cop, segueix els passos de la GUIA (apartat «Actualitzacions automàtiques»).' : 'Avisa un administrador.') + '</div>';
  }

  VISTES.inici = function () {
    titol('Inici');
    var d = S.d, u = S.user || {};
    var l = Pnt.horaLocal(araServidor());
    var salut = l.h < 14 ? 'Bon dia' : l.h < 20 ? 'Bona tarda' : 'Bona nit';
    var nom = (u.name || '').split(' ')[0];
    var av = actius(d.alerts);
    var enLinia = d.screens.filter(connectada).length;
    var html = htmlAvisServei() + '<div class="salutacio"><h2>' + salut + (nom ? ', ' + esc(nom) : '') + '</h2><p>' +
      esc(Pnt.NOMS_DIES_LLARGS[l.dow]) + ', ' + l.d + ' de ' + Pnt.NOMS_MESOS[l.m - 1] + ' · ' + esc(d.settings.schoolName) + '</p></div>';

    html += '<div class="resum">' +
      '<a class="targeta xifra" href="#pantalles"><div class="n">' + enLinia + '<span class="subtil" style="font-size:16px"> / ' + d.screens.length + '</span></div><div class="e">pantalles en línia</div></a>' +
      '<a class="targeta xifra" href="#llistes"><div class="n">' + d.playlists.length + '</div><div class="e">llistes de contingut</div></a>' +
      '<a class="targeta xifra" href="#biblioteca"><div class="n">' + d.media.length + '</div><div class="e">fotos i vídeos</div></a>' +
      '<a class="targeta xifra" href="#avisos"><div class="n" style="' + (av.length ? 'color:var(--error)' : '') + '">' + av.length + '</div><div class="e">avisos actius</div></a></div>';

    html += '<div class="fila" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">' +
      '<button class="boto-urgent" data-accio="urgent"><span class="gran-ic">' + IC('alerta') + '</span><span><b>Avís urgent</b>Mostra un missatge ara mateix a les pantalles</span></button>' +
      '<button class="targeta btn" style="justify-content:flex-start;padding:16px 18px;gap:14px;height:auto" data-accio="pujar"><span style="display:inline-flex;width:52px;height:52px;align-items:center;justify-content:center;background:var(--accent-suau);color:var(--accent)">' + IC('pujar', 26) + '</span><span style="text-align:left"><b style="display:block;font-size:16px">Pujar fotos o vídeos</b><span class="subtil" style="font-weight:400">També PDF i presentacions del Canva</span></span></button></div>';

    if (av.length) {
      html += '<div class="seccio"><h3>Avisos que s\'estan mostrant</h3><div class="pila">' + av.map(htmlAvis).join('') + '</div></div>';
    }

    var alertes = [];
    if (!d.screens.length) alertes.push('Encara no hi ha cap pantalla. <a href="#pantalles">Afegeix la primera pantalla</a>.');
    d.screens.forEach(function (p) {
      if (!p.playlists.length) alertes.push('La pantalla <b>' + esc(p.name) + '</b> no té cap llista assignada. <a href="#pantalla/' + p.id + '">Assigna-n\'hi una</a>.');
      else if (!elementsAra(p).length) alertes.push('La pantalla <b>' + esc(p.name) + '</b> no té res programat per ara mateix: mostra el logotip i l\'hora.');
      var e = estatPantalla(p);
      if (e.classe === 'error' && e.text === 'Sense connexió') alertes.push('La pantalla <b>' + esc(p.name) + '</b> no es connecta des de ' + fa(e.st.seen).replace('fa ', 'fa ') + '.');
    });
    var dema = new Date(Date.UTC(l.y, l.m - 1, l.d) + 864e5).toISOString().substr(0, 10);
    d.playlists.forEach(function (ll) {
      ll.items.forEach(function (it) {
        if (it.schedule && it.schedule.to && (it.schedule.to === l.date || it.schedule.to === dema)) {
          alertes.push('«' + esc(nomItem(it)) + '» de la llista <a href="#llista/' + ll.id + '">' + esc(ll.name) + '</a> deixa de mostrar-se ' + (it.schedule.to === l.date ? 'avui' : 'demà') + '.');
        }
      });
    });
    if (alertes.length) html += '<div class="seccio"><h3>Cal revisar</h3><div class="pila">' + alertes.map(function (a) { return '<div class="avis-caixa">' + a + '</div>'; }).join('') + '</div></div>';

    html += '<div class="seccio"><h3>Ara mateix a les pantalles</h3>';
    if (d.screens.length) html += '<div class="graella">' + d.screens.map(targetaPantalla).join('') + '</div>';
    else html += '<div class="targeta buit"><div class="gran-ic">' + IC('pantalles') + '</div><h3>Cap pantalla encara</h3><p>Obre el reproductor a la tele i vincula-la amb el codi que surt.</p><a class="btn primari" href="#pantalles">Afegir pantalla</a></div>';
    html += '</div>';

    var reg = (d.log || []).slice(0, 6);
    if (reg.length) html += '<div class="seccio"><h3>Últims canvis</h3><div class="targeta pad"><ul class="registre">' + reg.map(htmlRegistre).join('') + '</ul><div style="margin-top:10px"><a href="#registre">Veure tot el registre →</a></div></div></div>';

    $('#vista').innerHTML = html;
    $('[data-accio=urgent]').onclick = function () { editaAvis(null); };
    $('[data-accio=pujar]').onclick = function () { triaFitxersIPuja(null); };
    activaTargetesPantalla($('#vista'));
    activaAvisos($('#vista'));
  };

  function htmlRegistre(r) {
    return '<li><span class="quan">' + dataHora(r.at) + '</span><span>' + esc(r.what) + ' <span class="qui">· ' + esc((r.by || '').split('@')[0]) + '</span></span></li>';
  }

  function targetaPantalla(p) {
    var e = estatPantalla(p);
    var ara = elementsAra(p);
    var itemActual = null;
    if (e.st && e.st.itemId) S.d.playlists.forEach(function (ll) { var x = troba(ll.items, e.st.itemId); if (x) itemActual = x; });
    var mostra = itemActual || ara[0] || null;
    var mini = mostra ? miniItem(mostra) : null;
    var fons = '', diapo = '';
    if (mini && mini.indexOf('data-diapo') >= 0) diapo = mini.replace('class="miniatura diapo', 'style="position:absolute;top:0;left:0;right:0;bottom:0;width:auto;height:auto" class="miniatura diapo');
    else if (mini) {
      var m = /background(?:-image)?:([^"]+)"/.exec(mini);
      fons = m ? m[1].replace(/&quot;/g, '"') : '';
    }
    var llistes = p.playlists.map(function (id) { return troba(S.d.playlists, id); }).filter(Boolean);
    return '<div class="targeta t-pantalla" data-pantalla="' + p.id + '">' +
      '<div class="mini" data-previa="' + p.id + '" title="Vista prèvia" style="' + (fons ? 'background:' + esc(fons).replace(/&#39;/g, "'") + ';background-size:cover;background-position:center' : '') + '">' +
      diapo + (fons || diapo ? '' : '<div class="sense">' + (ara.length ? '' : 'Sense contingut ara mateix') + '</div>') +
      '<span class="estat badge ' + e.classe + '"><span class="punt"></span>' + esc(e.text) + '</span><span class="veure">' + IC('previa') + 'Vista prèvia</span></div>' +
      '<div class="cos"><h3>' + esc(p.name) + '</h3>' +
      (p.location ? '<div class="subtil">' + esc(p.location) + '</div>' : '') +
      (e.detall ? '<div class="molt-subtil">' + esc(e.detall) + '</div>' : '') +
      '<div class="chips">' + (llistes.length ? llistes.map(chipLlista).join('') : '<span class="badge avis">Sense llistes</span>') + '</div>' +
      '<div class="molt-subtil">' + ara.length + ' element' + (ara.length === 1 ? '' : 's') + ' actius ara</div></div>' +
      '<div class="peu"><a class="btn petit" href="#pantalla/' + p.id + '">' + IC('ajustos') + 'Configura</a><button class="btn petit" data-identifica="' + p.id + '" title="Mostra el nom a la tele durant 20 segons">' + IC('identifica') + 'Identifica</button></div></div>';
  }
  function activaTargetesPantalla(cont) {
    $$('[data-previa]', cont).forEach(function (b) { b.onclick = function () { vistaPrevia(b.dataset.previa); }; });
    $$('[data-identifica]', cont).forEach(function (b) {
      b.onclick = function () {
        crida('screenCommand', { id: b.dataset.identifica, type: 'identify' }, { desa: true }).then(function () { toast('La pantalla mostrarà el seu nom en uns segons (quan es connecti).', 'ok'); });
      };
    });
  }

  /* ---------- Vista prèvia d'una pantalla ---------- */
  function vistaPrevia(id) {
    var p = troba(S.d.screens, id);
    if (!p) return;
    var vertical = p.orientation === 90 || p.orientation === 270;
    obreModal({
      titol: 'Vista prèvia · ' + p.name,
      classe: 'molt-ample',
      cos: '<div class="marc-previa' + (vertical ? ' vertical' : '') + '"><iframe title="Vista prèvia" src="../pantalla/?preview=' + encodeURIComponent(id) + '"></iframe></div>' +
        '<p class="subtil" style="margin-bottom:0">És exactament el que mostra la pantalla ara (segons l\'hora i la programació). Els fitxers es descarreguen al moment, pot trigar uns segons. Els avisos també hi surten.</p>',
      peu: '<button class="btn" data-ant>‹ Anterior</button><button class="btn" data-seg>Següent ›</button><button class="btn primari" data-tanca>Tanca</button>',
      enObrir: function (el) {
        var marc = $('.marc-previa', el), fr = $('iframe', el);
        var ajusta = function () { var w = marc.clientWidth; fr.style.transform = 'scale(' + (w / (vertical ? 1080 : 1920)) + ')'; };
        ajusta();
        var ro = window.ResizeObserver ? new ResizeObserver(ajusta) : null;
        if (ro) ro.observe(marc); else window.addEventListener('resize', ajusta);
        $('[data-seg]', el).onclick = function () { fr.contentWindow.postMessage({ tipus: 'seguent' }, location.origin); };
        $('[data-ant]', el).onclick = function () { fr.contentWindow.postMessage({ tipus: 'anterior' }, location.origin); };
      }
    });
  }

  /* ------------------------------------------------------------------
   *  PANTALLES
   * ---------------------------------------------------------------- */
  VISTES.pantalles = function () {
    titol('Pantalles');
    var d = S.d;
    var html = '<div class="capcalera"><div><h2>Pantalles</h2><p>Cada tele, monitor o aparell que mostra contingut.</p></div>' +
      '<div class="btns"><button class="btn" data-accio="totes" title="Torna a carregar l\'aplicació a totes les pantalles">' + IC('recarrega') + 'Reinicia-les totes</button><button class="btn primari" data-accio="afegir">' + IC('mes') + 'Afegir pantalla</button></div></div>';
    if (!d.screens.length) {
      html += '<div class="targeta buit"><div class="gran-ic">' + IC('pantalles') + '</div><h3>Encara no hi ha cap pantalla</h3>' +
        '<p>1. A la tele (o a l\'aparell connectat a la tele) obre el navegador i ves a:<br><b>' + esc(urlReproductor()) + '</b><br>2. Sortirà un codi de 6 xifres.<br>3. Prem «Afegir pantalla» i escriu-lo.</p>' +
        '<button class="btn primari" data-accio="afegir">' + IC('mes') + 'Afegir pantalla</button></div>';
    } else html += '<div class="graella">' + d.screens.map(targetaPantalla).join('') + '</div>';
    $('#vista').innerHTML = html;
    $$('[data-accio=afegir]').forEach(function (b) { b.onclick = afegirPantalla; });
    var t = $('[data-accio=totes]');
    if (t) t.onclick = function () {
      confirma('Reiniciar totes les pantalles', 'Totes les pantalles tornaran a carregar l\'aplicació (tarden uns segons). Va bé si alguna fa coses estranyes.', { ok: 'Reinicia-les' }).then(function (si) {
        if (si) crida('screenCommand', { id: 'all', type: 'reload' }, { desa: true }).then(function () { toast('Ordre enviada. Les pantalles es reiniciaran en menys d\'un minut.', 'ok'); });
      });
    };
    activaTargetesPantalla($('#vista'));
  };

  function afegirPantalla(idExistent) {
    var substitueix = typeof idExistent === 'string' ? troba(S.d.screens, idExistent) : null;
    var llistes = S.d.playlists;
    obreModal({
      titol: substitueix ? 'Canviar l\'aparell de «' + substitueix.name + '»' : 'Afegir una pantalla',
      cos: '<div class="pila">' +
        '<div class="avis-caixa info">A la tele (o al miniPC, Chromecast, ordinador… connectat a la tele) obre el navegador i ves a:<br><b style="word-break:break-all">' + esc(urlReproductor()) + '</b><br>Sortirà un codi de 6 xifres a la pantalla.</div>' +
        '<label class="camp">Codi que surt a la pantalla<input type="text" class="codi-gran" inputmode="numeric" maxlength="7" placeholder="000 000" data-codi autofocus></label>' +
        (substitueix ? '<p class="subtil">L\'aparell antic deixarà de funcionar i el nou mostrarà el mateix contingut i configuració.</p>' :
          '<div class="fila"><label class="camp">Nom de la pantalla<input type="text" data-nom placeholder="Recepció principal" maxlength="80"></label>' +
          '<label class="camp">On és (opcional)<input type="text" data-lloc placeholder="Entrada c/ Escorial" maxlength="120"></label></div>' +
          (llistes.length ? '<div class="camp">Què ha de mostrar<div class="pila" style="gap:8px;font-weight:500">' + llistes.map(function (l) {
            return '<label class="interruptor"><input type="checkbox" data-llista="' + l.id + '"' + (llistes.length === 1 ? ' checked' : '') + '> ' + chipLlista(l) + ' <span class="molt-subtil">' + l.items.length + ' elements</span></label>';
          }).join('') + '</div></div>' : '')) +
        '<details><summary class="subtil" style="cursor:pointer">No pots escriure a la tele o no surt el codi? Fes servir un enllaç</summary><div class="pila" style="margin-top:10px">' +
        '<p class="subtil" style="margin:0">Es crea la pantalla i et donem un enllaç (i un codi QR) per obrir directament a l\'aparell.</p>' +
        '<button class="btn" data-enllac>Crear amb enllaç</button></div></details></div>',
      peu: '<button class="btn" data-tanca>Cancel·la</button><button class="btn primari" data-vincula>Vincula la pantalla</button>',
      enObrir: function (el) {
        var inp = $('[data-codi]', el);
        inp.oninput = function () { var v = inp.value.replace(/\D/g, '').slice(0, 6); inp.value = v.length > 3 ? v.substr(0, 3) + ' ' + v.substr(3) : v; };
        var vincula = function () {
          var codi = inp.value.replace(/\D/g, '');
          if (codi.length !== 6) { toast('El codi té 6 xifres.', 'error'); inp.focus(); return; }
          var b = $('[data-vincula]', el); b.disabled = true; b.innerHTML = '<span class="roda petita"></span> Vinculant…';
          var dades = substitueix ? { code: codi, screenId: substitueix.id } : {
            code: codi, name: ($('[data-nom]', el).value || '').trim() || 'Pantalla ' + (S.d.screens.length + 1),
            location: ($('[data-lloc]', el).value || '').trim(),
            playlists: $$('[data-llista]:checked', el).map(function (c) { return c.dataset.llista; })
          };
          crida('pairScreen', dades, { desa: true }).then(function (r) {
            tancaModal();
            toast(substitueix ? 'Aparell canviat. En uns segons començarà a mostrar el contingut.' : 'Pantalla vinculada! En uns segons començarà a mostrar el contingut.', 'ok', 5000);
            return carrega().then(function () { location.hash = '#pantalla/' + r.screen.id; render(); });
          }, function () { b.disabled = false; b.textContent = 'Vincula la pantalla'; });
        };
        $('[data-vincula]', el).onclick = vincula;
        inp.onkeydown = function (e) { if (e.key === 'Enter') vincula(); };
        $('[data-enllac]', el).onclick = function () {
          if (substitueix) { tancaModal(); enllacPantalla(substitueix.id); return; }
          var nom = ($('[data-nom]', el).value || '').trim() || 'Pantalla ' + (S.d.screens.length + 1);
          crida('createScreen', { name: nom, location: ($('[data-lloc]', el).value || '').trim() }, { desa: true }).then(function (r) {
            var ids = $$('[data-llista]:checked', el).map(function (c) { return c.dataset.llista; });
            var p = r.screen; p.playlists = ids;
            var fi = ids.length ? crida('saveScreen', { screen: p }, { desa: true }) : Promise.resolve();
            return fi.then(function () { return carrega(); }).then(function () {
              tancaModal(); location.hash = '#pantalla/' + p.id; render();
              mostraEnllac(p, r.token);
            });
          });
        };
      }
    });
  }

  function enllacPantalla(id) {
    var p = troba(S.d.screens, id);
    crida('screenLink', { id: id }).then(function (r) { mostraEnllac(p, r.token); });
  }
  function mostraEnllac(p, token) {
    var url = urlReproductor() + '?t=' + token;
    obreModal({
      titol: 'Enllaç de «' + p.name + '»',
      cos: '<div class="pila"><p style="margin:0">Obre aquest enllaç al navegador de l\'aparell de la tele. Quedarà vinculat i l\'enllaç desapareixerà de la barra d\'adreces.</p>' +
        '<div class="copiar"><input type="text" readonly value="' + esc(url) + '"><button class="btn" data-copia>Copia</button></div>' +
        '<div style="text-align:center"><div class="qr" data-qr><span class="roda"></span></div><div class="molt-subtil">Escaneja\'l amb l\'aparell (si té càmera) o amb el mòbil per enviar-te\'l.</div></div>' +
        '<div class="avis-caixa">' + IC('alerta') + 'Qui tingui aquest enllaç pot veure el contingut d\'aquesta pantalla. No el comparteixis. Si cal, el pots renovar des de la configuració de la pantalla.</div></div>',
      peu: '<button class="btn primari" data-tanca>Fet</button>',
      enObrir: function (el) {
        $('[data-copia]', el).onclick = function () {
          var i = $('input', el); i.select();
          (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Copiat', 'ok'); }, function () { document.execCommand('copy'); toast('Copiat', 'ok'); });
        };
        dibuixaQr($('[data-qr]', el), url);
      }
    });
  }
  function dibuixaQr(cont, text) {
    carregaScript(LIB.qr, 'qrcode').then(function (qrcode) {
      var q = qrcode(0, 'M'); q.addData(text); q.make();
      cont.innerHTML = '<img alt="Codi QR" src="' + q.createDataURL(6, 2) + '">';
    }, function () { cont.innerHTML = '<span class="molt-subtil">No s\'ha pogut generar el QR</span>'; });
  }

  VISTES.pantalla = function (id) {
    var p = troba(S.d.screens, id);
    if (!p) { location.hash = '#pantalles'; return; }
    titol(p.name, '#pantalles', 'Pantalles');
    var e = estatPantalla(p);
    var st = e.st || {};
    var esAdmin = S.user && S.user.role === 'admin';
    var assignades = p.playlists.map(function (x) { return troba(S.d.playlists, x); }).filter(Boolean);
    var noAssignades = S.d.playlists.filter(function (l) { return p.playlists.indexOf(l.id) < 0; });
    var o = p.overlays || {}, h = p.hours || {};
    var opt = function (v, actual, text) { return '<option value="' + v + '"' + (String(v) === String(actual) ? ' selected' : '') + '>' + text + '</option>'; };
    var html = '<div class="capcalera"><div><h2>' + esc(p.name) + '</h2><p><span class="badge ' + e.classe + '"><span class="punt"></span>' + esc(e.text) + '</span> ' + esc(e.detall || '') + '</p></div>' +
      '<div class="btns"><button class="btn primari" data-accio="previa">' + IC('previa') + 'Vista prèvia</button><button class="btn" data-accio="identifica">' + IC('identifica') + 'Identifica</button><button class="btn icona" data-accio="mes" aria-label="Més opcions">' + IC('puntets') + '</button></div></div>';

    html += '<div class="fila" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">';
    // Contingut
    html += '<div class="targeta pad pila"><h3 style="margin:0">Què mostra</h3>' +
      '<p class="subtil" style="margin:0">Les llistes es reprodueixen en aquest ordre, una darrere l\'altra. Cada element només surt quan toca segons la seva programació.</p>' +
      '<div class="pila" style="gap:8px">' + (assignades.length ? assignades.map(function (l, i) {
        return '<div class="item"><span class="num">' + (i + 1) + '</span><div class="text"><b><span class="chip" style="background:none;padding:0"><span class="color" style="background:' + esc(l.color) + '"></span>' + esc(l.name) + '</span></b>' +
          '<div class="meta">' + l.items.length + ' elements' + (l.on === false ? ' · <span class="badge error">Llista aturada</span>' : '') + (l.schedule ? ' · ' + badgeHorari(l.schedule) : '') + '</div></div>' +
          '<div class="accions"><button class="btn fantasma icona" data-amunt="' + i + '" aria-label="Amunt"' + (i === 0 ? ' disabled' : '') + '>' + IC('amunt') + '</button>' +
          '<button class="btn fantasma icona" data-avall="' + i + '" aria-label="Avall"' + (i === assignades.length - 1 ? ' disabled' : '') + '>' + IC('avall') + '</button>' +
          '<a class="btn fantasma icona" href="#llista/' + l.id + '" aria-label="Edita la llista">' + IC('edita') + '</a>' +
          '<button class="btn fantasma icona" data-treu="' + l.id + '" aria-label="Treu">' + IC('tanca') + '</button></div></div>';
      }).join('') : '<div class="avis-caixa">Aquesta pantalla no té cap llista. Ara mateix mostra el logotip, el nom de l\'escola i l\'hora.</div>') + '</div>' +
      (noAssignades.length ? '<div class="btns"><select data-afegeix-llista style="max-width:260px"><option value="">' + IC('mes') + 'Afegeix una llista…</option>' + noAssignades.map(function (l) { return '<option value="' + l.id + '">' + esc(l.name) + '</option>'; }).join('') + '</select></div>' : '') +
      '<a class="btn" href="#llistes" style="align-self:flex-start">' + IC('llistes') + 'Veure totes les llistes</a></div>';

    // Configuració
    html += '<div class="targeta pad pila" data-form><h3 style="margin:0">Configuració</h3>' +
      '<div class="fila"><label class="camp">Nom<input type="text" data-c="name" value="' + esc(p.name) + '" maxlength="80"></label>' +
      '<label class="camp">On és<input type="text" data-c="location" value="' + esc(p.location || '') + '" maxlength="120"></label></div>' +
      '<div class="fila"><label class="camp">Orientació<select data-c="orientation">' + opt(0, p.orientation, 'Horitzontal') + opt(90, p.orientation, 'Vertical (gira a la dreta)') + opt(270, p.orientation, 'Vertical (gira a l\'esquerra)') + opt(180, p.orientation, 'Cap per avall') + '</select></label>' +
      '<label class="camp">Fotos<select data-c="fit">' + opt('cover', p.fit, 'Omplir la pantalla (retalla)') + opt('contain', p.fit, 'Senceres (amb fons difuminat)') + '</select></label></div>' +
      '<div class="fila"><label class="camp">Transició<select data-c="transition">' + opt('', p.transition, 'La general (' + esc(nomTransicio(S.d.settings.defaultTransition)) + ')') + opt('fade', p.transition, 'Fos') + opt('slide', p.transition, 'Desplaçament') + opt('zoom', p.transition, 'Zoom suau') + opt('none', p.transition, 'Cap') + '</select></label>' +
      '<label class="camp">Segons per foto<input type="number" min="0" max="600" data-c="duration" value="' + (p.duration || '') + '" placeholder="General (' + S.d.settings.defaultDuration + ')"></label></div>' +
      '<div class="camp">Elements sobre el contingut<div class="pila" style="gap:10px;font-weight:500;margin-top:4px">' +
      '<label class="interruptor"><input type="checkbox" data-o="ticker"' + (o.ticker !== false ? ' checked' : '') + '> Cinta de missatges (a baix)</label>' +
      '<label class="interruptor"><input type="checkbox" data-o="clock"' + (o.clock ? ' checked' : '') + '> Rellotge i data (a dalt a la dreta)</label>' +
      '<label class="interruptor"><input type="checkbox" data-o="logo"' + (o.logo ? ' checked' : '') + '> Logotip de l\'escola (a dalt a l\'esquerra)</label>' +
      '<label class="interruptor"><input type="checkbox" data-o="progress"' + (o.progress ? ' checked' : '') + '> Barra de temps de cada diapositiva</label>' +
      '<label class="interruptor"><input type="checkbox" data-c="sound"' + (p.sound ? ' checked' : '') + '> So dels vídeos</label></div></div>' +
      '<div class="separador"></div>' +
      '<label class="interruptor"><input type="checkbox" data-hh="on"' + (h.on ? ' checked' : '') + '> <b>Horari de funcionament</b></label>' +
      '<p class="subtil" style="margin:0">Fora d\'aquest horari la pantalla es posa en negre (allarga la vida de la tele). No l\'apaga.</p>' +
      '<div class="pila" data-horari-pantalla' + (h.on ? '' : ' hidden') + '><div class="fila"><label class="camp">S\'encén a les<input type="time" data-hh="from" value="' + esc(h.from || '07:30') + '"></label>' +
      '<label class="camp">Es posa en negre a les<input type="time" data-hh="to" value="' + esc(h.to || '19:30') + '"></label></div>' +
      '<div class="dies">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<label><input type="checkbox" data-hd="' + d + '"' + ((h.days || [1, 2, 3, 4, 5]).indexOf(d) >= 0 ? ' checked' : '') + '><span>' + Pnt.NOMS_DIES[d] + '</span></label>'; }).join('') + '</div></div>' +
      '<p class="molt-subtil" style="margin:0">Els canvis es desen sols i arriben a la pantalla en menys d\'un minut.</p></div>';
    html += '</div>';

    // Estat tècnic
    html += '<div class="seccio"><h3>Informació tècnica</h3><div class="targeta pad detall-tecnic">' +
      (st.seen ? 'Última connexió: ' + dataHora(new Date(st.seen).toISOString()) + ' (' + fa(st.seen) + ')<br>' : 'Mai connectada<br>') +
      (st.item ? 'Mostrant: ' + esc(st.item) + '<br>' : '') +
      (st.res ? 'Resolució: ' + esc(st.res) + ' · Versió del reproductor: ' + esc(st.v || '') + '<br>' : '') +
      (st.cached !== undefined ? 'Fitxers guardats a l\'aparell: ' + st.cached + (st.missing ? ' · pendents de descarregar: ' + st.missing : '') + '<br>' : '') +
      (st.up ? 'Funcionant sense reiniciar: ' + duradaText(st.up) + '<br>' : '') +
      (st.err ? 'Últim avís de l\'aparell: ' + esc(st.err) + '<br>' : '') +
      (st.ua ? 'Navegador: ' + esc(st.ua) : '') + '</div></div>';
    $('#vista').innerHTML = html;

    // Accions
    $('[data-accio=previa]').onclick = function () { vistaPrevia(id); };
    $('[data-accio=identifica]').onclick = function () { crida('screenCommand', { id: id, type: 'identify' }, { desa: true }).then(function () { toast('La pantalla mostrarà el seu nom en uns segons.', 'ok'); }); };
    $('[data-accio=mes]').onclick = function (ev) {
      ev.stopPropagation();
      var ops = [
        { text: IC('recarrega') + 'Reinicia el reproductor', fes: function () { crida('screenCommand', { id: id, type: 'reload' }, { desa: true }).then(function () { toast('Es reiniciarà en menys d\'un minut.', 'ok'); }); } },
        { text: IC('neteja') + 'Esborra i torna a descarregar els fitxers', fes: function () { crida('screenCommand', { id: id, type: 'clearcache' }, { desa: true }).then(function () { toast('Ordre enviada.', 'ok'); }); } },
        { text: IC('enllac') + 'Enllaç i codi QR d\'aquesta pantalla', fes: function () { enllacPantalla(id); } },
        { text: IC('canvia') + 'Canviar l\'aparell (tele nova…)', fes: function () { afegirPantalla(id); } }
      ];
      if (esAdmin) {
        ops.push({ text: IC('recarrega') + 'Renova l\'enllaç (desvincula l\'aparell actual)', fes: function () {
          confirma('Renovar l\'enllaç', 'L\'aparell actual deixarà de funcionar fins que el tornis a vincular. Fes-ho si l\'enllaç ha arribat a qui no toca.', { ok: 'Renova', perill: true }).then(function (si) {
            if (si) crida('renewScreenLink', { id: id }, { desa: true }).then(function (r) { mostraEnllac(p, r.token); });
          });
        } });
        ops.push({ text: IC('esborra') + 'Esborra la pantalla', perill: true, fes: function () {
          confirma('Esborrar «' + p.name + '»', 'L\'aparell deixarà de mostrar contingut i tornarà a la pantalla de vinculació. Les llistes no s\'esborren.', { ok: 'Esborra', perill: true }).then(function (si) {
            if (si) crida('deleteScreen', { id: id }, { desa: true }).then(function () { return carrega(); }).then(function () { location.hash = '#pantalles'; toast('Pantalla esborrada', 'ok'); });
          });
        } });
      }
      obreDesplegable(ev.currentTarget, ops);
    };

    // Llistes assignades
    var desaLlistes = function (nova) { p.playlists = nova; desaPantalla(p, true); };
    $$('[data-amunt]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.amunt, a = p.playlists.slice(); a.splice(i - 1, 0, a.splice(i, 1)[0]); desaLlistes(a); }; });
    $$('[data-avall]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.avall, a = p.playlists.slice(); a.splice(i + 1, 0, a.splice(i, 1)[0]); desaLlistes(a); }; });
    $$('[data-treu]').forEach(function (b) { b.onclick = function () { desaLlistes(p.playlists.filter(function (x) { return x !== b.dataset.treu; })); }; });
    var sel = $('[data-afegeix-llista]');
    if (sel) sel.onchange = function () { if (sel.value) desaLlistes(p.playlists.concat([sel.value])); };

    // Formulari amb desament automàtic
    var form = $('[data-form]');
    var llegeix = function () {
      $$('[data-c]', form).forEach(function (i) {
        var k = i.dataset.c;
        p[k] = i.type === 'checkbox' ? i.checked : k === 'orientation' || k === 'duration' ? (parseInt(i.value, 10) || 0) : i.value;
      });
      p.overlays = p.overlays || {};
      $$('[data-o]', form).forEach(function (i) { p.overlays[i.dataset.o] = i.checked; });
      p.hours = { on: $('[data-hh=on]', form).checked, from: $('[data-hh=from]', form).value, to: $('[data-hh=to]', form).value, days: $$('[data-hd]:checked', form).map(function (c) { return +c.dataset.hd; }) };
      $('[data-horari-pantalla]', form).hidden = !p.hours.on;
    };
    var desaDiferit = debounce(function () { desaPantalla(p, false); }, 700);
    $$('input,select', form).forEach(function (i) {
      i.addEventListener(i.type === 'text' || i.type === 'number' ? 'input' : 'change', function () { llegeix(); desaDiferit(); });
    });
  };

  function nomTransicio(t) { return { fade: 'fos', slide: 'desplaçament', zoom: 'zoom', none: 'cap' }[t] || 'fos'; }

  function desaPantalla(p, rerender) {
    crida('saveScreen', { screen: p }, { desa: true }).then(function (r) {
      var i = S.d.screens.map(function (x) { return x.id; }).indexOf(p.id);
      if (i >= 0) S.d.screens[i] = r.screen;
      S.rev = null; // força refrescar a la propera consulta
      if (rerender) render(true);
      if (p.name !== r.screen.name || ruta().id === p.id) titol(r.screen.name, '#pantalles', 'Pantalles');
    });
  }

  /* ------------------------------------------------------------------
   *  LLISTES
   * ---------------------------------------------------------------- */
  VISTES.llistes = function () {
    titol('Llistes');
    var d = S.d;
    var html = '<div class="capcalera"><div><h2>Llistes de contingut</h2><p>Cada llista és un conjunt de fotos, vídeos, textos o webs que es van passant. Una llista es pot mostrar a una o més pantalles.</p></div>' +
      '<button class="btn primari" data-accio="nova">' + IC('mes') + 'Nova llista</button></div>';
    if (!d.playlists.length) {
      html += '<div class="targeta buit"><div class="gran-ic">' + IC('llistes') + '</div><h3>Encara no hi ha cap llista</h3><p>Crea una llista (per exemple «Activitats del trimestre») i afegeix-hi fotos i vídeos.</p><button class="btn primari" data-accio="nova">' + IC('mes') + 'Nova llista</button></div>';
    } else {
      html += '<div class="pila">' + d.playlists.map(function (l) {
        var pantalles = d.screens.filter(function (p) { return p.playlists.indexOf(l.id) >= 0; });
        var mosaic = l.items.slice(0, 4).map(function (it) {
          var th = it.kind === 'media' ? S.thumbs[it.mediaId] : null;
          var bg = th ? 'background-image:url(\'' + th + '\')' : it.text ? 'background:' + (it.text.bg || '#888') : '';
          return '<div style="' + bg + '"></div>';
        }).join('');
        var actius = l.items.filter(function (it) { return it.on !== false && Pnt.estatHorari(it.schedule, Pnt.horaLocal(araServidor())) === 'actiu'; }).length;
        return '<a class="targeta t-llista' + (l.on === false ? ' apagada' : '') + '" href="#llista/' + l.id + '"><div class="mosaic">' + mosaic + '</div><div class="info">' +
          '<h3><span class="color" style="background:' + esc(l.color) + '"></span>' + esc(l.name) + (l.on === false ? ' <span class="badge error">Aturada</span>' : '') + '</h3>' +
          '<div class="subtil">' + l.items.length + ' elements · ' + actius + ' actius ara' + (l.schedule ? ' · ' + IC('calendari') + esc(Pnt.resumHorari(l.schedule)) : '') + '</div>' +
          '<div class="chips">' + (pantalles.length ? pantalles.map(function (p) { return '<span class="chip">' + IC('pantalles') + esc(p.name) + '</span>'; }).join('') : '<span class="badge avis">No es mostra a cap pantalla</span>') + '</div>' +
          '</div><span style="font-size:22px;color:var(--text-3)">›</span></a>';
      }).join('') + '</div>';
    }
    $('#vista').innerHTML = html;
    $$('[data-accio=nova]').forEach(function (b) { b.onclick = novaLlista; });
  };

  var COLORS_LLISTA = ['#821E34', '#FF004E', '#6B625B', '#2D2926', '#A8505F', '#BFB8AF'];
  function novaLlista(cb) {
    obreModal({
      titol: 'Nova llista',
      cos: '<div class="pila"><label class="camp">Nom<input type="text" data-nom placeholder="Activitats del 1r trimestre" maxlength="80" autofocus></label>' +
        (S.d.screens.length ? '<div class="camp">Mostrar-la a<div class="pila" style="gap:8px;font-weight:500">' + S.d.screens.map(function (p) {
          return '<label class="interruptor"><input type="checkbox" data-p="' + p.id + '" checked> ' + esc(p.name) + '</label>';
        }).join('') + '</div><span class="ajuda">Ho pots canviar quan vulguis.</span></div>' : '') + '</div>',
      peu: '<button class="btn" data-tanca>Cancel·la</button><button class="btn primari" data-crea>Crea la llista</button>',
      enObrir: function (el) {
        var crea = function () {
          var nom = $('[data-nom]', el).value.trim();
          if (!nom) { toast('Posa-li un nom.', 'error'); return; }
          var color = COLORS_LLISTA[S.d.playlists.length % COLORS_LLISTA.length];
          crida('savePlaylist', { playlist: { name: nom, color: color, items: [], screens: $$('[data-p]:checked', el).map(function (c) { return c.dataset.p; }) } }, { desa: true })
            .then(function (r) { return carrega().then(function () { tancaModal(); if (typeof cb === 'function') cb(r.playlist); else location.hash = '#llista/' + r.playlist.id; }); });
        };
        $('[data-crea]', el).onclick = crea;
        $('[data-nom]', el).onkeydown = function (e) { if (e.key === 'Enter') crea(); };
      }
    });
  }

  /* ---------- Editor de llista ---------- */
  VISTES.llista = function (id) {
    var l = troba(S.d.playlists, id);
    if (!l) { location.hash = '#llistes'; return; }
    if (!S.edicio || S.edicio.id !== id || (!S.edicio.pendent && !S.edicio.desant)) S.edicio = { id: id, l: copia(l), pendent: false, desant: false };
    var E = S.edicio, L = E.l;
    titol(L.name, '#llistes', 'Llistes');
    var pantalles = S.d.screens;
    var local = Pnt.horaLocal(araServidor());
    var html = '<div class="capcalera"><div style="flex:1;min-width:240px"><h2 style="display:flex;align-items:center;gap:10px"><input type="color" data-l="color" value="' + esc(L.color) + '" title="Color de la llista" style="width:34px;height:34px">' +
      '<input type="text" data-l="name" value="' + esc(L.name) + '" maxlength="80" style="font-size:20px;font-weight:750;border-color:transparent;background:transparent;padding-left:4px" aria-label="Nom de la llista"></h2></div>' +
      '<div class="btns"><label class="interruptor" title="Si l\'atures, no es mostra enlloc"><input type="checkbox" data-l="on"' + (L.on !== false ? ' checked' : '') + '> Activa</label>' +
      '<button class="btn icona" data-accio="mes" aria-label="Més opcions">' + IC('puntets') + '</button></div></div>';

    html += '<div class="targeta pad pila" style="margin-bottom:16px"><div class="fila" style="align-items:start">' +
      '<div class="camp">Es mostra a<div class="chips" style="margin-top:4px">' + (pantalles.length ? pantalles.map(function (p) {
        var te = p.playlists.indexOf(L.id) >= 0;
        return '<label class="interruptor" style="margin-right:12px"><input type="checkbox" data-pant="' + p.id + '"' + (te ? ' checked' : '') + '> ' + esc(p.name) + '</label>';
      }).join('') : '<span class="subtil">Encara no hi ha pantalles.</span>') + '</div></div>' +
      '<div class="camp">Programació de tota la llista<div class="btns" style="margin-top:4px">' + (L.schedule ? badgeHorari(L.schedule) : '<span class="badge">Sempre</span>') +
      '<button class="btn petit" data-accio="horari-llista">Canvia</button></div></div></div></div>';

    html += '<div class="capcalera" style="margin-bottom:10px"><div><h2 style="font-size:17px">' + L.items.length + ' element' + (L.items.length === 1 ? '' : 's') + '</h2>' +
      '<p class="subtil">Arrossega ' + IC('agafa') + 'per canviar l\'ordre. Els apagats o fora de programació no es mostren.</p></div>' +
      (L.items.length > 1 ? '<button class="btn petit" data-accio="durada-tots">' + IC('temps') + 'Durada de totes les fotos</button>' : '') + '</div>';

    html += '<div class="items" data-items>' + L.items.map(function (it, i) {
      var estat = Pnt.estatHorari(it.schedule, local);
      var d = it.duration ? duradaText(it.duration) : (it.kind === 'media' && (troba(S.d.media, it.mediaId) || {}).kind === 'video' ? 'fins al final' : it.kind === 'youtube' ? '60 s' : it.kind === 'web' ? '30 s' : 'general');
      return '<div class="item' + (it.on === false ? ' apagat' : '') + (estat === 'caducat' ? ' caducat' : '') + '" data-id="' + it.id + '">' +
        '<span class="mans" aria-hidden="true">' + IC('agafa') + '</span><span class="num">' + (i + 1) + '</span>' + miniItem(it) +
        '<div class="text"><b>' + esc(nomItem(it)) + '</b><div class="meta"><span>' + esc(tipusItem(it)) + '</span><span>· ' + IC('temps') + d + '</span>' + (it.schedule ? badgeHorari(it.schedule) : '') + '</div></div>' +
        '<div class="accions"><label class="interruptor" title="' + (it.on === false ? 'Apagat' : 'Encès') + '"><input type="checkbox" data-on' + (it.on !== false ? ' checked' : '') + ' aria-label="Encès"></label>' +
        '<button class="btn fantasma icona" data-edita aria-label="Edita">' + IC('edita') + '</button><button class="btn fantasma icona" data-menu aria-label="Més">' + IC('puntets') + '</button></div></div>';
    }).join('') + '</div>';
    if (!L.items.length) html += '<div class="targeta buit" style="margin-bottom:10px"><div class="gran-ic">' + IC('mes') + '</div><h3>Llista buida</h3><p>Afegeix-hi fotos, vídeos, un PDF o una presentació exportada del Canva, textos o pàgines web.</p></div>';

    html += '<div class="afegir-barra" data-zona><button class="btn primari" data-afegeix="pujar">' + IC('pujar') + 'Pujar fitxers</button><button class="btn" data-afegeix="biblioteca">' + IC('biblioteca') + 'De la biblioteca</button>' +
      '<button class="btn" data-afegeix="text">' + IC('text') + 'Text</button><button class="btn" data-afegeix="web">' + IC('web') + 'Pàgina web</button><button class="btn" data-afegeix="youtube">' + IC('play') + 'YouTube</button>' +
      '<button class="btn" data-afegeix="clock">' + IC('rellotge') + 'Rellotge</button><button class="btn" data-afegeix="countdown">' + IC('compte') + 'Compte enrere</button>' +
      '<span class="molt-subtil" style="align-self:center">o arrossega fitxers aquí</span></div>';
    $('#vista').innerHTML = html;

    // Capçalera
    $('[data-l=name]').oninput = function () { L.name = this.value; titol(L.name || 'Llista', '#llistes', 'Llistes'); canviEdicio(true); };
    $('[data-l=color]').oninput = function () { L.color = this.value; canviEdicio(true); };
    $('[data-l=on]').onchange = function () { L.on = this.checked; canviEdicio(); };
    $$('[data-pant]').forEach(function (c) {
      c.onchange = function () { E.pantalles = $$('[data-pant]:checked').map(function (x) { return x.dataset.pant; }); canviEdicio(); };
    });
    $('[data-accio=horari-llista]').onclick = function () {
      obreModal({
        titol: 'Programació de la llista',
        cos: '<p class="subtil" style="margin-top:0">Per exemple: «Castanyada» del 27/10 al 31/10. Fora d\'aquestes dates, cap element de la llista es mostra.</p>' + htmlHorari(L.schedule),
        peu: '<button class="btn" data-tanca>Cancel·la</button><button class="btn primari" data-ok>Desa</button>',
        enObrir: function (el) {
          activaHorari(el);
          $('[data-ok]', el).onclick = function () { L.schedule = llegeixHorari(el); tancaModal(); canviEdicio(); render(true); };
        }
      });
    };
    $('[data-accio=mes]').onclick = function (ev) {
      ev.stopPropagation();
      obreDesplegable(ev.currentTarget, [
        { text: IC('duplica') + 'Duplica la llista', fes: function () {
          var c = copia(L); delete c.id; delete c.v; c.name = L.name + ' (còpia)';
          c.items.forEach(function (it) { delete it.id; });
          crida('savePlaylist', { playlist: c }, { desa: true }).then(function (r) { return carrega().then(function () { location.hash = '#llista/' + r.playlist.id; }); });
        } },
        { text: IC('esborra') + 'Esborra la llista', perill: true, fes: function () {
          confirma('Esborrar «' + L.name + '»', 'Es deixarà de mostrar a totes les pantalles. Les fotos i vídeos es queden a la biblioteca.', { ok: 'Esborra', perill: true }).then(function (si) {
            if (!si) return;
            S.edicio = null;
            crida('deletePlaylist', { id: L.id }, { desa: true }).then(function () { return carrega(); }).then(function () { location.hash = '#llistes'; toast('Llista esborrada', 'ok'); });
          });
        } }
      ]);
    };
    var bt = $('[data-accio=durada-tots]');
    if (bt) bt.onclick = function () {
      obreModal({
        titol: 'Durada de totes les fotos i textos',
        cos: '<label class="camp">Segons que es mostra cada element<input type="number" min="2" max="600" value="' + (S.d.settings.defaultDuration) + '" data-s></label><p class="subtil">No afecta els vídeos (es reprodueixen sencers).</p>',
        peu: '<button class="btn" data-tanca>Cancel·la</button><button class="btn primari" data-ok>Aplica a tots</button>',
        enObrir: function (el) {
          $('[data-ok]', el).onclick = function () {
            var s = parseInt($('[data-s]', el).value, 10);
            if (!(s >= 2)) return;
            L.items.forEach(function (it) { var m = it.kind === 'media' ? troba(S.d.media, it.mediaId) : null; if (!(m && m.kind === 'video') && it.kind !== 'youtube') it.duration = s; });
            tancaModal(); canviEdicio(); render(true);
          };
        }
      });
    };

    // Elements
    $$('[data-items] .item').forEach(function (row) {
      var it = troba(L.items, row.dataset.id);
      $('[data-on]', row).onchange = function () { it.on = this.checked; row.classList.toggle('apagat', !it.on); canviEdicio(); };
      $('[data-edita]', row).onclick = function () { editaItem(it, function (nou) { Object.assign(it, nou); canviEdicio(); render(true); }); };
      $('.miniatura', row).onclick = $('.text', row).onclick = function () { editaItem(it, function (nou) { Object.assign(it, nou); canviEdicio(); render(true); }); };
      $('[data-menu]', row).onclick = function (ev) {
        ev.stopPropagation();
        var i = L.items.indexOf(it);
        obreDesplegable(ev.currentTarget, [
          { text: IC('edita') + 'Edita', fes: function () { $('[data-edita]', row).click(); } },
          { text: IC('duplica') + 'Duplica', fes: function () { var c = copia(it); delete c.id; L.items.splice(i + 1, 0, c); canviEdicio(); render(true); } },
          { text: IC('amunt') + 'Mou amunt', fes: function () { if (i > 0) { L.items.splice(i - 1, 0, L.items.splice(i, 1)[0]); canviEdicio(); render(true); } } },
          { text: IC('avall') + 'Mou avall', fes: function () { if (i < L.items.length - 1) { L.items.splice(i + 1, 0, L.items.splice(i, 1)[0]); canviEdicio(); render(true); } } },
          { text: IC('principi') + 'Mou al principi', fes: function () { L.items.unshift(L.items.splice(i, 1)[0]); canviEdicio(); render(true); } },
          { text: IC('esborra') + 'Treu de la llista', perill: true, fes: function () { L.items.splice(i, 1); canviEdicio(); render(true); toast('Tret de la llista (el fitxer continua a la biblioteca)', 'ok'); } }
        ]);
      };
    });
    carregaScript(LIB.sortable, 'Sortable').then(function (Sortable) {
      var cont = $('[data-items]');
      if (!cont) return;
      Sortable.create(cont, {
        handle: '.mans', animation: 160, delay: 0,
        onEnd: function () {
          var ordre = $$('.item', cont).map(function (r) { return r.dataset.id; });
          L.items.sort(function (a, b) { return ordre.indexOf(a.id) - ordre.indexOf(b.id); });
          $$('.item .num', cont).forEach(function (n, i) { n.textContent = i + 1; });
          canviEdicio();
        }
      });
    }, function () { $$('.mans').forEach(function (m) { m.style.display = 'none'; }); });

    // Afegir
    $$('[data-afegeix]').forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.afegeix;
        if (t === 'pujar') return desaEdicioAra().then(function () { triaFitxersIPuja(L.id); });
        if (t === 'biblioteca') return triaMitjans({ multi: true }).then(function (ids) {
          if (!ids || !ids.length) return;
          ids.forEach(function (mid) { L.items.push({ id: nouIdLocal(), kind: 'media', mediaId: mid, on: true, duration: null, schedule: null }); });
          canviEdicio(); render(true); toast(ids.length + ' afegit' + (ids.length > 1 ? 's' : ''), 'ok');
        });
        var nou = itemNou(t);
        editaItem(nou, function (fet) { L.items.push(Object.assign(nou, fet)); canviEdicio(); render(true); }, true);
      };
    });
    zonaArrossegar($('[data-zona]'), function (files) { desaEdicioAra().then(function () { puja(files, L.id); }); });
  };

  function nouIdLocal() { return 'n' + Math.random().toString(36).substr(2, 10); }
  function itemNou(kind) {
    var it = { id: nouIdLocal(), kind: kind, on: true, duration: null, schedule: null, name: '' };
    if (kind === 'text') it.text = { template: 'granat', label: '', title: '', body: '', footer: '', align: 'left', size: 100 };
    if (kind === 'clock') it.text = { title: '', footer: '' };
    if (kind === 'countdown') it.text = { label: 'Compte enrere', title: '', date: '', time: '', footer: '' };
    if (kind === 'web') { it.url = ''; it.zoom = 100; it.reload = 0; }
    if (kind === 'youtube') { it.url = ''; it.duration = 60; }
    return it;
  }

  /** Marca canvis i desa automàticament (els textos esperen que acabis d'escriure). */
  var desaDiferitLlista = debounce(function () { desaEdicio(); }, 900);
  function canviEdicio(escrivint) {
    if (!S.edicio) return;
    S.edicio.pendent = true;
    indicador('desant', 'Canvis pendents…');
    if (escrivint) desaDiferitLlista(); else desaEdicio();
  }
  function desaEdicioAra() { return S.edicio && S.edicio.pendent ? desaEdicio() : Promise.resolve(); }
  function desaEdicio() {
    var E = S.edicio;
    if (!E) return Promise.resolve();
    if (E.desant) { E.tornaDesar = true; return E.desant; }
    E.pendent = false;
    var enviat = copia(E.l);
    var dades = { playlist: enviat };
    if (E.pantalles) dades.playlist.screens = E.pantalles;
    E.desant = crida('savePlaylist', dades, { desa: true }).then(function (r) {
      E.l.v = r.playlist.v;
      // Els elements nous reben un identificador del servidor
      r.playlist.items.forEach(function (it, i) { if (E.l.items[i] && E.l.items[i].id !== it.id && /^n/.test(E.l.items[i].id)) E.l.items[i].id = it.id; });
      var i = S.d.playlists.map(function (x) { return x.id; }).indexOf(r.playlist.id);
      if (i >= 0) S.d.playlists[i] = copia(r.playlist);
      if (E.pantalles) {
        S.d.screens.forEach(function (p) {
          var vol = E.pantalles.indexOf(p.id) >= 0, te = p.playlists.indexOf(r.playlist.id) >= 0;
          if (vol && !te) p.playlists.push(r.playlist.id);
          if (!vol && te) p.playlists = p.playlists.filter(function (x) { return x !== r.playlist.id; });
        });
        E.pantalles = null;
      }
      S.rev = null;
      E.desant = false;
      if (E.tornaDesar || E.pendent) { E.tornaDesar = false; E.pendent = true; return desaEdicio(); }
    }, function (err) {
      E.desant = false;
      if (err.code === 'CONFLICTE' || err.code === 'NO_EXISTEIX') {
        S.edicio = null;
        return carrega().then(function () { render(); });
      }
      E.pendent = true;
    });
    return E.desant;
  }
  window.addEventListener('beforeunload', function (e) {
    if ((S.edicio && (S.edicio.pendent || S.edicio.desant)) || pujadesActives > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Editor d'un element ---------- */
  function htmlPlantilles(actual) {
    return '<div class="plantilles">' + Pnt.diapo.PLANTILLES.map(function (p) {
      return '<button type="button" class="plantilla' + (p.id === actual ? ' triada' : '') + '" data-plantilla="' + p.id + '">' +
        '<div class="mostra" data-mostra="' + p.id + '"></div><div class="peu-pl"><b>' + esc(p.nom) + '</b><span>' + esc(p.desc) + '</span></div></button>';
    }).join('') + '</div>';
  }

  function editaItem(it, enDesar, esNou) {
    var c = copia(it);
    var m = c.kind === 'media' ? troba(S.d.media, c.mediaId) : null;
    var esVideo = m && m.kind === 'video';
    var titols = { media: esVideo ? 'Vídeo' : 'Foto', text: 'Diapositiva', web: 'Pàgina web', youtube: 'Vídeo de YouTube', clock: 'Rellotge i data', countdown: 'Compte enrere' };
    if (c.text && c.kind === 'text' && !c.text.template) c.text.template = 'granat';
    var t = c.text || {};
    var cos = '<div class="editor-graella"><div class="pila">';
    if (c.kind === 'text') {
      cos += '<div class="camp">Disseny' + htmlPlantilles(t.template) + '</div>' +
        '<label class="camp">Etiqueta (opcional) <span class="ajuda">Paraula curta a sobre del títol: «Avís», «Avui», «Recordatori»…</span><input type="text" data-t="label" value="' + esc(t.label) + '" maxlength="40"></label>' +
        '<label class="camp">Títol<input type="text" data-t="title" value="' + esc(t.title) + '" maxlength="200" placeholder="Benvinguts!"></label>' +
        '<div class="fila" data-nomes="esdeveniment"><label class="camp">Data<input type="date" data-t="date" value="' + esc(t.date || '') + '"></label>' +
        '<label class="camp">Hora (opcional)<input type="time" data-t="time" value="' + esc(t.time || '') + '"></label></div>' +
        '<label class="camp" data-nomes="esdeveniment">Lloc (opcional)<input type="text" data-t="place" value="' + esc(t.place || '') + '" maxlength="120" placeholder="Pati de primària"></label>' +
        '<label class="camp">Text <span class="ajuda">**negreta** · comença la línia amb «- » per fer una llista</span><textarea data-t="body" maxlength="1500" rows="4">' + esc(t.body) + '</textarea></label>' +
        '<label class="camp">Peu (opcional)<input type="text" data-t="footer" value="' + esc(t.footer) + '" maxlength="200"></label>' +
        '<div class="camp" data-nomes="foto">Foto de fons<div class="btns"><span data-fons-nom class="subtil">' + (t.bgMediaId ? esc((troba(S.d.media, t.bgMediaId) || {}).name || '') : 'Cap (cal triar-ne una)') + '</span>' +
        '<button type="button" class="btn petit" data-tria-fons>Tria…</button></div></div>' +
        '<div class="fila"><label class="camp" data-nomes="granat paper">Alineació<select data-t="align"><option value="left"' + (t.align !== 'center' ? ' selected' : '') + '>A l\'esquerra</option><option value="center"' + (t.align === 'center' ? ' selected' : '') + '>Centrat</option></select></label>' +
        '<label class="camp">Mida de la lletra<input type="range" min="60" max="160" step="10" data-t="size" value="' + (t.size || 100) + '"></label></div>';
    }
    if (c.kind === 'countdown') {
      cos += '<label class="camp">Etiqueta (opcional)<input type="text" data-t="label" value="' + esc(t.label) + '" maxlength="40" placeholder="Compte enrere"></label>' +
        '<label class="camp">Títol<input type="text" data-t="title" value="' + esc(t.title) + '" maxlength="200" placeholder="Festival de Nadal"></label>' +
        '<div class="fila"><label class="camp">Data de l\'esdeveniment<input type="date" data-t="date" value="' + esc(t.date) + '"></label>' +
        '<label class="camp">Hora (opcional)<input type="time" data-t="time" value="' + esc(t.time || '') + '"></label></div>' +
        '<label class="camp">Peu (opcional)<input type="text" data-t="footer" value="' + esc(t.footer) + '" maxlength="200"></label>';
    }
    if (c.kind === 'clock') {
      cos += '<label class="camp">Etiqueta (opcional)<input type="text" data-t="title" value="' + esc(t.title) + '" maxlength="40" placeholder="Bon dia"></label>' +
        '<label class="camp">Peu (opcional)<input type="text" data-t="footer" value="' + esc(t.footer) + '" maxlength="200"></label>';
    }
    if (c.kind === 'web') {
      cos += '<label class="camp">Adreça de la pàgina<input type="url" data-u="url" value="' + esc(c.url) + '" placeholder="https://…" autofocus></label>' +
        '<div class="avis-caixa info" style="font-size:13px">Funciona amb presentacions de Google publicades, fulls de càlcul publicats, el Canva (enllaç «Incrusta» o de visualització pública) i webs pròpies. Algunes webs (Google, Instagram, diaris…) no deixen que les mostrin dins d\'una altra pàgina: comprova-ho amb la vista prèvia. <b>Les webs necessiten internet</b>; sense xarxa, la pantalla se les salta.</div>' +
        '<div class="fila"><label class="camp">Zoom (%)<input type="number" min="25" max="300" step="5" data-u="zoom" value="' + (c.zoom || 100) + '"></label>' +
        '<label class="camp">Recarregar cada (minuts)<input type="number" min="0" max="1440" data-u="reload" value="' + (c.reload || '') + '" placeholder="Mai"><span class="ajuda">Per a webs amb dades que canvien. Només si és l\'únic element.</span></label></div>';
    }
    if (c.kind === 'youtube') {
      cos += '<label class="camp">Enllaç de YouTube (vídeo o llista)<input type="url" data-u="url" value="' + esc(c.url) + '" placeholder="https://www.youtube.com/watch?v=…" autofocus></label>' +
        '<div class="avis-caixa info" style="font-size:13px">Necessita internet. Si el vídeo és de l\'escola, és millor pujar-lo com a fitxer: així funciona sempre, fins i tot sense xarxa.</div>';
    }
    if (c.kind === 'media' && m) {
      cos += '<div class="subtil">' + esc(m.name) + ' · ' + mida(m.size) + (m.w ? ' · ' + m.w + '×' + m.h : '') + (m.duration ? ' · ' + duradaText(m.duration) : '') + '</div>' +
        '<label class="camp">Peu de foto (opcional) <span class="ajuda">Surt en un bloc granat a baix. La segona línia, més petita.</span><textarea data-caption rows="2" maxlength="200" placeholder="Sortida al Montseny&#10;3r de primària · dijous 5 de novembre">' + esc(c.caption || '') + '</textarea></label>';
      if (!esVideo) cos += '<label class="interruptor"><input type="checkbox" data-kenburns' + (c.kenburns ? ' checked' : '') + '> Moviment lent sobre la foto</label>';
      cos += '<label class="camp">Com s\'ajusta a la pantalla<select data-fit><option value="">Com digui la pantalla</option><option value="cover"' + (c.fit === 'cover' ? ' selected' : '') + '>Omplir (retalla les vores)</option><option value="contain"' + (c.fit === 'contain' ? ' selected' : '') + '>Sencera (amb fons difuminat)</option></select></label>';
    }
    // Comú
    cos += '<div class="fila"><label class="camp">Durada (segons)<input type="number" min="2" max="7200" data-durada value="' + (c.duration || '') + '" placeholder="' +
      (esVideo ? 'Fins al final' : c.kind === 'web' ? '30' : 'General (' + S.d.settings.defaultDuration + ')') + '"></label>' +
      '<label class="camp">Transició<select data-transicio><option value="">La de la pantalla</option>' +
      ['fade', 'slide', 'zoom', 'none'].map(function (x) { return '<option value="' + x + '"' + (c.transition === x ? ' selected' : '') + '>' + nomTransicio(x).replace(/^./, function (a) { return a.toUpperCase(); }) + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="camp">Nom intern (opcional)<input type="text" data-nomitem value="' + esc(c.name || '') + '" maxlength="120" placeholder="' + esc(c.kind === 'media' ? (m ? m.name : '') : 'Per reconèixer-lo a la llista') + '"></label>';
    cos += '</div><div class="pila"><div class="camp">Vista prèvia<div class="previa-caixa" data-previa-item></div></div>' +
      '<div class="camp">Quan es mostra' + htmlHorari(c.schedule) + '</div></div></div>';

    obreModal({
      titol: (esNou ? 'Nou: ' : '') + titols[c.kind],
      classe: 'molt-ample',
      cos: cos,
      peu: '<button class="btn" data-tanca>Cancel·la</button><button class="btn primari" data-ok>' + (esNou ? 'Afegeix a la llista' : 'Desa') + '</button>',
      noTancarFora: true,
      enObrir: function (el) {
        var caixa = $('[data-previa-item]', el);
        var pinta = debounce(function () { pintaPreviaItem(caixa, c); }, 120);
        var visibles = function () {
          var tpl = c.text && c.text.template;
          $$('[data-nomes]', el).forEach(function (n) { n.hidden = n.dataset.nomes.split(' ').indexOf(tpl) < 0; });
        };
        var pintaMostres = function () {
          $$('[data-mostra]', el).forEach(function (box) {
            var prova = copia(c);
            prova.text.template = box.dataset.mostra;
            if (!prova.text.title) prova.text.title = 'Títol de la diapositiva';
            if (box.dataset.mostra === 'esdeveniment' && !prova.text.date) prova.text.date = Pnt.horaLocal(araServidor()).date;
            if (box.dataset.mostra === 'foto' && !prova.text.bgMediaId) { var f = S.d.media.filter(function (x) { return x.kind === 'image'; })[0]; if (f) prova.text.bgMediaId = f.id; }
            pintaDiapoA(box, prova);
          });
        };
        var llegeix = function () {
          if (c.text) {
            $$('[data-t]', el).forEach(function (i) { c.text[i.dataset.t] = i.type === 'range' ? +i.value : i.value; });
          }
          $$('[data-u]', el).forEach(function (i) { c[i.dataset.u] = i.type === 'number' ? (parseInt(i.value, 10) || 0) : i.value.trim(); });
          var kb = $('[data-kenburns]', el); if (kb) c.kenburns = kb.checked;
          var fit = $('[data-fit]', el); if (fit) c.fit = fit.value;
          var cap = $('[data-caption]', el); if (cap) c.caption = cap.value.trim();
          var du = parseInt($('[data-durada]', el).value, 10);
          c.duration = du >= 2 ? du : null;
          c.transition = $('[data-transicio]', el).value;
          c.name = $('[data-nomitem]', el).value.trim();
          c.schedule = llegeixHorari(el);
          pinta();
        };
        $$('input,select,textarea', el).forEach(function (i) { i.addEventListener('input', llegeix); i.addEventListener('change', llegeix); });
        $$('[data-plantilla]', el).forEach(function (b) {
          b.onclick = function () {
            c.text.template = b.dataset.plantilla;
            $$('[data-plantilla]', el).forEach(function (x) { x.classList.toggle('triada', x === b); });
            visibles(); pinta();
            if (c.text.template === 'foto' && !c.text.bgMediaId) $('[data-tria-fons]', el).click();
          };
        });
        activaHorari(el);
        var tf = $('[data-tria-fons]', el);
        if (tf) {
          tf.onclick = function () {
            llegeix();
            triaMitjans({ multi: false, kind: 'image' }).then(function (ids) {
              if (ids && ids[0]) c.text.bgMediaId = ids[0];
              editaItem(c, enDesar, esNou);
            });
          };
        }
        $('[data-ok]', el).onclick = function () {
          llegeix();
          if ((c.kind === 'web' || c.kind === 'youtube') && !/^https?:\/\/\S+$/i.test(c.url || '')) { toast('Escriu una adreça vàlida (ha de començar per https://).', 'error'); return; }
          if (c.kind === 'youtube' && !Pnt.youtubeEmbed(c.url)) { toast('No sembla un enllaç de YouTube.', 'error'); return; }
          if (c.kind === 'countdown' && !(c.text && c.text.date)) { toast('Posa la data de l\'esdeveniment.', 'error'); return; }
          if (c.kind === 'text' && !(c.text.title || c.text.body)) { toast('Escriu almenys un títol o un text.', 'error'); return; }
          if (c.kind === 'text' && c.text.template === 'esdeveniment' && !c.text.date) { toast('Posa la data de l\'esdeveniment.', 'error'); return; }
          if (c.kind === 'text' && c.text.template === 'foto' && !c.text.bgMediaId) { toast('Tria la foto de fons.', 'error'); return; }
          tancaModal();
          enDesar(c);
        };
        if (c.kind === 'text') { visibles(); pintaMostres(); }
        pintaPreviaItem(caixa, c);
      }
    });
  }

  /** Context per dibuixar diapositives al panell (miniatures en lloc dels fitxers). */
  function ctxPanell() {
    return {
      ara: araServidor,
      urlMitja: function (id) { return S.thumbs[id] || null; },
      logo: { color: S.logos.color || null, neg: S.logos.neg || null },
      escola: (S.d && S.d.settings.schoolName) || 'Vedruna Escorial Vic'
    };
  }
  /** Dibuixa una diapositiva dins una capsa, a escala. */
  function pintaDiapoA(caixa, it) {
    $$('.dp', caixa).forEach(function (n) { if (n.atura) n.atura(); });
    caixa.innerHTML = '';
    var n = Pnt.diapo.crea(it, ctxPanell());
    if (!n) return null;
    caixa.appendChild(n);
    Pnt.diapo.escala(caixa);
    Pnt.diapo.ajusta(n);
    setTimeout(function () { Pnt.diapo.escala(caixa); Pnt.diapo.ajusta(n); }, 60);
    return n;
  }
  /** Omple les miniatures de diapositives d'una vista (llistes, inici). */
  var registreDiapos = {};
  function omplirDiapos(cont) {
    $$('[data-diapo]', cont || document).forEach(function (box) {
      var it = registreDiapos[box.dataset.diapo];
      if (!it) return;
      var n = pintaDiapoA(box, it);
      if (n && n.atura) n.atura();
    });
  }

  function pintaPreviaItem(caixa, it) {
    $$('.dp', caixa).forEach(function (n) { if (n.atura) n.atura(); });
    caixa.innerHTML = '';
    if (it.kind === 'media') {
      var m = troba(S.d.media, it.mediaId);
      var th = S.thumbs[it.mediaId];
      caixa.innerHTML = th ? '<img src="' + th + '" alt="" style="object-fit:' + (it.fit === 'contain' ? 'contain' : 'cover') + '">' : '<div class="buit">' + esc(m ? m.name : '') + '</div>';
      if (it.caption) { Pnt.diapo.escala(caixa); caixa.appendChild(Pnt.diapo.peuFoto(it.caption)); }
      return;
    }
    if (it.kind === 'web') {
      if (!/^https?:\/\//.test(it.url || '')) { caixa.innerHTML = '<div class="buit" style="color:#aaa">Escriu l\'adreça</div>'; return; }
      var z = (it.zoom || 100) / 100;
      caixa.innerHTML = '<iframe src="' + esc(it.url) + '" style="width:' + (1920 / z) + 'px;height:' + (1080 / z) + 'px;transform-origin:0 0;background:#fff;border:0;position:absolute;top:0;left:0"></iframe>';
      var f = $('iframe', caixa);
      f.style.transform = 'scale(' + (caixa.clientWidth / 1920 * z) + ')';
      return;
    }
    if (it.kind === 'youtube') {
      var src = it.url ? Pnt.youtubeEmbed(it.url) : null;
      caixa.innerHTML = src ? '<iframe src="' + esc(src) + '" allow="autoplay; encrypted-media"></iframe>' : '<div class="buit" style="color:#aaa">Enganxa l\'enllaç del vídeo</div>';
      return;
    }
    pintaDiapoA(caixa, it);
  }

  /* ------------------------------------------------------------------
   *  BIBLIOTECA
   * ---------------------------------------------------------------- */
  var filtreBib = { tipus: '', cerca: '' };
  VISTES.biblioteca = function () {
    titol('Biblioteca');
    var d = S.d;
    var usos = usosMitjans();
    var html = '<div class="capcalera"><div><h2>Biblioteca</h2><p>Totes les fotos i vídeos. Es guarden de manera privada al Drive de l\'escola.</p></div>' +
      '<button class="btn" data-accio="bustia">' + IC('bustia') + 'Bústia del Drive</button></div>' +
      '<div class="zona-pujada" data-zona tabindex="0" role="button"><div class="gran-ic">' + IC('pujar') + '</div><b>Arrossega aquí fotos, vídeos o PDF</b><span class="subtil">o fes clic per triar-los (des del mòbil també pots fer fotos)</span>' +
      '<div class="molt-subtil" style="margin-top:6px">Del Canva: Comparteix → Baixa → <b>PDF</b> (cada pàgina serà una diapositiva), <b>PNG</b> o <b>MP4</b> (amb animacions).</div></div>';
    html += '<div class="filtres"><div class="segment">' + [['', 'Tot (' + d.media.length + ')'], ['image', 'Fotos'], ['video', 'Vídeos'], ['nous', 'Sense fer servir']].map(function (f) {
      return '<label><input type="radio" name="fb" value="' + f[0] + '"' + (filtreBib.tipus === f[0] ? ' checked' : '') + '><span>' + f[1] + '</span></label>';
    }).join('') + '</div><input type="search" placeholder="Cerca pel nom…" data-cerca value="' + esc(filtreBib.cerca) + '"></div>';
    html += '<div class="mitjans" data-graella></div>';
    $('#vista').innerHTML = html;
    var pintaGraella = function () {
      var llista = d.media.slice().reverse().filter(function (m) {
        if (filtreBib.tipus === 'nous') { if (usos[m.id] && usos[m.id].length) return false; }
        else if (filtreBib.tipus && m.kind !== filtreBib.tipus) return false;
        return !filtreBib.cerca || m.name.toLowerCase().indexOf(filtreBib.cerca.toLowerCase()) >= 0;
      });
      $('[data-graella]').innerHTML = llista.length ? llista.map(function (m) { return htmlMitja(m, usos[m.id]); }).join('') :
        '<div class="buit" style="grid-column:1/-1">' + (d.media.length ? 'Cap fitxer coincideix amb el filtre.' : 'La biblioteca és buida. Puja-hi les primeres fotos!') + '</div>';
      $$('[data-graella] .mitja').forEach(function (b) { b.onclick = function () { detallMitja(b.dataset.id); }; });
    };
    pintaGraella();
    $$('input[name=fb]').forEach(function (r) { r.onchange = function () { filtreBib.tipus = r.value; pintaGraella(); }; });
    $('[data-cerca]').oninput = function () { filtreBib.cerca = this.value; pintaGraella(); };
    var zona = $('[data-zona]');
    zona.onclick = function () { triaFitxersIPuja(null); };
    zona.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triaFitxersIPuja(null); } };
    zonaArrossegar(zona, function (f) { puja(f, null); });
    $('[data-accio=bustia]').onclick = obreBustia;
  };

  function usosMitjans() {
    var u = {};
    S.d.playlists.forEach(function (l) {
      l.items.forEach(function (it) {
        var ids = [it.mediaId, it.text && it.text.bgMediaId].filter(Boolean);
        ids.forEach(function (id) { (u[id] = u[id] || []); if (u[id].indexOf(l) < 0) u[id].push(l); });
      });
    });
    if (S.d.settings.logoMediaId) (u[S.d.settings.logoMediaId] = u[S.d.settings.logoMediaId] || []).push({ name: 'Logotip', color: '#888' });
    return u;
  }

  function htmlMitja(m, usos, triat) {
    var th = S.thumbs[m.id];
    return '<button type="button" class="mitja' + (triat ? ' triat' : '') + '" data-id="' + m.id + '"><div class="img" style="' + (th ? 'background-image:url(\'' + th + '\')' : '') + '">' + (th ? '' : m.kind === 'video' ? IC('play') : IC('biblioteca')) + '</div>' +
      (m.kind === 'video' ? '<span class="tipus badge" style="background:rgba(0,0,0,.65);color:#fff">' + IC('play') + (m.duration ? duradaText(m.duration) : 'vídeo') + '</span>' : '') +
      (triat !== undefined ? '<span class="marca">' + (triat ? IC('fet', 16) : '') + '</span>' : '') +
      '<div class="peu"><b title="' + esc(m.name) + '">' + esc(m.name) + '</b><span class="molt-subtil">' + mida(m.size) +
      (usos ? (usos.length ? ' · a ' + usos.length + ' llist' + (usos.length > 1 ? 'es' : 'a') : ' · sense fer servir') : '') + '</span></div></button>';
  }

  function detallMitja(id) {
    var m = troba(S.d.media, id);
    if (!m) return;
    var usos = usosMitjans()[id] || [];
    var th = S.thumbs[id];
    obreModal({
      titol: m.kind === 'video' ? 'Vídeo' : 'Foto',
      classe: 'ample',
      cos: '<div class="editor-graella"><div class="pila"><div class="previa-caixa" data-gran>' + (th ? '<img src="' + th + '" alt="">' : '') + '</div>' +
        '<button class="btn petit" data-original style="align-self:flex-start">Veure l\'original</button></div>' +
        '<div class="pila"><label class="camp">Nom<input type="text" data-nom value="' + esc(m.name) + '" maxlength="200"></label>' +
        '<div class="subtil">' + mida(m.size) + (m.w ? ' · ' + m.w + '×' + m.h + ' px' : '') + (m.duration ? ' · ' + duradaText(m.duration) : '') + '<br>Pujat ' + dataHora(m.at) + ' per ' + esc((m.by || '').split('@')[0]) + '</div>' +
        '<div class="camp">Es fa servir a<div class="chips">' + (usos.length ? usos.map(function (l) { return l.id ? '<a href="#llista/' + l.id + '" class="chip" style="text-decoration:none;color:inherit"><span class="color" style="background:' + esc(l.color) + '"></span>' + esc(l.name) + '</a>' : chipLlista(l); }).join('') : '<span class="subtil">Cap llista</span>') + '</div></div>' +
        '<label class="camp">Afegeix a una llista<select data-afegeix><option value="">Tria una llista…</option>' + S.d.playlists.map(function (l) { return '<option value="' + l.id + '">' + esc(l.name) + '</option>'; }).join('') + '<option value="__nova">' + IC('mes') + 'Llista nova…</option></select></label></div></div>',
      peu: '<button class="btn perill esq" data-esborra>' + IC('esborra') + 'Esborra</button><button class="btn primari" data-tanca>Fet</button>',
      enObrir: function (el) {
        var inp = $('[data-nom]', el);
        inp.onchange = function () {
          var nom = inp.value.trim(); if (!nom || nom === m.name) return;
          crida('saveMedia', { id: id, name: nom }, { desa: true }).then(function () { m.name = nom; S.rev = null; });
        };
        $('[data-original]', el).onclick = function () {
          var b = this; b.disabled = true; b.innerHTML = '<span class="roda petita"></span> Descarregant…';
          Pnt.descarregaMitja(id, m, { session: S.session }, function (f, t) { b.innerHTML = '<span class="roda petita"></span> ' + Math.round(f / t * 100) + '%'; }).then(function (blob) {
            var u = URL.createObjectURL(blob);
            $('[data-gran]', el).innerHTML = m.kind === 'video' ? '<video src="' + u + '" controls autoplay muted playsinline></video>' : '<img src="' + u + '" alt="">';
            b.remove();
          }, function (e) { toast(e.message, 'error'); b.disabled = false; b.textContent = 'Veure l\'original'; });
        };
        $('[data-afegeix]', el).onchange = function () {
          var v = this.value; if (!v) return;
          var afegeix = function (lid) {
            var l = troba(S.d.playlists, lid);
            var c = copia(l);
            c.items.push({ kind: 'media', mediaId: id, on: true, duration: null, schedule: null });
            crida('savePlaylist', { playlist: c }, { desa: true }).then(function () { return carrega(); }).then(function () { toast('Afegit a «' + l.name + '»', 'ok'); tancaModal(); render(true); });
          };
          if (v === '__nova') { tancaModal(); novaLlista(function (l) { afegeix(l.id); }); } else afegeix(v);
        };
        $('[data-esborra]', el).onclick = function () {
          confirma('Esborrar «' + m.name + '»', usos.length ? 'Es farà servir a ' + usos.length + ' llista/es i en desapareixerà. Les pantalles el deixaran de mostrar.' : 'S\'esborrarà definitivament (anirà a la paperera del Drive).', { ok: 'Esborra', perill: true }).then(function (si) {
            if (si) crida('deleteMedia', { id: id }, { desa: true }).then(function () { return carrega(); }).then(function () { toast('Esborrat', 'ok'); render(true); });
          });
        };
      }
    });
  }

  /** Finestra per triar fitxers de la biblioteca. */
  function triaMitjans(opc) {
    opc = opc || {};
    return new Promise(function (ok) {
      var triats = [];
      var resolt = false;
      var llista = S.d.media.slice().reverse().filter(function (m) { return !opc.kind || m.kind === opc.kind; });
      obreModal({
        titol: opc.multi ? 'Tria fotos i vídeos' : 'Tria una imatge',
        classe: 'molt-ample',
        cos: llista.length ? '<div class="filtres" style="margin-top:0"><input type="search" placeholder="Cerca…" data-cerca></div><div class="mitjans" data-g></div>' :
          '<div class="buit">La biblioteca és buida. Tanca aquesta finestra i puja fitxers.</div>',
        peu: '<span class="subtil esq" data-n></span><button class="btn" data-tanca>Cancel·la</button><button class="btn primari" data-ok disabled>Afegeix</button>',
        enObrir: function (el) {
          var g = $('[data-g]', el);
          var pinta = function (cerca) {
            if (!g) return;
            g.innerHTML = llista.filter(function (m) { return !cerca || m.name.toLowerCase().indexOf(cerca) >= 0; }).map(function (m) { return htmlMitja(m, null, triats.indexOf(m.id) >= 0); }).join('');
            $$('.mitja', g).forEach(function (b) {
              b.onclick = function () {
                var id = b.dataset.id, i = triats.indexOf(id);
                if (!opc.multi) { triats = [id]; resolt = true; tancaModal(); ok(triats); return; }
                if (i >= 0) triats.splice(i, 1); else triats.push(id);
                b.classList.toggle('triat', i < 0);
                $('.marca', b).innerHTML = i < 0 ? IC('fet', 16) : '';
                $('[data-n]', el).textContent = triats.length ? triats.length + ' triat' + (triats.length > 1 ? 's' : '') : '';
                $('[data-ok]', el).disabled = !triats.length;
              };
            });
          };
          pinta('');
          var c = $('[data-cerca]', el); if (c) c.oninput = function () { pinta(c.value.toLowerCase()); };
          $('[data-ok]', el).onclick = function () { resolt = true; tancaModal(); ok(triats); };
          if (!opc.multi) $('[data-ok]', el).hidden = true;
        },
        enTancar: function () { if (!resolt) ok(null); }
      });
    });
  }

  function obreBustia() {
    obreModal({ titol: 'Bústia del Drive', cos: '<div style="text-align:center;padding:20px"><span class="roda"></span></div>' });
    crida('bustiaList').then(function (r) {
      var fitxers = r.files;
      var valids = fitxers.filter(function (f) { return f.kind; });
      var llistaAuto = troba(S.d.playlists, S.d.settings.bustiaPlaylistId);
      obreModal({
        titol: 'Bústia del Drive',
        cos: '<div class="pila"><p style="margin:0">És una carpeta del Drive on qualsevol persona amb accés pot deixar fotos i vídeos (per exemple des de l\'app del Drive del mòbil) i aquí els importes a la biblioteca.</p>' +
          '<a class="btn" href="' + esc(r.folderUrl) + '" target="_blank" rel="noopener" style="align-self:flex-start">' + IC('carpeta') + 'Obre la carpeta al Drive</a>' +
          (llistaAuto ? '<div class="avis-caixa info">Importació automàtica activada: cada 10 minuts els fitxers nous s\'afegeixen a la llista <b>' + esc(llistaAuto.name) + '</b>.</div>' : '<div class="molt-subtil">Un administrador pot activar la importació automàtica a Ajustos.</div>') +
          (fitxers.length ? '<div class="pila" style="gap:6px">' + fitxers.map(function (f) {
            return '<div class="pujada"><span class="nom">' + esc(f.name) + '</span><span class="molt-subtil">' + mida(f.size) + '</span>' + (f.kind ? '' : '<span class="badge avis">No compatible</span>') + '</div>';
          }).join('') + '</div>' : '<div class="buit">La bústia és buida.</div>') +
          (valids.length ? '<label class="camp">Afegeix-los també a<select data-ll><option value="">Només a la biblioteca</option>' + S.d.playlists.map(function (l) { return '<option value="' + l.id + '">' + esc(l.name) + '</option>'; }).join('') + '</select></label>' : '') +
          '<p class="molt-subtil" style="margin:0">Els PDF no es poden importar des de la bústia: puja\'ls des del panell i es convertiran en imatges.</p></div>',
        peu: '<button class="btn" data-tanca>Tanca</button>' + (valids.length ? '<button class="btn primari" data-importa>Importa ' + valids.length + ' fitxer' + (valids.length > 1 ? 's' : '') + '</button>' : ''),
        enObrir: function (el) {
          var b = $('[data-importa]', el);
          if (b) b.onclick = function () {
            b.disabled = true; b.innerHTML = '<span class="roda petita"></span> Important…';
            var llista = $('[data-ll]', el).value;
            // Per trossos de 5 per no superar el temps màxim d'Apps Script
            var ids = valids.map(function (f) { return f.id; });
            var cadena = Promise.resolve(), fets = 0;
            for (var i = 0; i < ids.length; i += 5) (function (tros) {
              cadena = cadena.then(function () { return crida('bustiaImport', { fileIds: tros, playlistId: llista }, { desa: true, timeout: 300000 }).then(function (r) { fets += r.media.length; b.innerHTML = '<span class="roda petita"></span> ' + fets + '/' + ids.length; }); });
            })(ids.slice(i, i + 5));
            cadena.then(function () { return carrega(); }).then(function () { tancaModal(); toast(fets + ' fitxers importats', 'ok'); render(true); }, function () { b.disabled = false; b.textContent = 'Torna-ho a provar'; });
          };
        }
      });
    }, function () { tancaModal(); });
  }

  /* ---------- Pujada de fitxers ---------- */
  function zonaArrossegar(zona, enDeixar) {
    if (!zona) return;
    ['dragenter', 'dragover'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('arrossega'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('arrossega'); }); });
    zona.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) enDeixar(Array.prototype.slice.call(e.dataTransfer.files)); });
  }

  function triaFitxersIPuja(idLlista) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.accept = 'image/*,video/*,application/pdf,.pdf,.mp4,.mov,.webm,.jpg,.jpeg,.png,.gif,.webp,.svg';
    inp.onchange = function () { if (inp.files.length) puja(Array.prototype.slice.call(inp.files), idLlista); };
    inp.click();
  }

  var pujadesActives = 0;
  var cuaPujada = Promise.resolve();
  var panellPujades = null;
  function filaPujada(nom) {
    if (!panellPujades) {
      panellPujades = document.createElement('div');
      panellPujades.className = 'targeta pad';
      panellPujades.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:90;width:min(420px,calc(100% - 32px));max-height:50vh;overflow:auto;box-shadow:var(--ombra-gran)';
      panellPujades.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>Pujant fitxers</b><button class="btn fantasma icona" aria-label="Amaga">' + IC('tanca') + '</button></div><div class="pujades" style="margin:0"></div>';
      $('button', panellPujades).onclick = function () { if (!pujadesActives) { panellPujades.remove(); panellPujades = null; } else panellPujades.style.display = 'none'; };
      document.body.appendChild(panellPujades);
      if (window.innerWidth <= 860) panellPujades.style.bottom = '78px';
    }
    panellPujades.style.display = '';
    var f = document.createElement('div');
    f.className = 'pujada';
    f.innerHTML = '<span class="nom">' + esc(nom) + '</span><span class="molt-subtil" data-e>En espera</span><div class="barra-progres"><div></div></div>';
    $('.pujades', panellPujades).appendChild(f);
    return {
      estat: function (t, pct) { $('[data-e]', f).textContent = t; if (pct != null) $('.barra-progres > div', f).style.width = pct + '%'; },
      fet: function () { $('[data-e]', f).textContent = '✓ Fet'; $('[data-e]', f).style.color = 'var(--ok)'; $('.barra-progres > div', f).style.width = '100%'; },
      error: function (t) { $('[data-e]', f).innerHTML = IC('tanca') + t; $('[data-e]', f).style.color = 'var(--error)'; f.title = t; }
    };
  }

  /** Prepara (redueix, converteix PDF, miniatures) i puja una llista de fitxers. */
  function puja(fitxers, idLlista) {
    var total = 0, ok = 0, errors = 0;
    fitxers.forEach(function (fitxer) {
      var fila = filaPujada(fitxer.name);
      pujadesActives++;
      cuaPujada = cuaPujada.then(function () {
        fila.estat('Preparant…', 3);
        return preparaFitxer(fitxer, function (t) { fila.estat(t, 5); }).then(function (peces) {
          var cad = Promise.resolve();
          peces.forEach(function (p, i) {
            cad = cad.then(function () {
              total++;
              return pujaPeca(p, idLlista, function (pct) { fila.estat((peces.length > 1 ? 'Pàgina ' + (i + 1) + '/' + peces.length + ' · ' : '') + pct + '%', Math.round((i + pct / 100) / peces.length * 100)); })
                .then(function () { ok++; });
            });
          });
          return cad.then(function () { fila.fet(); });
        }).catch(function (e) { errors++; fila.error(e.message || 'Error'); });
      }).then(function () {
        pujadesActives--;
        if (!pujadesActives) {
          carrega().then(function () {
            S.edicio = null;
            render(true);
            toast(ok + ' fitxer' + (ok === 1 ? '' : 's') + ' pujat' + (ok === 1 ? '' : 's') + (idLlista ? ' i afegit' + (ok === 1 ? '' : 's') + ' a la llista' : '') + (errors ? ' · ' + errors + ' amb errors' : ''), errors ? 'error' : 'ok', 5000);
            setTimeout(function () { if (!pujadesActives && panellPujades && !errors) { panellPujades.remove(); panellPujades = null; } }, 4000);
          });
        }
      });
    });
  }

  var MAX_COSTAT = 2560;
  function preparaFitxer(f, estat) {
    var tipus = f.type || '';
    var nom = f.name.replace(/\.[^.]+$/, '');
    if (tipus === 'application/pdf' || /\.pdf$/i.test(f.name)) return pdfAImatges(f, nom, estat);
    if (/^image\//.test(tipus) || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(f.name)) {
      if (/heic|heif/i.test(tipus) || /\.hei[cf]$/i.test(f.name)) return Promise.reject(new Error('Format HEIC (iPhone): canvia\'l a JPG o puja\'l des de l\'app Fotos'));
      return preparaImatge(f, nom).then(function (p) { return [p]; });
    }
    if (/^video\//.test(tipus) || /\.(mp4|m4v|mov|webm)$/i.test(f.name)) return preparaVideo(f, nom).then(function (p) { return [p]; });
    return Promise.reject(new Error('Format no compatible'));
  }

  function carregaImatge(src) {
    return new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ko(new Error('No es pot llegir la imatge')); }; i.src = src; });
  }
  function aBlob(canvas, tipus, q) { return new Promise(function (ok) { canvas.toBlob(ok, tipus, q); }); }
  function miniatura(font, w, h) {
    var esc2 = Math.min(1, 240 / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * esc2)); c.height = Math.max(1, Math.round(h * esc2));
    var cx = c.getContext('2d');
    cx.fillStyle = '#D7D2CB'; cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(font, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.66);
  }

  function preparaImatge(f, nom) {
    var url = URL.createObjectURL(f);
    return carregaImatge(url).then(function (img) {
      var w = img.naturalWidth || 800, h = img.naturalHeight || 400;
      var thumb = miniatura(img, w, h);
      var gif = /gif|svg/i.test(f.type);
      var cal = !gif && (Math.max(w, h) > MAX_COSTAT || f.size > 4 * 1024 * 1024 || /bmp/i.test(f.type));
      if (!cal) { URL.revokeObjectURL(url); return { blob: f, name: f.name, mime: f.type || 'image/jpeg', w: w, h: h, thumb: thumb }; }
      var k = Math.min(1, MAX_COSTAT / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var ctx = c.getContext('2d');
      var png = /png/i.test(f.type);
      if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return aBlob(c, png ? 'image/png' : 'image/jpeg', 0.9).then(function (b) {
        if (png && b.size > 4 * 1024 * 1024) return aBlob(c, 'image/jpeg', 0.9).then(function (b2) { return { blob: b2, name: nom + '.jpg', mime: 'image/jpeg', w: c.width, h: c.height, thumb: thumb }; });
        return { blob: b, name: png ? f.name : nom + '.jpg', mime: png ? 'image/png' : 'image/jpeg', w: c.width, h: c.height, thumb: thumb };
      });
    });
  }

  function preparaVideo(f, nom) {
    if (f.size > 1024 * 1024 * 1024) return Promise.reject(new Error('Massa gran (màxim 1 GB)'));
    return new Promise(function (ok) {
      var v = document.createElement('video');
      var url = URL.createObjectURL(f);
      var fet = false;
      var acaba = function (thumb) {
        if (fet) return; fet = true;
        var r = { blob: f, name: f.name, mime: f.type || 'video/mp4', w: v.videoWidth || 0, h: v.videoHeight || 0, duration: isFinite(v.duration) ? v.duration : 0, thumb: thumb || '' };
        URL.revokeObjectURL(url);
        ok(r);
      };
      v.muted = true; v.preload = 'metadata'; v.playsInline = true;
      v.onloadedmetadata = function () { v.currentTime = Math.min(1.5, (v.duration || 2) / 3); };
      v.onseeked = function () { try { acaba(miniatura(v, v.videoWidth, v.videoHeight)); } catch (e) { acaba(''); } };
      v.onerror = function () { acaba(''); };
      setTimeout(function () { acaba(''); }, 15000);
      v.src = url;
    });
  }

  function pdfAImatges(f, nom, estat) {
    estat('Llegint el PDF…');
    return carregaScript(LIB.pdf, 'pdfjsLib').then(function (pdfjs) {
      pdfjs.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
      return f.arrayBuffer().then(function (buf) { return pdfjs.getDocument({ data: buf }).promise; });
    }).then(function (doc) {
      var peces = [];
      var cad = Promise.resolve();
      var n = Math.min(doc.numPages, 80);
      for (var i = 1; i <= n; i++) (function (num) {
        cad = cad.then(function () {
          estat('Convertint pàgina ' + num + '/' + n + '…');
          return doc.getPage(num).then(function (pag) {
            var v1 = pag.getViewport({ scale: 1 });
            var k = Math.min(4, 1920 / Math.max(v1.width, v1.height) * (v1.width >= v1.height ? 1 : 1080 / 1920 * 1.78));
            k = Math.max(k, 2560 / Math.max(v1.width, v1.height) * 0.75);
            var vp = pag.getViewport({ scale: k });
            var c = document.createElement('canvas');
            c.width = Math.round(vp.width); c.height = Math.round(vp.height);
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
            return pag.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
              return aBlob(c, 'image/jpeg', 0.9).then(function (b) {
                peces.push({ blob: b, name: nom + (n > 1 ? ' · pàg. ' + num : '') + '.jpg', mime: 'image/jpeg', w: c.width, h: c.height, thumb: miniatura(c, c.width, c.height) });
              });
            });
          });
        });
      })(i);
      return cad.then(function () { return peces; });
    });
  }

  function pujaPeca(p, idLlista, progres) {
    return crida('uploadStart', { name: p.name, mime: p.mime, size: p.blob.size, w: p.w, h: p.h, duration: p.duration || 0, thumb: p.thumb, playlistId: idLlista || '' }, { silenci: true })
      .then(function (r) {
        var mida = r.chunkSize, offset = 0;
        function seguent(intents) {
          var tros = p.blob.slice(offset, offset + mida);
          return tros.arrayBuffer().then(function (buf) {
            return crida('uploadChunk', { uploadId: r.uploadId, offset: offset, data: Pnt.bytesAB64(buf) }, { silenci: true, timeout: 180000 });
          }).then(function (res) {
            offset += tros.size;
            progres(Math.min(100, Math.round(offset / p.blob.size * 100)));
            if (res.done) return res.media;
            return seguent(0);
          }, function (e) {
            if (intents < 3 && e.code === 'XARXA') return new Promise(function (ok) { setTimeout(ok, 3000); }).then(function () { return seguent(intents + 1); });
            throw e;
          });
        }
        return seguent(0);
      });
  }

  /* ------------------------------------------------------------------
   *  AVISOS
   * ---------------------------------------------------------------- */
  var TEMES_AVIS = [['urgent', 'Urgent', 'Granat, amb l\'etiqueta vermella que parpelleja'], ['info', 'Informatiu', 'Fons clar, més tranquil'], ['neutre', 'Sobri', 'Fons negre']];
  var COLOR_TEMA = { urgent: '#821E34', info: '#BFB8AF', neutre: '#2D2926' };
  VISTES.avisos = function () {
    titol('Avisos');
    var d = S.d;
    var av = actius(d.alerts);
    var passats = d.alerts.filter(function (a) { return av.indexOf(a) < 0; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 15);
    var html = '<div class="capcalera"><div><h2>Avisos</h2><p>Missatges que passen per davant de tot el contingut: simulacres, canvis d\'última hora, benvingudes…</p></div></div>' +
      '<button class="boto-urgent" data-accio="nou" style="max-width:520px"><span class="gran-ic">' + IC('alerta') + '</span><span><b>Nou avís</b>Es veurà a les pantalles en menys d\'un minut</span></button>';
    html += '<div class="seccio"><h3>Actius ara (' + av.length + ')</h3>' + (av.length ? '<div class="pila">' + av.map(htmlAvis).join('') + '</div>' : '<div class="targeta pad subtil">Cap avís actiu.</div>') + '</div>';
    if (passats.length) html += '<div class="seccio"><h3>Recents (aturats o caducats)</h3><div class="pila">' + passats.map(htmlAvis).join('') + '</div></div>';

    html += '<div class="seccio"><h3>Cinta de missatges</h3><div class="targeta pad pila"><p class="subtil" style="margin:0">Frases curtes que passen contínuament per la part de baix de les pantalles que la tinguin activada (configuració de cada pantalla).</p>' +
      '<div class="pila" data-cinta style="gap:8px"></div><div class="btns"><button class="btn" data-accio="afegir-cinta">' + IC('mes') + 'Afegeix un missatge</button></div></div></div>';
    $('#vista').innerHTML = html;
    $('[data-accio=nou]').onclick = function () { editaAvis(null); };
    activaAvisos($('#vista'));
    pintaCinta();
  };

  function htmlAvis(a) {
    var actiu = actius([a]).length > 0;
    var pantalles = a.screens === 'all' ? 'Totes les pantalles' : (a.screens || []).map(function (id) { return (troba(S.d.screens, id) || {}).name; }).filter(Boolean).join(', ') || 'Cap pantalla';
    var fins = a.until ? (Date.parse(a.until) > araServidor() ? 'fins ' + dataHora(a.until) : 'va acabar ' + dataHora(a.until)) : 'fins que s\'aturi';
    return '<div class="targeta t-avis" style="border-left-color:' + esc(a.color) + (actiu ? '' : ';opacity:.7') + '"><div class="cos">' +
      '<h4>' + esc(a.title || '(sense títol)') + '</h4>' + (a.text ? '<p>' + esc(a.text) + '</p>' : '') +
      '<div class="chips"><span class="badge ' + (actiu ? 'error' : '') + '">' + (actiu ? '● Es mostra ara' : 'Aturat') + '</span><span class="badge">' + (a.mode === 'banner' ? 'Banda superior' : 'Pantalla completa') + '</span>' +
      '<span class="badge">' + IC('pantalles') + esc(pantalles) + '</span><span class="badge">' + IC('temps') + esc(fins) + '</span></div>' +
      '<div class="molt-subtil" style="margin-top:6px">Publicat ' + dataHora(a.at) + ' per ' + esc((a.by || '').split('@')[0]) + '</div></div>' +
      '<div class="btns" style="flex-direction:column;align-items:stretch">' + (actiu ? '<button class="btn perill-ple petit" data-atura="' + a.id + '">' + IC('atura') + 'Atura</button>' : '<button class="btn petit" data-reactiva="' + a.id + '">' + IC('play') + 'Torna a mostrar</button>') +
      '<button class="btn petit" data-edita-avis="' + a.id + '">' + IC('edita') + 'Edita</button>' + (actiu ? '' : '<button class="btn petit fantasma" data-esborra-avis="' + a.id + '">' + IC('esborra') + '</button>') + '</div></div>';
  }
  function activaAvisos(cont) {
    $$('[data-atura]', cont).forEach(function (b) {
      b.onclick = function () {
        var a = copia(troba(S.d.alerts, b.dataset.atura)); a.on = false;
        crida('saveAlert', { alert: a }, { desa: true }).then(function () { return carrega(); }).then(function () { toast('Avís aturat. Desapareixerà de les pantalles en menys d\'un minut.', 'ok'); render(true); });
      };
    });
    $$('[data-reactiva]', cont).forEach(function (b) { b.onclick = function () { var a = copia(troba(S.d.alerts, b.dataset.reactiva)); a.on = true; if (a.until && Date.parse(a.until) < araServidor()) a.until = null; editaAvis(a); }; });
    $$('[data-edita-avis]', cont).forEach(function (b) { b.onclick = function () { editaAvis(copia(troba(S.d.alerts, b.dataset.editaAvis))); }; });
    $$('[data-esborra-avis]', cont).forEach(function (b) {
      b.onclick = function () { crida('deleteAlert', { id: b.dataset.esborraAvis }, { desa: true }).then(function () { return carrega(); }).then(function () { render(true); }); };
    });
  }

  function editaAvis(a) {
    var nou = !a || !a.id;
    a = a || { title: '', text: '', mode: 'full', color: '#c8102e', screens: 'all', until: null, on: true };
    var totes = a.screens === 'all';
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    var localIso = function (d) { return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };
    obreModal({
      titol: nou ? 'Nou avís' : 'Edita l\'avís',
      classe: 'ample',
      cos: '<div class="editor-graella"><div class="pila">' +
        '<label class="camp">Títol<input type="text" data-a="title" value="' + esc(a.title) + '" maxlength="160" placeholder="Simulacre d\'evacuació" autofocus></label>' +
        '<label class="camp">Text (opcional)<textarea data-a="text" maxlength="1000" rows="3" placeholder="Sortiu en ordre pel punt de trobada del pati.">' + esc(a.text) + '</textarea></label>' +
        '<div class="camp">Com es mostra<div class="segment"><label><input type="radio" name="am" value="full"' + (a.mode !== 'banner' ? ' checked' : '') + '><span>Pantalla completa</span></label><label><input type="radio" name="am" value="banner"' + (a.mode === 'banner' ? ' checked' : '') + '><span>Banda a dalt</span></label></div>' +
        '<span class="ajuda">Pantalla completa: tapa tot el contingut. Banda: el contingut continua per sota.</span></div>' +
        '<div class="camp">Estil<div class="segment">' + TEMES_AVIS.map(function (t) { return '<label title="' + esc(t[2]) + '"><input type="radio" name="at" value="' + t[0] + '"' + ((a.tema || 'urgent') === t[0] ? ' checked' : '') + '><span>' + t[1] + '</span></label>'; }).join('') + '</div></div>' +
        '<label class="camp">Etiqueta (opcional)<input type="text" data-a="label" value="' + esc(a.label || '') + '" maxlength="40" placeholder="Avís urgent"></label>' +
        '<div class="camp">A quines pantalles<div class="pila" style="gap:8px;font-weight:500"><label class="interruptor"><input type="checkbox" data-totes' + (totes ? ' checked' : '') + '> <b>Totes</b></label>' +
        S.d.screens.map(function (p) { return '<label class="interruptor" data-una><input type="checkbox" data-p="' + p.id + '"' + (totes || (a.screens || []).indexOf(p.id) >= 0 ? ' checked' : '') + (totes ? ' disabled' : '') + '> ' + esc(p.name) + '</label>'; }).join('') + '</div></div>' +
        '<label class="camp">Quant de temps<select data-durada><option value="">Fins que l\'aturi</option><option value="15">15 minuts</option><option value="30">30 minuts</option><option value="60">1 hora</option><option value="120">2 hores</option><option value="dia">Fins al final del dia</option><option value="data"' + (a.until ? ' selected' : '') + '>Fins a una data i hora…</option></select></label>' +
        '<input type="datetime-local" data-fins' + (a.until ? '' : ' hidden') + ' value="' + (a.until ? localIso(new Date(a.until)) : '') + '">' +
        '</div><div class="pila"><div class="camp">Així es veurà<div class="previa-caixa" data-previa-avis style="font-family:system-ui"></div></div></div></div>',
      peu: '<button class="btn" data-tanca>Cancel·la</button><button class="btn perill-ple" data-ok>' + (nou ? IC('alerta') + 'Publica l\'avís' : 'Desa') + '</button>',
      noTancarFora: true,
      enObrir: function (el) {
        var caixa = $('[data-previa-avis]', el);
        var pinta = function () {
          var t = $('[data-a=title]', el).value, x = $('[data-a=text]', el).value;
          var mode = $('input[name=am]:checked', el).value, tema = $('input[name=at]:checked', el).value;
          var etq = $('[data-a=label]', el).value || (tema === 'urgent' ? 'Avís urgent' : 'Avís');
          if (mode === 'full') {
            var n = pintaDiapoA(caixa, { kind: 'text', text: { template: tema === 'info' ? 'paper' : 'granat', label: etq, title: t, body: x, size: 110 } });
            if (n && tema === 'neutre') n.style.background = '#2D2926';
          } else {
            Pnt.diapo.escala(caixa);
            var fons = tema === 'info' ? '#F4F1ED' : tema === 'neutre' ? '#2D2926' : '#821E34';
            caixa.innerHTML = '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:#6B625B"></div>' +
              '<div style="position:absolute;left:0;right:0;top:0;min-height:12em;display:flex;background:' + fons + ';color:' + (tema === 'info' ? '#2D2926' : '#fff') + ';font-family:var(--font)">' +
              '<div style="background:#FF004E;color:#fff;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:3em;display:flex;align-items:center;padding:0 1.6em 0 1em;clip-path:polygon(0 0,100% 0,calc(100% - .55em) 100%,0 100%)">' + esc(etq) + '</div>' +
              '<div style="padding:2.2em 3em"><div style="font-size:4.6em;font-weight:700;line-height:1.05;color:' + (tema === 'info' ? '#821E34' : '#fff') + '">' + esc(t) + '</div><div style="font-size:3.2em">' + esc(x) + '</div></div></div>';
          }
        };
        $$('input,textarea,select', el).forEach(function (i) { i.addEventListener('input', pinta); i.addEventListener('change', pinta); });
        $('[data-totes]', el).onchange = function () { var t = this.checked; $$('[data-p]', el).forEach(function (c) { c.disabled = t; if (t) c.checked = true; }); };
        $('[data-durada]', el).onchange = function () { $('[data-fins]', el).hidden = this.value !== 'data'; if (this.value === 'data' && !$('[data-fins]', el).value) $('[data-fins]', el).value = localIso(new Date(Date.now() + 3600e3)); };
        pinta(); setTimeout(pinta, 60);
        $('[data-ok]', el).onclick = function () {
          var r = copia(a);
          r.title = $('[data-a=title]', el).value.trim();
          r.text = $('[data-a=text]', el).value.trim();
          if (!r.title && !r.text) { toast('Escriu el títol de l\'avís.', 'error'); return; }
          r.mode = $('input[name=am]:checked', el).value;
          r.tema = $('input[name=at]:checked', el).value;
          r.label = $('[data-a=label]', el).value.trim();
          r.color = COLOR_TEMA[r.tema];
          r.screens = $('[data-totes]', el).checked ? 'all' : $$('[data-p]:checked', el).map(function (c) { return c.dataset.p; });
          if (r.screens !== 'all' && !r.screens.length) { toast('Tria almenys una pantalla.', 'error'); return; }
          var du = $('[data-durada]', el).value;
          if (!du) r.until = null;
          else if (du === 'dia') { var f = new Date(); f.setHours(23, 59, 0, 0); r.until = f.toISOString(); }
          else if (du === 'data') { var v = $('[data-fins]', el).value; if (!v) { toast('Tria la data i hora.', 'error'); return; } r.until = new Date(v).toISOString(); }
          else r.until = new Date(araServidor() + parseInt(du, 10) * 60000).toISOString();
          r.on = true;
          var b = this; b.disabled = true; b.innerHTML = '<span class="roda petita"></span> Publicant…';
          crida('saveAlert', { alert: r }, { desa: true }).then(function () { return carrega(); }).then(function () {
            tancaModal(); toast(nou ? 'Avís publicat. Apareixerà a les pantalles en menys d\'un minut.' : 'Avís desat', 'ok', 5000);
            if (ruta().sec !== 'avisos') location.hash = '#avisos'; else render(true);
          }, function () { b.disabled = false; b.innerHTML = nou ? IC('alerta') + 'Publica l\'avís' : 'Desa'; });
        };
      }
    });
  }

  function pintaCinta() {
    var cont = $('[data-cinta]');
    if (!cont) return;
    var cinta = copia(S.d.ticker || []);
    var desa = debounce(function () {
      crida('saveTicker', { ticker: cinta.filter(function (t) { return t.text.trim(); }) }, { desa: true }).then(function () { return carrega(); }).then(function () { if (!cont.contains(document.activeElement)) pintaCinta(); });
    }, 900);
    var pinta = function () {
      cont.innerHTML = cinta.length ? cinta.map(function (t, i) {
        return '<div class="item" style="padding:6px 8px"><label class="interruptor"><input type="checkbox" data-on="' + i + '"' + (t.on !== false ? ' checked' : '') + ' aria-label="Actiu"></label>' +
          '<input type="text" data-text="' + i + '" value="' + esc(t.text) + '" maxlength="300" placeholder="Escriu el missatge…" style="flex:1">' +
          '<button class="btn fantasma icona" data-treu="' + i + '" aria-label="Esborra">' + IC('tanca') + '</button></div>';
      }).join('') : '<div class="subtil">Encara no hi ha missatges. Exemple: «Dimecres 12: jornada de portes obertes de 17 a 19 h».</div>';
      $$('[data-on]', cont).forEach(function (c) { c.onchange = function () { cinta[+c.dataset.on].on = c.checked; desa(); }; });
      $$('[data-text]', cont).forEach(function (c) { c.oninput = function () { cinta[+c.dataset.text].text = c.value; desa(); }; });
      $$('[data-treu]', cont).forEach(function (c) { c.onclick = function () { cinta.splice(+c.dataset.treu, 1); pinta(); desa(); }; });
    };
    pinta();
    var b = $('[data-accio=afegir-cinta]');
    if (b) b.onclick = function () { cinta.push({ text: '', on: true, screens: 'all' }); pinta(); var i = $$('[data-text]', cont).pop(); if (i) i.focus(); };
  }

  /* ------------------------------------------------------------------
   *  AJUSTOS
   * ---------------------------------------------------------------- */
  function htmlLogo(tipus, titol, ajuda, id, admin) {
    var fons = tipus === 'neg' ? '#821E34' : '#F4F1ED';
    var u = S.logos[tipus];
    return '<div class="camp">' + titol + '<div class="btns"><div style="background:' + fons + ';padding:10px 14px;min-width:120px;height:64px;display:flex;align-items:center">' +
      (u ? '<img src="' + u + '" alt="" style="max-height:44px;max-width:200px">' : '<span style="color:' + (tipus === 'neg' ? '#fff' : '#6B625B') + ';font-weight:600">Cap</span>') + '</div>' +
      (admin ? '<button class="btn petit" data-tria-logo="' + tipus + '">Tria…</button>' + (id ? '<button class="btn petit" data-treu-logo="' + tipus + '">Treu</button>' : '') : '') +
      '</div><span class="ajuda">' + ajuda + '</span></div>';
  }

  VISTES.ajustos = function () {
    titol('Ajustos');
    var d = S.d, s = d.settings;
    var admin = S.user && S.user.role === 'admin';
    var dis = admin ? '' : ' disabled';
    var html = '<div class="capcalera"><div><h2>Ajustos</h2>' + (admin ? '' : '<p>Només els administradors poden canviar els ajustos generals.</p>') + '</div></div>';
    html += '<div class="fila" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">';
    html += '<div class="targeta pad pila" data-form-ajustos><h3 style="margin:0">General</h3>' +
      '<label class="camp">Nom de l\'escola<input type="text" data-s="schoolName" value="' + esc(s.schoolName) + '" maxlength="120"' + dis + '></label>' +
      htmlLogo('color', 'Logotip en color', 'Per a fons clars (blanc, paper). Millor en SVG o PNG amb fons transparent.', s.logoMediaId, admin) +
      htmlLogo('neg', 'Logotip en negatiu (blanc)', 'Per a fons granat i fotos: pantalla d\'espera, avisos i menú del panell.', s.logoNegMediaId, admin) +
      '<div class="fila">' +
      '<label class="camp">Segons per foto<input type="number" min="2" max="600" data-s="defaultDuration" value="' + s.defaultDuration + '"' + dis + '></label></div>' +
      '<div class="fila"><label class="camp">Transició general<select data-s="defaultTransition"' + dis + '>' + ['fade', 'slide', 'zoom', 'none'].map(function (t) { return '<option value="' + t + '"' + (s.defaultTransition === t ? ' selected' : '') + '>' + nomTransicio(t) + '</option>'; }).join('') + '</select></label>' +
      '<label class="camp">Velocitat de la cinta<select data-s="tickerSpeed"' + dis + '>' + [[50, 'Lenta'], [90, 'Normal'], [140, 'Ràpida']].map(function (v) { return '<option value="' + v[0] + '"' + (+s.tickerSpeed === v[0] ? ' selected' : '') + '>' + v[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="camp">Bústia automàtica del Drive<select data-s="bustiaPlaylistId"' + dis + '><option value="">Desactivada (s\'importa a mà)</option>' + d.playlists.map(function (l) { return '<option value="' + l.id + '"' + (s.bustiaPlaylistId === l.id ? ' selected' : '') + '>Afegir a «' + esc(l.name) + '»</option>'; }).join('') + '</select>' +
      '<span class="ajuda">Cada 10 minuts, les fotos i vídeos que es deixin a la carpeta Bústia del Drive s\'afegeixen sols a aquesta llista.</span></label></div>';

    // Persones
    html += '<div class="targeta pad pila"><h3 style="margin:0">Persones amb accés</h3><p class="subtil" style="margin:0">Entren amb el seu correu: reben un codi cada vegada que entren des d\'un aparell nou. <b>Editor/a</b>: gestiona contingut, pantalles i avisos. <b>Administrador/a</b>: a més, ajustos i persones.</p>' +
      '<div style="overflow-x:auto"><table class="taula"><thead><tr><th>Correu</th><th>Nom</th><th>Rol</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody data-usuaris>' +
      d.users.map(function (u, i) {
        var jo = S.user && u.email === S.user.email;
        return '<tr><td>' + (admin ? '<input type="email" data-u-email="' + i + '" value="' + esc(u.email) + '"' + (jo ? ' disabled' : '') + '>' : esc(u.email)) + '</td>' +
          '<td>' + (admin ? '<input type="text" data-u-nom="' + i + '" value="' + esc(u.name || '') + '" placeholder="Nom">' : esc(u.name || '')) + '</td>' +
          '<td>' + (admin ? '<select data-u-rol="' + i + '"' + (jo ? ' disabled' : '') + '><option value="editor"' + (u.role !== 'admin' ? ' selected' : '') + '>Editor/a</option><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Administrador/a</option></select>' : (u.role === 'admin' ? 'Administrador/a' : 'Editor/a')) + '</td>' +
          (admin ? '<td>' + (jo ? '<span class="molt-subtil">Tu</span>' : '<button class="btn fantasma icona" data-u-treu="' + i + '" aria-label="Treu">' + IC('tanca') + '</button>') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      (admin ? '<div class="btns"><button class="btn" data-u-afegeix>' + IC('mes') + 'Afegeix una persona</button><button class="btn primari" data-u-desa hidden>Desa les persones</button></div>' : '') + '</div>';
    html += '</div>';

    // Servei (actualitzacions)
    if (admin) {
      html += '<div class="seccio"><h3>Servei de Google</h3><div class="targeta pad pila" data-servei>' +
        '<div>Versió del servei: <b>' + esc(d.version) + '</b>' + (serveiAntic() ? ' · <span class="badge error">cal actualitzar (el panell espera la ' + VERSIO_SERVEI + ')</span>' : ' · <span class="badge ok">al dia</span>') + '</div>' +
        '<div class="subtil" data-servei-estat>Comprovant…</div>' +
        '<p class="subtil" style="margin:0">El servei s\'actualitza sol des de GitHub cada vegada que es publica un canvi. Aquests botons només calen si alguna cosa no ha anat bé.</p>' +
        '<div class="btns"><button class="btn primari" data-servei-act>' + IC('recarrega') + 'Actualitza ara</button><button class="btn" data-servei-enrere>' + IC('recarrega') + 'Torna a la versió anterior</button></div></div></div>';
    }

    // Instal·lar pantalles
    html += '<div class="seccio"><h3>Com posar una pantalla nova</h3><div class="targeta pad"><div class="fila" style="grid-template-columns:1fr auto;align-items:center">' +
      '<div class="pila" style="gap:8px"><div>1. Connecta a la tele qualsevol aparell amb navegador: la mateixa Smart TV, un miniPC, un Chromecast amb Google TV, un ordinador vell…</div>' +
      '<div>2. Obre el navegador i ves a:</div><div class="copiar"><input type="text" readonly value="' + esc(urlReproductor()) + '"><button class="btn" data-copia-url>Copia</button></div>' +
      '<div>3. Sortirà un codi. Ves a <a href="#pantalles">Pantalles → Afegir pantalla</a> i escriu-lo.</div>' +
      '<div>4. Posa el navegador a pantalla completa (prem OK o fes clic) i configura l\'aparell perquè obri el navegador en engegar-se. Ho tens explicat a la guia.</div></div>' +
      '<div class="qr" data-qr-url><span class="roda"></span></div></div></div></div>';

    // Aparença i sessió
    html += '<div class="seccio"><h3>Aquest aparell</h3><div class="targeta pad pila">' +
      '<div class="btns"><a class="btn" href="#registre">' + IC('llistes') + 'Registre d\'activitat</a><button class="btn" data-surt>' + IC('surt') + 'Tanca la sessió</button></div>' +
      '<div class="molt-subtil">Pantalles · versió ' + esc(d.version) + ' · ' + esc(S.user ? S.user.email : '') + '</div></div></div>';
    $('#vista').innerHTML = html;

    // General
    if (admin) {
      var form = $('[data-form-ajustos]');
      var desa = debounce(function () {
        var nous = copia(s);
        $$('[data-s]', form).forEach(function (i) { nous[i.dataset.s] = i.type === 'number' || i.dataset.s === 'tickerSpeed' ? parseInt(i.value, 10) : i.value; });
        crida('saveSettings', { settings: nous }, { desa: true }).then(function () { Object.assign(s, nous); S.rev = null; });
      }, 700);
      $$('[data-s]', form).forEach(function (i) { i.addEventListener(i.type === 'text' || i.type === 'number' ? 'input' : 'change', desa); });
      $$('[data-tria-logo]').forEach(function (b) {
        b.onclick = function () {
          triaMitjans({ kind: 'image' }).then(function (ids) {
            if (!ids || !ids[0]) return;
            var camp = b.dataset.triaLogo === 'neg' ? 'logoNegMediaId' : 'logoMediaId';
            var nous = copia(s); nous[camp] = ids[0];
            crida('saveSettings', { settings: nous }, { desa: true }).then(function () { s[camp] = ids[0]; return carregaLogos(); }).then(function () { render(true); });
          });
        };
      });
      $$('[data-treu-logo]').forEach(function (b) {
        b.onclick = function () {
          var camp = b.dataset.treuLogo === 'neg' ? 'logoNegMediaId' : 'logoMediaId';
          var nous = copia(s); nous[camp] = '';
          crida('saveSettings', { settings: nous }, { desa: true }).then(function () { s[camp] = ''; return carregaLogos(); }).then(function () { render(true); });
        };
      });

      // Persones
      var usuaris = copia(d.users);
      var bDesa = $('[data-u-desa]');
      var marca = function () { bDesa.hidden = false; };
      $$('[data-u-email]').forEach(function (i) { i.oninput = function () { usuaris[+i.dataset.uEmail].email = i.value.trim().toLowerCase(); marca(); }; });
      $$('[data-u-nom]').forEach(function (i) { i.oninput = function () { usuaris[+i.dataset.uNom].name = i.value; marca(); }; });
      $$('[data-u-rol]').forEach(function (i) { i.onchange = function () { usuaris[+i.dataset.uRol].role = i.value; marca(); }; });
      $$('[data-u-treu]').forEach(function (b) { b.onclick = function () { usuaris.splice(+b.dataset.uTreu, 1); b.closest('tr').remove(); marca(); }; });
      $('[data-u-afegeix]').onclick = function () {
        var i = usuaris.length;
        usuaris.push({ email: '', name: '', role: 'editor' });
        $('[data-usuaris]').insertAdjacentHTML('beforeend', '<tr><td><input type="email" data-u-email="' + i + '" placeholder="nom@escola.cat"></td><td><input type="text" data-u-nom="' + i + '" placeholder="Nom"></td><td><select data-u-rol="' + i + '"><option value="editor">Editor/a</option><option value="admin">Administrador/a</option></select></td><td></td></tr>');
        var tr2 = $('[data-usuaris] tr:last-child');
        $('[data-u-email]', tr2).oninput = function () { usuaris[i].email = this.value.trim().toLowerCase(); marca(); };
        $('[data-u-nom]', tr2).oninput = function () { usuaris[i].name = this.value; marca(); };
        $('[data-u-rol]', tr2).onchange = function () { usuaris[i].role = this.value; marca(); };
        $('[data-u-email]', tr2).focus();
        marca();
      };
      bDesa.onclick = function () {
        var dolents = usuaris.filter(function (u) { return u.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email); });
        if (dolents.length) { toast('Hi ha algun correu mal escrit: ' + dolents[0].email, 'error'); return; }
        crida('saveUsers', { users: usuaris.filter(function (u) { return u.email; }) }, { desa: true }).then(function () { return carrega(); }).then(function () { toast('Persones desades. Ja poden entrar amb el seu correu.', 'ok'); render(true); });
      };
    }
    var caixaServei = $('[data-servei]');
    if (caixaServei) {
      crida('serviceStatus', {}, { silenci: true }).then(function (r) {
        $('[data-servei-estat]').innerHTML = (r.loader === false ? '<span style="color:var(--error)">Falta el fitxer «Carregador» al projecte d\'Apps Script (GUIA → «Actualitzacions automàtiques»).</span><br>' : '') +
          (r.commit ? 'Codi de GitHub: ' + esc(r.commit.substr(0, 7)) + ' · ' : '') +
          (r.lastUpdate ? 'Última actualització: ' + dataHora(r.lastUpdate) : 'Encara no s\'ha actualitzat mai sol') +
          (r.lastError ? '<br><span style="color:var(--error)">Últim error: ' + esc(r.lastError) + '</span>' : '');
      }, function (e) {
        $('[data-servei-estat]').innerHTML = '<span style="color:var(--error)">Aquest servei encara no sap actualitzar-se sol. Cal fer la configuració inicial (GUIA → «Actualitzacions automàtiques»).</span>';
      });
      $('[data-servei-act]').onclick = function () {
        var b = this; b.disabled = true; b.innerHTML = '<span class="roda petita"></span> Actualitzant…';
        crida('updateService', { force: true }, { desa: true, timeout: 120000 }).then(function (r) {
          toast(r.missatge, 'ok', 6000);
          setTimeout(function () { location.reload(); }, 2500);
        }, function () { b.disabled = false; b.innerHTML = IC('recarrega') + 'Actualitza ara'; });
      };
      $('[data-servei-enrere]').onclick = function () {
        confirma('Tornar a la versió anterior', 'El servei tornarà a la versió d\'abans de l\'última actualització. Fes-ho només si alguna cosa ha deixat de funcionar.', { ok: 'Torna-hi' }).then(function (si) {
          if (si) crida('rollbackService', {}, { desa: true, timeout: 120000 }).then(function (r) { toast(r.missatge, 'ok', 6000); setTimeout(function () { location.reload(); }, 2500); });
        });
      };
    }
    $('[data-copia-url]').onclick = function () { var u = urlReproductor(); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Copiat', 'ok'); }, function () {}); };
    dibuixaQr($('[data-qr-url]'), urlReproductor());
    $('[data-surt]').onclick = function () { surt(false); };
  };

  VISTES.registre = function () {
    titol('Registre d\'activitat', '#ajustos', 'Ajustos');
    $('#vista').innerHTML = '<div class="capcalera"><div><h2>Registre d\'activitat</h2><p>Qui ha fet què i quan (últims 200 canvis).</p></div></div>' +
      '<div class="targeta pad"><ul class="registre">' + (S.d.log || []).map(htmlRegistre).join('') + '</ul></div>';
  };



  /* ------------------------------------------------------------------
   *  Arrencada
   * ---------------------------------------------------------------- */
  $$('[data-ic]').forEach(function (e) { e.innerHTML = IC(e.dataset.ic, 20); });
  configuraLogin();
  if (S.session && Pnt.apiConfigurada()) entra(); else mostraLogin();

  window.__panell = { S: S, render: render };
})();
