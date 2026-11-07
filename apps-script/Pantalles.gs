/**
 * PANTALLES · Pantalles (reproductors)
 * ------------------------------------------------------------------
 * Una pantalla és qualsevol aparell amb navegador (Smart TV, miniPC,
 * Chromecast amb Google TV, ordinador vell, tauleta…) que obre l'adreça
 * del reproductor. La primera vegada mostra un codi de 6 xifres; algú
 * del panell escriu aquest codi i la pantalla queda vinculada per sempre.
 *
 * Cada mig minut la pantalla «truca» (sync): diu que està viva, què
 * està mostrant, i rep la configuració nova si n'hi ha.
 */

const MINUTS_CODI_VINCULACIO = 30;

function pantallaPerToken_(bd, token) {
  if (!token) return null;
  for (let i = 0; i < bd.screens.length; i++) if (bd.screens[i].token === token) return bd.screens[i];
  return null;
}

/* ---------- Vinculació ---------- */
function accioIniciaVinculacio_(req) {
  const cau = CacheService.getScriptCache();
  let codi = '';
  for (let i = 0; i < 20; i++) {
    codi = String(Math.floor(100000 + Math.random() * 900000));
    if (!cau.get('vin_' + codi)) break;
  }
  const secret = tokenAleatori_();
  cau.put('vin_' + codi, JSON.stringify({ secret: secret, info: netejaEstat_(req.info || {}), t: Date.now() }), MINUTS_CODI_VINCULACIO * 60);
  return { code: codi, secret: secret, expiresIn: MINUTS_CODI_VINCULACIO * 60 };
}

function accioComprovaVinculacio_(req) {
  const cau = CacheService.getScriptCache();
  const raw = cau.get('vin_' + req.code);
  if (!raw) return { status: 'expired' };
  const v = JSON.parse(raw);
  if (v.secret !== req.secret) return { status: 'expired' };
  if (v.token) { cau.remove('vin_' + req.code); return { status: 'ok', token: v.token }; }
  return { status: 'waiting' };
}

function novaPantalla_(nom, ubicacio) {
  return {
    id: nouId_('p'), name: text_(nom, 80) || 'Pantalla', location: text_(ubicacio, 120),
    token: tokenAleatori_(), playlists: [], orientation: 0, fit: 'cover', transition: '', duration: 0,
    overlays: { clock: false, logo: false, ticker: true, progress: false },
    sound: false, hours: { on: false, from: '07:30', to: '19:30', days: [1, 2, 3, 4, 5] },
    command: null, created: new Date().toISOString()
  };
}

function accioVinculaPantalla_(req, u) {
  const codi = String(req.code || '').replace(/\D/g, '');
  const cau = CacheService.getScriptCache();
  const raw = cau.get('vin_' + codi);
  if (!raw) throw errUsuari_('Aquest codi no existeix o ha caducat. Mira el codi que surt ara mateix a la pantalla.', 'CODI');
  const v = JSON.parse(raw);
  if (v.token) throw errUsuari_('Aquesta pantalla ja s\'ha vinculat.', 'CODI');
  let p;
  modifica_(function (bd) {
    if (req.screenId) {
      // Substituir un aparell: la pantalla existent passa a aquest aparell nou.
      p = troba_(bd.screens, req.screenId);
      if (!p) throw errUsuari_('Pantalla desconeguda.', 'NO_EXISTEIX');
      p.token = tokenAleatori_();
      registra_(bd, u.email, 'Ha canviat l\'aparell de la pantalla «' + p.name + '»');
    } else {
      p = novaPantalla_(req.name, req.location);
      if (req.playlists) p.playlists = [].concat(req.playlists).filter(function (id) { return troba_(bd.playlists, id); });
      bd.screens.push(p);
      registra_(bd, u.email, 'Ha afegit la pantalla «' + p.name + '»');
    }
  });
  v.token = p.token;
  cau.put('vin_' + codi, JSON.stringify(v), 600);
  return { screen: senseSecrets_(p) };
}

