/**
 * PANTALLES · Arxiu fotogràfic
 * ------------------------------------------------------------------
 * Cada curs penja fotos a la seva carpeta «Per penjar» de l'arxiu fotogràfic
 * del Drive. Aquest fitxer:
 *   1. Troba totes les carpetes «Per penjar» (Etapa → Curs → Per penjar).
 *   2. Cada 10 minuts hi busca fotos noves i les deixa «pendents de revisar».
 *   3. Quan algú les publica des del panell, en fa una còpia reduïda (2560 px,
 *      ben girada) a la biblioteca i refà la llista del mes:
 *      «Arxiu fotogràfic · Novembre 2026», amb fotos soles o collages per curs.
 * L'arxiu original no es toca mai.
 */

const ARXIU_ARREL_PER_DEFECTE = '1KkrEu-HGS2cpbuxBXEUYH5n0Sr_ZBhwg';
const ARXIU_MAX_PER_PASSADA = 60;

function cfgArxiu_(bd) {
  if (!bd.arxiu) bd.arxiu = {};
  const a = bd.arxiu;
  if (a.on === undefined) a.on = false;
  if (!a.folderId) a.folderId = ARXIU_ARREL_PER_DEFECTE;
  if (!a.screens) a.screens = 'all';
  if (!a.pendents) a.pendents = [];
  if (!a.vistos) a.vistos = {};
  if (!a.aprovades) a.aprovades = [];
  return a;
}

