/**
 * PANTALLES · Punt d'entrada del servei web
 * ------------------------------------------------------------------
 * Tant el panell com les pantalles parlen amb aquest servei enviant
 * peticions JSON { action: '...', ... }. Aquí es decideix qui pot fer què.
 *
 *   Accions públiques  → només les fan servir les pantalles (amb la seva clau).
 *   Accions del panell → cal una sessió d'una persona autoritzada.
 */

// Les taules es creen dins funcions: a Apps Script cada fitxer .gs es carrega
// per separat i les funcions dels altres fitxers encara no existeixen en aquest punt.
function accionsPubliques_() { return {
  ping: function () { return { app: 'pantalles', version: VERSIO_APP, serverTime: Date.now() }; },
  pairStart: accioIniciaVinculacio_,
  pairCheck: accioComprovaVinculacio_,
  sync: accioSync_,
  chunk: accioTros_,
  loginStart: accioIniciaLogin_,
  loginVerify: accioVerificaLogin_,
  logout: accioSurt_,
  selfUpdate: accioAutoActualitza_
}; }

// [funció, cal ser administrador]
function accionsPanell_() { return {
  state: [accioEstat_, false],
  thumbs: [accioMiniatures_, false],
  preview: [accioVistaPrevia_, false],
  savePlaylist: [accioDesaLlista_, false],
  deletePlaylist: [accioEsborraLlista_, false],
  saveScreen: [accioDesaPantalla_, false],
  deleteScreen: [accioEsborraPantalla_, true],
  pairScreen: [accioVinculaPantalla_, false],
  createScreen: [accioCreaPantalla_, false],
  screenLink: [accioEnllacPantalla_, false],
  renewScreenLink: [accioRenovaEnllac_, true],
  screenCommand: [accioOrdrePantalla_, false],
  saveMedia: [accioDesaMitja_, false],
  deleteMedia: [accioEsborraMitja_, false],
  uploadStart: [accioIniciaPujada_, false],
  uploadChunk: [accioTrosPujada_, false],
  bustiaList: [accioLlistaBustia_, false],
  bustiaImport: [accioImportaBustia_, false],
  saveAlert: [accioDesaAvis_, false],
  deleteAlert: [accioEsborraAvis_, false],
  saveTicker: [accioDesaCinta_, false],
  saveSettings: [accioDesaAjustos_, true],
  saveUsers: [accioDesaUsuaris_, true],
  updateService: [accioActualitzaServei_, true],
  rollbackService: [accioTornaVersio_, true],
  serviceStatus: [accioEstatServei_, true]
}; }

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action) return resposta_(executa_(p));
  return resposta_({ ok: true, app: 'pantalles', version: VERSIO_APP, missatge: 'Servei de Pantalles actiu.' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return resposta_({ ok: false, error: 'Petició mal formada.', code: 'JSON' }); }
  return resposta_(executa_(req));
}

function executa_(req) {
  try {
    let res;
    const publiques = accionsPubliques_(), panell = accionsPanell_();
    if (publiques.hasOwnProperty(req.action)) {
      res = publiques[req.action](req);
    } else if (panell.hasOwnProperty(req.action)) {
      const def = panell[req.action];
      const u = usuariSessio_(req, null, def[1]);
      res = def[0](req, u);
    } else {
      throw errUsuari_('Acció desconeguda: ' + req.action, 'ACCIO');
    }
    res = res || {};
    res.ok = true;
    return res;
  } catch (err) {
    if (!err.userMsg) console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: err.userMsg || ('Error inesperat: ' + (err.message || err)), code: err.code || 'ERR' };
  }
}

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================================================================
 *  ESTAT PER AL PANELL
 * ==================================================================== */
function accioEstat_(req, u) {
  const bd = llegeixBd_();
  const estats = estatsPantalles_(bd);
  if (req.rev && String(req.rev) === String(bd.rev)) return { same: true, rev: bd.rev, status: estats, serverTime: Date.now() };
  const res = {
    rev: bd.rev, version: VERSIO_APP, serverTime: Date.now(), user: u,
    settings: bd.settings, users: bd.users,
    screens: bd.screens.map(senseSecrets_),
    playlists: bd.playlists, media: bd.media, alerts: bd.alerts, ticker: bd.ticker,
    status: estats, log: bd.log.slice(-200).reverse()
  };
  return res;
}