/** Camps de configuració que es copien d'una pantalla a una altra (no el nom, la ubicació ni l'aparell). */
function copiaConfigPantalla_(de, a) {
  a.playlists = (de.playlists || []).slice();
  a.orientation = de.orientation || 0;
  a.fit = de.fit || 'cover';
  a.transition = de.transition || '';
  a.duration = de.duration || 0;
  a.overlays = JSON.parse(JSON.stringify(de.overlays || {}));
  a.sound = !!de.sound;
  a.hours = JSON.parse(JSON.stringify(de.hours || { on: false }));
}

/** Duplica una pantalla (nova, pendent de vincular) o copia la seva configuració a altres pantalles. */
function accioDuplicaPantalla_(req, u) {
  let nova = null, copiades = 0;
  modifica_(function (bd) {
    const de = troba_(bd.screens, req.id);
    if (!de) throw errUsuari_('Pantalla desconeguda.', 'NO_EXISTEIX');
    if (req.toIds) {
      [].concat(req.toIds).forEach(function (id) {
        const a = troba_(bd.screens, id);
        if (!a || a.id === de.id) return;
        copiaConfigPantalla_(de, a);
        copiades++;
      });
      // Els avisos i la cinta que anaven a la pantalla original, també a les altres
      registra_(bd, u.email, 'Ha copiat la configuració de «' + de.name + '» a ' + copiades + ' pantalla' + (copiades === 1 ? '' : 'es'));
    } else {
      nova = novaPantalla_(req.name || (de.name + ' (còpia)'), req.location || de.location);
      copiaConfigPantalla_(de, nova);
      bd.screens.push(nova);
      registra_(bd, u.email, 'Ha duplicat la pantalla «' + de.name + '» → «' + nova.name + '»');
    }
    // Avisos dirigits a la pantalla original: també a les noves o copiades
    const destins = nova ? [nova.id] : [].concat(req.toIds || []);
    bd.alerts.forEach(function (al) {
      if (Array.isArray(al.screens) && al.screens.indexOf(de.id) >= 0) destins.forEach(function (d) { if (al.screens.indexOf(d) < 0) al.screens.push(d); });
    });
    bd.ticker.forEach(function (t) {
      if (Array.isArray(t.screens) && t.screens.indexOf(de.id) >= 0) destins.forEach(function (d) { if (t.screens.indexOf(d) < 0) t.screens.push(d); });
    });
  });
  return nova ? { screen: senseSecrets_(nova) } : { copiades: copiades };
}

function accioCreaPantalla_(req, u) {
  let p;
  modifica_(function (bd) {
    p = novaPantalla_(req.name, req.location);
    bd.screens.push(p);
    registra_(bd, u.email, 'Ha afegit la pantalla «' + p.name + '» (amb enllaç)');
  });
  return { screen: senseSecrets_(p), token: p.token };
}

function accioEnllacPantalla_(req, u) {
  const bd = llegeixBd_();
  const p = troba_(bd.screens, req.id);
  if (!p) throw errUsuari_('Pantalla desconeguda.', 'NO_EXISTEIX');
  return { token: p.token };
}

function accioRenovaEnllac_(req, u) {
  let token;
  modifica_(function (bd) {
    const p = troba_(bd.screens, req.id);
    if (!p) throw errUsuari_('Pantalla desconeguda.', 'NO_EXISTEIX');
    p.token = token = tokenAleatori_();
    registra_(bd, u.email, 'Ha renovat l\'enllaç de «' + p.name + '» (l\'aparell antic queda desvinculat)');
  });
  return { token: token };
}

/* ---------- Sincronització des de la pantalla ---------- */
function accioSync_(req) {
  const bd = llegeixBd_();
  const p = pantallaPerToken_(bd, req.token);
  if (!p) throw errUsuari_('Aquesta pantalla s\'ha desvinculat.', 'TOKEN');
  desaEstat_(p.id, req.status || {});
  const res = { serverTime: Date.now(), rev: bd.rev };
  if (String(req.rev) !== String(bd.rev)) res.config = configPantalla_(bd, p);
  if (p.command && p.command.id !== req.lastCommand && Date.now() - Date.parse(p.command.at) < 15 * 60000) res.command = p.command;
  return res;
}