/* ---------- Drive (API REST) ---------- */
function driveLlista_(q, camps) {
  const res = [];
  let pagina = '';
  for (let i = 0; i < 20; i++) {
    const url = 'https://www.googleapis.com/drive/v3/files?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' +
      '&q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('nextPageToken,files(' + camps + ')') + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
    const r = UrlFetchApp.fetch(url, { headers: capcaleresDrive_(), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw errUsuari_('No s\'ha pogut llegir l\'arxiu del Drive (' + r.getResponseCode() + ').', 'DRIVE');
    const d = JSON.parse(r.getContentText());
    (d.files || []).forEach(function (f) { res.push(f); });
    if (!d.nextPageToken) break;
    pagina = d.nextPageToken;
  }
  return res;
}

/** Carpetes «Per penjar» de l'arxiu: [{ id, curs, etapa }]. Es guarden 6 hores. */
function carpetesPerPenjar_(arrelId, forcar) {
  const clau = 'arxiu_carpetes_' + arrelId;
  if (!forcar) {
    const desat = CacheService.getScriptCache().get(clau);
    if (desat) return JSON.parse(desat);
  }
  const trobades = [];
  // Recorregut per nivells (com a molt 4 nivells per sota de l'arrel)
  let nivell = [{ id: arrelId, nom: '', pare: '' }];
  for (let prof = 0; prof < 4 && nivell.length; prof++) {
    const seguent = [];
    for (let i = 0; i < nivell.length; i += 40) {
      const tros = nivell.slice(i, i + 40);
      const q = '(' + tros.map(function (c) { return "'" + c.id + "' in parents"; }).join(' or ') + ") and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
      driveLlista_(q, 'id,name,parents').forEach(function (f) {
        const pare = tros.filter(function (c) { return (f.parents || []).indexOf(c.id) >= 0; })[0] || {};
        if (/per\s*penjar/i.test(f.name)) trobades.push({ id: f.id, curs: pare.nom || 'Arxiu', etapa: pare.pare || '' });
        else seguent.push({ id: f.id, nom: f.name, pare: pare.nom || '' });
      });
    }
    nivell = seguent;
  }
  trobades.sort(function (a, b) { return (a.etapa + a.curs).localeCompare(b.etapa + b.curs, 'ca'); });
  CacheService.getScriptCache().put(clau, JSON.stringify(trobades), 21600);
  return trobades;
}

function miniaturaDrive_(enllac, mida) {
  if (!enllac) return '';
  try {
    const t = UrlFetchApp.fetch(enllac.replace(/=s\d+(-c)?$/, '') + '=s' + mida, { headers: capcaleresDrive_(), muteHttpExceptions: true });
    if (t.getResponseCode() === 200) return 'data:image/jpeg;base64,' + Utilities.base64Encode(t.getContent());
  } catch (e) { /* sense miniatura */ }
  return '';
}

/* ---------- Comprovar si hi ha fotos noves ---------- */
function escanejaArxiu_(forcar) {
  const bd = llegeixBd_();
  const cfg = cfgArxiu_(bd);
  if (!cfg.on) return { nous: 0, carpetes: 0 };
  const carpetes = carpetesPerPenjar_(cfg.folderId, forcar);
  const pendents = {};
  cfg.pendents.forEach(function (p) { pendents[p.id] = true; });
  const nous = [];
  for (let i = 0; i < carpetes.length && nous.length < ARXIU_MAX_PER_PASSADA; i += 30) {
    const tros = carpetes.slice(i, i + 30);
    const q = '(' + tros.map(function (c) { return "'" + c.id + "' in parents"; }).join(' or ') + ") and mimeType contains 'image/' and trashed = false";
    driveLlista_(q, 'id,name,mimeType,createdTime,size,parents,thumbnailLink,imageMediaMetadata(width,height,rotation)').forEach(function (f) {
      if (nous.length >= ARXIU_MAX_PER_PASSADA || cfg.vistos[f.id] || pendents[f.id]) return;
      if (cfg.since && f.createdTime < cfg.since) return;
      const c = tros.filter(function (x) { return (f.parents || []).indexOf(x.id) >= 0; })[0] || {};
      const im = f.imageMediaMetadata || {};
      const gira = im.rotation === 1 || im.rotation === 3;
      nous.push({
        id: f.id, name: f.name, curs: c.curs || '', etapa: c.etapa || '', at: f.createdTime, size: parseInt(f.size, 10) || 0,
        w: gira ? im.height : im.width, h: gira ? im.width : im.height, thumb: f.thumbnailLink || ''
      });
    });
  }
  // Miniatures per revisar-les al panell
  const minis = {};
  nous.forEach(function (n) { const m = miniaturaDrive_(n.thumb, 320); if (m && m.length < 60000) minis['ax_' + n.id] = m; delete n.thumb; });
  // L'hora de l'última comprovació va a les propietats: així no es reescriuen les dades cada 10 minuts
  prop_('arxiu_darrera', new Date().toISOString());
  prop_('arxiu_carpetes', carpetes.length);
  if (nous.length || cfg.error) {
    modifica_(function (b) {
      const c = cfgArxiu_(b);
      const ja = {};
      c.pendents.forEach(function (p) { ja[p.id] = true; });
      nous.forEach(function (n) { if (!ja[n.id] && !c.vistos[n.id]) c.pendents.push(n); });
      c.error = '';
      if (nous.length) registra_(b, 'arxiu fotogràfic', nous.length + ' foto' + (nous.length > 1 ? 's' : '') + ' nova' + (nous.length > 1 ? 'es' : '') + ' per revisar');
    });
  }
  if (Object.keys(minis).length) modificaMiniatures_(function (m) { Object.keys(minis).forEach(function (k) { m[k] = minis[k]; }); });
  return { nous: nous.length, carpetes: carpetes.length };
}

/** S'executa sol cada 10 minuts (amb la revisió de la bústia). */
function revisaArxiu() {
  try { escanejaArxiu_(false); }
  catch (e) {
    const msg = String(e.userMsg || e.message || e).substr(0, 200);
    try {
      if (cfgArxiu_(llegeixBd_()).error !== msg) modifica_(function (b) { cfgArxiu_(b).error = msg; });
    } catch (e2) { /* res */ }
  }
}

/* ---------- Publicar ---------- */
const MESOS_ARXIU = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

function mesActual_() { return Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd').substr(0, 7); }

/** Còpia reduïda (2560 px, ben girada) d'una foto de l'arxiu a la biblioteca. */
function copiaFotoArxiu_(p, qui) {
  let blob = null, w = p.w || 0, h = p.h || 0;
  const info = UrlFetchApp.fetch(API_DRIVE + p.id + '?supportsAllDrives=true&fields=thumbnailLink,imageMediaMetadata(width,height,rotation)', { headers: capcaleresDrive_(), muteHttpExceptions: true });
  if (info.getResponseCode() === 404) return null; // l'han esborrat de l'arxiu
  if (info.getResponseCode() === 200) {
    const d = JSON.parse(info.getContentText());
    if (d.thumbnailLink) {
      const r = UrlFetchApp.fetch(d.thumbnailLink.replace(/=s\d+(-c)?$/, '') + '=s2560', { headers: capcaleresDrive_(), muteHttpExceptions: true });
      if (r.getResponseCode() === 200) blob = r.getBlob();
    }
    const im = d.imageMediaMetadata || {};
    const gira = im.rotation === 1 || im.rotation === 3;
    if (im.width) { w = gira ? im.height : im.width; h = gira ? im.width : im.height; }
  }
  if (!blob) {
    // Sense miniatura gran: fem servir l'original (si no és massa gran)
    if (p.size > 20 * 1024 * 1024) return null;
    const r = UrlFetchApp.fetch(API_DRIVE + p.id + '?alt=media&supportsAllDrives=true', { headers: capcaleresDrive_(), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    blob = r.getBlob();
  } else if (w && h) {
    const k = Math.min(1, 2560 / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
  }
  const nom = (p.curs ? p.curs + ' · ' : '') + p.name.replace(/\.[^.]+$/, '') + '.jpg';
  blob.setName(nom);
  const f = DriveApp.getFolderById(idCarpeta_('mitjans')).createFile(blob);
  return {
    id: nouId_('m'), driveId: f.getId(), name: nom, mime: blob.getContentType() || 'image/jpeg', kind: 'image',
    size: f.getSize(), w: w, h: h, duration: 0, by: qui, at: new Date().toISOString(), group: 'Arxiu fotogràfic'
  };
}

function accioArxiuPublica_(req, u) {
  const ids = [].concat(req.ids || []).slice(0, 8);
  const bd = llegeixBd_();
  const cfg = cfgArxiu_(bd);
  const fets = [];
  ids.forEach(function (id) {
    const p = cfg.pendents.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    let m = null;
    try { m = copiaFotoArxiu_(p, u.email); } catch (e) { m = null; }
    fets.push({ id: id, media: m, p: p });
  });
  const mes = mesActual_();
  modifica_(function (b) {
    const c = cfgArxiu_(b);
    fets.forEach(function (f) {
      c.pendents = c.pendents.filter(function (x) { return x.id !== f.id; });
      c.vistos[f.id] = f.media ? 'publicada' : 'error';
      if (!f.media) return;
      b.media.push(f.media);
      c.aprovades.push({ mediaId: f.media.id, curs: f.p.curs, etapa: f.p.etapa, mes: mes, at: f.media.at });
    });
    const bons = fets.filter(function (f) { return f.media; }).length;
    if (bons) {
      reconstrueixLlistaArxiu_(b, mes);
      registra_(b, u.email, 'Ha publicat ' + bons + ' foto' + (bons > 1 ? 's' : '') + ' de l\'arxiu fotogràfic');
    }
  });
  modificaMiniatures_(function (mini) {
    fets.forEach(function (f) {
      if (f.media && mini['ax_' + f.id]) mini[f.media.id] = mini['ax_' + f.id];
      delete mini['ax_' + f.id];
    });
  });
  return { publicades: fets.filter(function (f) { return f.media; }).length, errors: fets.filter(function (f) { return !f.media; }).length };
}

function accioArxiuDescarta_(req, u) {
  const ids = [].concat(req.ids || []);
  modifica_(function (b) {
    const c = cfgArxiu_(b);
    c.pendents = c.pendents.filter(function (x) { return ids.indexOf(x.id) < 0; });
    ids.forEach(function (id) { c.vistos[id] = 'descartada'; });
    registra_(b, u.email, 'Ha descartat ' + ids.length + ' foto' + (ids.length > 1 ? 's' : '') + ' de l\'arxiu fotogràfic');
  });
  modificaMiniatures_(function (mini) { ids.forEach(function (id) { delete mini['ax_' + id]; }); });
  return {};
}

function accioArxiuEscaneja_(req, u) {
  try { return escanejaArxiu_(true); }
  catch (e) {
    modifica_(function (b) { cfgArxiu_(b).error = String(e.userMsg || e.message || e).substr(0, 200); });
    throw e;
  }
}

function accioArxiuConfig_(req, u) {
  const e = req.arxiu || {};
  modifica_(function (b) {
    const c = cfgArxiu_(b);
    const abans = c.on;
    if (e.folderId) {
      const m = /[-\w]{25,}/.exec(String(e.folderId));
      if (m) c.folderId = m[0];
    }
    c.screens = e.screens === 'all' || !e.screens ? 'all' : [].concat(e.screens).filter(function (id) { return troba_(b.screens, id); });
    c.on = !!e.on;
    if (c.on && !abans) c.since = e.nomesNoves ? new Date().toISOString() : '';
    registra_(b, u.email, c.on ? (abans ? 'Ha canviat la configuració de l\'arxiu fotogràfic' : 'Ha activat l\'arxiu fotogràfic') : 'Ha aturat l\'arxiu fotogràfic');
  });
  return {};
}

/* ---------- La llista del mes ---------- */
/** Refà la llista «Arxiu fotogràfic · <mes>»: fotos soles o collages per curs, alternant cursos. */
function reconstrueixLlistaArxiu_(bd, mes) {
  const c = cfgArxiu_(bd);
  const p = mes.split('-');
  const nomMes = MESOS_ARXIU[parseInt(p[1], 10) - 1];
  const darrerDia = new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate();
  let l = bd.playlists.filter(function (x) { return x.arxiuMes === mes; })[0];
  if (!l) {
    l = {
      id: nouId_('l'), name: 'Arxiu fotogràfic · ' + nomMes.charAt(0).toUpperCase() + nomMes.slice(1) + ' ' + p[0], color: '#821E34', on: true,
      items: [], v: 0, arxiuMes: mes, created: new Date().toISOString(),
      schedule: { from: mes + '-01', to: mes + '-' + (darrerDia < 10 ? '0' : '') + darrerDia, days: [], tFrom: '', tTo: '' }
    };
    bd.playlists.push(l);
    bd.screens.forEach(function (s) {
      if ((c.screens === 'all' || c.screens.indexOf(s.id) >= 0) && s.playlists.indexOf(l.id) < 0) s.playlists.push(l.id);
    });
  }
  // Fotos del mes que encara existeixen, agrupades per curs (en ordre d'arribada)
  const perCurs = {}, ordre = [];
  c.aprovades.filter(function (a) { return a.mes === mes && troba_(bd.media, a.mediaId); }).forEach(function (a) {
    const k = a.curs || 'Arxiu';
    if (!perCurs[k]) { perCurs[k] = []; ordre.push(k); }
    perCurs[k].push(a.mediaId);
  });
  // Barreja automàtica: 1-2 fotos → soles; 3 o més → collages de 3-4
  const cues = ordre.map(function (curs) {
    const fotos = perCurs[curs], items = [];
    if (fotos.length <= 2) {
      fotos.forEach(function (id) { items.push({ id: nouId_('i'), kind: 'media', mediaId: id, on: true, duration: null, schedule: null, caption: curs }); });
    } else {
      const grups = Math.ceil(fotos.length / 4), mida = Math.ceil(fotos.length / grups);
      for (let i = 0; i < fotos.length; i += mida) {
        const g = fotos.slice(i, i + mida);
        if (g.length === 1) items.push({ id: nouId_('i'), kind: 'media', mediaId: g[0], on: true, duration: null, schedule: null, caption: curs });
        else items.push({ id: nouId_('i'), kind: 'collage', photos: g, layout: '', caption: curs, label: '', on: true, duration: null, schedule: null });
      }
    }
    return items;
  });
  // Alternem els cursos perquè no surtin tots seguits
  const items = [];
  for (let r = 0; cues.some(function (q) { return q.length > r; }); r++) cues.forEach(function (q) { if (q[r]) items.push(q[r]); });
  l.items = items;
  l.v = (l.v || 0) + 1;
  l.updated = new Date().toISOString();
  return l;
}