/** Miniatures que el panell encara no té (es guarden al navegador). */
function accioMiniatures_(req, u) {
  const totes = llegeixMiniatures_();
  const res = {};
  [].concat(req.ids || []).slice(0, 300).forEach(function (id) { if (totes[id]) res[id] = totes[id]; });
  return { thumbs: res };
}

function accioVistaPrevia_(req, u) {
  const bd = llegeixBd_();
  const p = troba_(bd.screens, req.screenId);
  if (!p) throw errUsuari_('Pantalla desconeguda.', 'NO_EXISTEIX');
  return { serverTime: Date.now(), rev: bd.rev, config: configPantalla_(bd, p) };
}

/* ======================================================================
 *  VALIDACIÓ (mai ens fiem del que arriba)
 * ==================================================================== */
const TIPUS_ITEM = ['media', 'text', 'web', 'youtube', 'clock', 'countdown', 'collage'];
const TRANSICIONS = ['', 'fade', 'slide', 'zoom', 'none'];
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_COLOR = /^#[0-9a-fA-F]{6}$/;

function color_(c, perDefecte) { return RE_COLOR.test(c || '') ? c : perDefecte; }
function enter_(v, min, max, perDefecte) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return perDefecte;
  return Math.max(min, Math.min(max, n));
}
function dies_(d) {
  return [].concat(d || []).map(function (x) { return parseInt(x, 10); })
    .filter(function (x, i, a) { return x >= 0 && x <= 6 && a.indexOf(x) === i; }).sort();
}
function url_(u) {
  u = String(u || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(u) ? u.substr(0, 2000) : '';
}

function netejaHorari_(h) {
  if (!h) return null;
  const r = {
    from: RE_DATA.test(h.from || '') ? h.from : '',
    to: RE_DATA.test(h.to || '') ? h.to : '',
    days: dies_(h.days),
    tFrom: RE_HORA.test(h.tFrom || '') ? h.tFrom : '',
    tTo: RE_HORA.test(h.tTo || '') ? h.tTo : ''
  };
  if (r.days.length === 7) r.days = [];
  if (!r.from && !r.to && !r.days.length && !r.tFrom && !r.tTo) return null;
  return r;
}

function netejaItem_(it, bd) {
  const kind = TIPUS_ITEM.indexOf(it.kind) >= 0 ? it.kind : null;
  if (!kind) throw errUsuari_('Tipus de contingut desconegut.', 'ITEM');
  const d = it.duration === null || it.duration === '' || it.duration === undefined ? null : enter_(it.duration, 2, 7200, null);
  const r = {
    id: /^[a-z0-9]{4,20}$/i.test(it.id || '') ? it.id : nouId_('i'),
    kind: kind, on: it.on !== false, name: text_(it.name, 120), duration: d,
    transition: TRANSICIONS.indexOf(it.transition) >= 0 ? it.transition : '',
    fit: ['cover', 'contain'].indexOf(it.fit) >= 0 ? it.fit : '',
    kenburns: !!it.kenburns,
    caption: kind === 'media' || kind === 'collage' ? text_(it.caption, 200) : '',
    schedule: netejaHorari_(it.schedule)
  };
  if (kind === 'collage') {
    r.photos = [].concat(it.photos || []).filter(function (id, i, a) {
      const m = troba_(bd.media, id);
      return m && m.kind === 'image' && a.indexOf(id) === i;
    }).slice(0, 6);
    if (r.photos.length < 2) throw errUsuari_('Un collage necessita almenys 2 fotos.', 'ITEM');
    r.layout = text_(it.layout, 10);
    r.label = text_(it.label, 40);
  }
  if (kind === 'media') {
    if (!troba_(bd.media, it.mediaId)) throw errUsuari_('Un dels fitxers de la llista ja no existeix a la biblioteca.', 'ITEM');
    r.mediaId = it.mediaId;
  }
  if (kind === 'web' || kind === 'youtube') {
    r.url = url_(it.url);
    if (!r.url) throw errUsuari_('L\'adreça web no és vàlida (ha de començar per https://).', 'ITEM');
    r.reload = enter_(it.reload, 0, 1440, 0);
    r.zoom = enter_(it.zoom, 25, 300, 100);
  }
  if (kind === 'text' || kind === 'clock' || kind === 'countdown') {
    const t = it.text || {};
    r.text = {
      template: ['granat', 'paper', 'foto', 'esdeveniment'].indexOf(t.template) >= 0 ? t.template : 'granat',
      label: text_(t.label, 40), place: text_(t.place, 120),
      title: text_(t.title, 200), body: text_(t.body, 1500), footer: text_(t.footer, 200),
      bg: color_(t.bg, '#c8102e'), bg2: color_(t.bg2, ''), fg: color_(t.fg, '#ffffff'),
      bgMediaId: troba_(bd.media, t.bgMediaId) ? t.bgMediaId : '',
      align: ['left', 'center'].indexOf(t.align) >= 0 ? t.align : 'center',
      size: enter_(t.size, 50, 200, 100),
      date: RE_DATA.test(t.date || '') ? t.date : '',
      time: RE_HORA.test(t.time || '') ? t.time : ''
    };
    if (kind === 'countdown' && !r.text.date) throw errUsuari_('El compte enrere necessita una data.', 'ITEM');
  }
  return r;
}

/* ======================================================================
 *  LLISTES DE REPRODUCCIÓ
 * ==================================================================== */
function accioDesaLlista_(req, u) {
  const e = req.playlist || {};
  let res;
  modifica_(function (bd) {
    let l = e.id ? troba_(bd.playlists, e.id) : null;
    if (e.id && !l) throw errUsuari_('Aquesta llista ja no existeix (potser l\'ha esborrat algú altre).', 'NO_EXISTEIX');
    if (l && e.v !== undefined && (l.v || 0) !== e.v) {
      throw errUsuari_('Algú altre acaba de modificar aquesta llista. S\'ha recarregat la versió nova: torna a fer el canvi.', 'CONFLICTE');
    }
    const nou = !l;
    if (nou) { l = { id: nouId_('l'), items: [], v: 0, created: new Date().toISOString() }; bd.playlists.push(l); }
    l.name = text_(e.name, 80) || 'Llista sense nom';
    l.color = color_(e.color, '#821E34');
    l.on = e.on !== false;
    l.schedule = netejaHorari_(e.schedule);
    l.items = [].concat(e.items || []).slice(0, 500).map(function (it) { return netejaItem_(it, bd); });
    l.v = (l.v || 0) + 1;
    l.updated = new Date().toISOString();
    l.updatedBy = u.email;
    if (e.screens) {
      const volgudes = [].concat(e.screens);
      bd.screens.forEach(function (p) {
        const te = p.playlists.indexOf(l.id) >= 0;
        const vol = volgudes.indexOf(p.id) >= 0;
        if (vol && !te) p.playlists.push(l.id);
        if (!vol && te) p.playlists = p.playlists.filter(function (x) { return x !== l.id; });
      });
    }
    registra_(bd, u.email, (nou ? 'Ha creat' : 'Ha modificat') + ' la llista «' + l.name + '»');
    res = l;
  });
  return { playlist: res };
}

function accioEsborraLlista_(req, u) {
  modifica_(function (bd) {
    const l = troba_(bd.playlists, req.id);
    if (!l) return;
    bd.playlists = bd.playlists.filter(function (x) { return x.id !== req.id; });
    bd.screens.forEach(function (p) { p.playlists = p.playlists.filter(function (x) { return x !== req.id; }); });
    if (bd.settings.bustiaPlaylistId === req.id) bd.settings.bustiaPlaylistId = '';
    registra_(bd, u.email, 'Ha esborrat la llista «' + l.name + '»');
  });
  return {};
}

/* ======================================================================
 *  PANTALLES
 * ==================================================================== */
function accioDesaPantalla_(req, u) {
  const e = req.screen || {};
  let res;
  modifica_(function (bd) {
    const p = troba_(bd.screens, e.id);
    if (!p) throw errUsuari_('Pantalla desconeguda.', 'NO_EXISTEIX');
    p.name = text_(e.name, 80) || p.name;
    p.location = text_(e.location, 120);
    p.playlists = [].concat(e.playlists || []).filter(function (id, i, a) { return troba_(bd.playlists, id) && a.indexOf(id) === i; });
    p.orientation = [0, 90, 180, 270].indexOf(parseInt(e.orientation, 10)) >= 0 ? parseInt(e.orientation, 10) : 0;
    p.fit = ['cover', 'contain'].indexOf(e.fit) >= 0 ? e.fit : 'cover';
    p.transition = TRANSICIONS.indexOf(e.transition) >= 0 ? e.transition : '';
    p.duration = enter_(e.duration, 0, 600, 0);
    const o = e.overlays || {};
    p.overlays = { clock: !!o.clock, logo: !!o.logo, ticker: o.ticker !== false, progress: !!o.progress };
    p.sound = !!e.sound;
    const h = e.hours || {};
    p.hours = {
      on: !!h.on, from: RE_HORA.test(h.from || '') ? h.from : '07:30', to: RE_HORA.test(h.to || '') ? h.to : '19:30',
      days: h.days ? dies_(h.days) : [1, 2, 3, 4, 5]
    };
    registra_(bd, u.email, 'Ha modificat la pantalla «' + p.name + '»');
    res = senseSecrets_(p);
  });
  return { screen: res };
}

function accioEsborraPantalla_(req, u) {
  modifica_(function (bd) {
    const p = troba_(bd.screens, req.id);
    if (!p) return;
    bd.screens = bd.screens.filter(function (x) { return x.id !== req.id; });
    bd.alerts.forEach(function (a) { if (Array.isArray(a.screens)) a.screens = a.screens.filter(function (x) { return x !== req.id; }); });
    registra_(bd, u.email, 'Ha esborrat la pantalla «' + p.name + '»');
  });
  prop_('vist_' + req.id, null);
  return {};
}

function accioOrdrePantalla_(req, u) {
  const tipus = ['reload', 'identify', 'clearcache'].indexOf(req.type) >= 0 ? req.type : null;
  if (!tipus) throw errUsuari_('Ordre desconeguda.', 'ORDRE');
  modifica_(function (bd) {
    const ids = req.id === 'all' ? bd.screens.map(function (p) { return p.id; }) : [req.id];
    ids.forEach(function (id) {
      const p = troba_(bd.screens, id);
      if (p) p.command = { id: nouId_('c'), type: tipus, at: new Date().toISOString() };
    });
    registra_(bd, u.email, 'Ha enviat l\'ordre «' + tipus + '» a ' + (req.id === 'all' ? 'totes les pantalles' : 'una pantalla'));
  });
  return {};
}

/* ======================================================================
 *  BIBLIOTECA
 * ==================================================================== */
function accioDesaMitja_(req, u) {
  modifica_(function (bd) {
    const m = troba_(bd.media, req.id);
    if (!m) throw errUsuari_('Aquest fitxer ja no existeix.', 'NO_EXISTEIX');
    if (req.name !== undefined) m.name = text_(req.name, 200) || m.name;
    if (req.group !== undefined) m.group = text_(req.group, 80);
  });
  return {};
}

/* ======================================================================
 *  AVISOS I CINTA DE NOTÍCIES
 * ==================================================================== */
function accioDesaAvis_(req, u) {
  const e = req.alert || {};
  let res;
  modifica_(function (bd) {
    let a = e.id ? troba_(bd.alerts, e.id) : null;
    const nou = !a;
    if (nou) { a = { id: nouId_('a'), at: new Date().toISOString(), by: u.email }; bd.alerts.push(a); }
    a.title = text_(e.title, 160);
    a.text = text_(e.text, 1000);
    if (!a.title && !a.text) throw errUsuari_('L\'avís necessita un títol o un text.', 'AVIS');
    a.mode = e.mode === 'banner' ? 'banner' : 'full';
    a.color = color_(e.color, '#821E34');
    a.tema = ['urgent', 'info', 'neutre'].indexOf(e.tema) >= 0 ? e.tema : 'urgent';
    a.label = text_(e.label, 40);
    a.screens = e.screens === 'all' || !e.screens ? 'all' : [].concat(e.screens).filter(function (id) { return troba_(bd.screens, id); });
    a.until = e.until && !isNaN(Date.parse(e.until)) ? new Date(e.until).toISOString() : null;
    a.on = e.on !== false;
    registra_(bd, u.email, (nou ? 'Ha publicat' : 'Ha modificat') + ' l\'avís «' + (a.title || a.text).substr(0, 60) + '»' + (a.on ? '' : ' (aturat)'));
    // Els avisos caducats de fa més de 30 dies s'esborren sols.
    const limit = Date.now() - 30 * 864e5;
    bd.alerts = bd.alerts.filter(function (x) { return !x.until || Date.parse(x.until) > limit; });
    res = a;
  });
  return { alert: res };
}

function accioEsborraAvis_(req, u) {
  modifica_(function (bd) {
    const a = troba_(bd.alerts, req.id);
    if (!a) return;
    bd.alerts = bd.alerts.filter(function (x) { return x.id !== req.id; });
    registra_(bd, u.email, 'Ha esborrat l\'avís «' + (a.title || a.text).substr(0, 60) + '»');
  });
  return {};
}

function accioDesaCinta_(req, u) {
  modifica_(function (bd) {
    bd.ticker = [].concat(req.ticker || []).slice(0, 50).map(function (t) {
      return {
        id: /^[a-z0-9]{4,20}$/i.test(t.id || '') ? t.id : nouId_('t'),
        text: text_(t.text, 300), on: t.on !== false,
        screens: t.screens === 'all' || !t.screens ? 'all' : [].concat(t.screens).filter(function (id) { return troba_(bd.screens, id); })
      };
    }).filter(function (t) { return t.text; });
    registra_(bd, u.email, 'Ha modificat la cinta de missatges');
  });
  return {};
}

/* ======================================================================
 *  AJUSTOS I USUARIS (només administradors)
 * ==================================================================== */
function accioDesaAjustos_(req, u) {
  const e = req.settings || {};
  modifica_(function (bd) {
    const s = bd.settings;
    s.schoolName = text_(e.schoolName, 120) || s.schoolName;
    s.accent = color_(e.accent, s.accent);
    s.logoMediaId = troba_(bd.media, e.logoMediaId) ? e.logoMediaId : '';
    s.logoNegMediaId = troba_(bd.media, e.logoNegMediaId) ? e.logoNegMediaId : '';
    s.defaultDuration = enter_(e.defaultDuration, 2, 600, 10);
    s.defaultTransition = TRANSICIONS.indexOf(e.defaultTransition) >= 0 && e.defaultTransition ? e.defaultTransition : 'fade';
    s.bustiaPlaylistId = troba_(bd.playlists, e.bustiaPlaylistId) ? e.bustiaPlaylistId : '';
    s.tickerSpeed = enter_(e.tickerSpeed, 20, 400, 90);
    registra_(bd, u.email, 'Ha canviat els ajustos generals');
  });
  return {};
}

function accioDesaUsuaris_(req, u) {
  modifica_(function (bd) {
    const vistos = {};
    const llista = [].concat(req.users || []).map(function (x) {
      return { email: normalitzaCorreu_(x.email), name: text_(x.name, 80), role: x.role === 'admin' ? 'admin' : 'editor' };
    }).filter(function (x) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email) || vistos[x.email]) return false;
      vistos[x.email] = true; return true;
    });
    const jo = llista.filter(function (x) { return x.email === u.email; })[0];
    if (!jo || jo.role !== 'admin') throw errUsuari_('No et pots treure a tu mateix el permís d\'administrador.', 'USUARIS');
    bd.users = llista;
    registra_(bd, u.email, 'Ha modificat la llista de persones amb accés (' + llista.length + ')');
  });
  return {};
}