function netejaEstat_(e) {
  return {
    item: text_(e.item, 160), itemId: text_(e.itemId, 40), items: parseInt(e.items, 10) || 0,
    cached: parseInt(e.cached, 10) || 0, missing: parseInt(e.missing, 10) || 0, bytes: parseInt(e.bytes, 10) || 0,
    res: text_(e.res, 30), ua: text_(e.ua, 200), v: text_(e.v, 20), mode: text_(e.mode, 20),
    up: parseInt(e.up, 10) || 0, err: text_(e.err, 200), online: e.online !== false
  };
}

function desaEstat_(id, estat) {
  const e = netejaEstat_(estat);
  e.seen = Date.now();
  CacheService.getScriptCache().put('est_' + id, JSON.stringify(e), 21600);
  // Cada 5 minuts deixem constància permanent de l'última connexió.
  const ultima = parseInt(prop_('vist_' + id) || '0', 10);
  if (e.seen - ultima > 5 * 60000) prop_('vist_' + id, e.seen);
}

function estatsPantalles_(bd) {
  const c = CacheService.getScriptCache();
  const claus = bd.screens.map(function (p) { return 'est_' + p.id; });
  const tots = claus.length ? c.getAll(claus) : {};
  const res = {};
  bd.screens.forEach(function (p) {
    const raw = tots['est_' + p.id];
    if (raw) res[p.id] = JSON.parse(raw);
    else {
      const vist = parseInt(prop_('vist_' + p.id) || '0', 10);
      res[p.id] = vist ? { seen: vist } : null;
    }
  });
  return res;
}

/* ---------- Configuració que rep cada pantalla ---------- */
function configPantalla_(bd, p) {
  const items = [];
  const usats = {};
  (p.playlists || []).forEach(function (idLl) {
    const l = troba_(bd.playlists, idLl);
    if (!l || l.on === false) return;
    l.items.forEach(function (it) {
      if (it.on === false) return;
      if (it.kind === 'media') {
        if (!troba_(bd.media, it.mediaId)) return;
        usats[it.mediaId] = true;
      }
      if (it.text && it.text.bgMediaId) usats[it.text.bgMediaId] = true;
      if (it.kind === 'collage') (it.photos || []).forEach(function (id) { if (troba_(bd.media, id)) usats[id] = true; });
      const c = JSON.parse(JSON.stringify(it));
      c.playlistId = l.id;
      c.playlistSchedule = l.schedule || null;
      items.push(c);
    });
  });
  if (bd.settings.logoMediaId) usats[bd.settings.logoMediaId] = true;
  if (bd.settings.logoNegMediaId) usats[bd.settings.logoNegMediaId] = true;
  const media = {};
  bd.media.forEach(function (m) {
    if (usats[m.id]) media[m.id] = { mime: m.mime, kind: m.kind, size: m.size, w: m.w, h: m.h, duration: m.duration, name: m.name };
  });
  const ara = Date.now();
  const avisos = bd.alerts.filter(function (a) {
    if (a.on === false) return false;
    if (a.until && Date.parse(a.until) < ara) return false;
    return a.screens === 'all' || (a.screens || []).indexOf(p.id) >= 0;
  });
  const s = bd.settings;
  return {
    rev: bd.rev,
    screen: {
      id: p.id, name: p.name, location: p.location, orientation: p.orientation || 0, fit: p.fit || 'cover',
      transition: p.transition || '', duration: p.duration || 0, overlays: p.overlays || {}, sound: !!p.sound, hours: p.hours || { on: false }
    },
    settings: {
      schoolName: s.schoolName, accent: s.accent, logoMediaId: s.logoMediaId, logoNegMediaId: s.logoNegMediaId,
      defaultDuration: s.defaultDuration, defaultTransition: s.defaultTransition, tickerSpeed: s.tickerSpeed
    },
    items: items,
    media: media,
    alerts: avisos,
    ticker: bd.ticker.filter(function (t) { return t.on !== false && (t.screens === 'all' || !t.screens || t.screens.indexOf(p.id) >= 0); })
  };
}

function senseSecrets_(p) {
  const c = JSON.parse(JSON.stringify(p));
  delete c.token;
  return c;
}
