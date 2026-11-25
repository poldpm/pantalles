/**
 * PANTALLES · Fitxers (fotos i vídeos)
 * ------------------------------------------------------------------
 * - Pujada per trossos (fitxers grans, des del mòbil o l'ordinador).
 * - Descàrrega per trossos cap a les pantalles, que els guarden i ja no
 *   depenen de la xarxa per continuar mostrant-los.
 * - Els fitxers són PRIVATS al Drive: les pantalles els reben a través
 *   d'aquest servei amb la seva clau, mai amb un enllaç públic.
 */

const MIDA_TROS = 2 * 1024 * 1024; // 2 MB (múltiple de 256 KB, ho demana el Drive)
const API_DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const API_PUJADA = 'https://www.googleapis.com/upload/drive/v3/files';

function capcaleresDrive_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

function tipusMitja_(mime) {
  if (/^image\//.test(mime)) return 'image';
  if (/^video\//.test(mime)) return 'video';
  return null;
}

/* ---------- Pujada ---------- */
function accioIniciaPujada_(req, u) {
  const mime = text_(req.mime, 100);
  const kind = tipusMitja_(mime);
  if (!kind) throw errUsuari_('Només es poden pujar imatges i vídeos (els PDF es converteixen en imatges automàticament).', 'TIPUS');
  const mida = parseInt(req.size, 10);
  if (!(mida > 0)) throw errUsuari_('Fitxer buit.', 'MIDA');
  if (mida > 1024 * 1024 * 1024) throw errUsuari_('El fitxer és massa gran (màxim 1 GB).', 'MIDA');
  const nom = text_(req.name, 200) || 'fitxer';
  const resp = UrlFetchApp.fetch(API_PUJADA + '?uploadType=resumable&fields=id,name,mimeType,size', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: Object.assign(capcaleresDrive_(), { 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(mida) }),
    payload: JSON.stringify({ name: nom, parents: [idCarpeta_('mitjans')] }),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw errUsuari_('El Drive no ha acceptat la pujada (' + resp.getResponseCode() + ').', 'DRIVE');
  const capc = resp.getHeaders();
  const url = capc.Location || capc.location;
  const id = nouId_('up');
  CacheService.getScriptCache().put('up_' + id, JSON.stringify({
    url: url, name: nom, mime: mime, kind: kind, size: mida, by: u.email,
    w: parseInt(req.w, 10) || 0, h: parseInt(req.h, 10) || 0, duration: parseFloat(req.duration) || 0,
    thumb: String(req.thumb || '').substr(0, 60000),
    playlistId: text_(req.playlistId, 40), group: text_(req.group, 80)
  }), 21600);
  return { uploadId: id, chunkSize: MIDA_TROS };
}

function accioTrosPujada_(req, u) {
  const cau = CacheService.getScriptCache();
  const raw = cau.get('up_' + req.uploadId);
  if (!raw) throw errUsuari_('La pujada ha caducat. Torna-ho a provar.', 'PUJADA');
  const p = JSON.parse(raw);
  const bytes = Utilities.base64Decode(req.data);
  const inici = parseInt(req.offset, 10);
  const fi = inici + bytes.length - 1;
  const resp = UrlFetchApp.fetch(p.url, {
    method: 'put',
    contentType: p.mime,
    headers: { 'Content-Range': 'bytes ' + inici + '-' + fi + '/' + p.size },
    payload: bytes,
    muteHttpExceptions: true
  });
  const codi = resp.getResponseCode();
  if (codi === 308) return { done: false, received: fi + 1 };
  if (codi !== 200 && codi !== 201) throw errUsuari_('Error pujant al Drive (' + codi + ').', 'DRIVE');
  const fitxer = JSON.parse(resp.getContentText());
  cau.remove('up_' + req.uploadId);
  const media = registraMitja_({
    driveId: fitxer.id, name: p.name, mime: p.mime, kind: p.kind, size: p.size,
    w: p.w, h: p.h, duration: p.duration, by: u.email, group: p.group
  }, p.thumb, p.playlistId, u.email);
  return { done: true, media: media };
}

/** Desa el fitxer a la biblioteca i, si cal, l'afegeix al final d'una llista. */
function registraMitja_(m, miniatura, idLlista, qui) {
  m.id = nouId_('m');
  m.at = new Date().toISOString();
  let afegit = false;
  modifica_(function (bd) {
    bd.media.push(m);
    if (idLlista) {
      const l = troba_(bd.playlists, idLlista);
      if (l) {
        l.items.push({ id: nouId_('i'), kind: 'media', mediaId: m.id, on: true, duration: null, schedule: null });
        l.v = (l.v || 0) + 1;
        afegit = true;
      }
    }
    registra_(bd, qui, 'Ha pujat «' + m.name + '»' + (afegit ? ' i l\'ha afegit a una llista' : ''));
  });
  if (miniatura) modificaMiniatures_(function (mini) { mini[m.id] = miniatura; });
  return m;
}

/* ---------- Descàrrega per trossos ---------- */
function accioTros_(req) {
  const bd = llegeixBd_();
  // Hi poden accedir les pantalles (amb la seva clau) o el panell (vista prèvia).
  if (req.token) { if (!pantallaPerToken_(bd, req.token)) throw errUsuari_('Pantalla desconeguda.', 'TOKEN'); }
  else usuariSessio_(req, bd);
  const m = troba_(bd.media, req.mediaId);
  if (!m) throw errUsuari_('Aquest fitxer ja no existeix.', 'NO_EXISTEIX');
  const inici = parseInt(req.offset, 10) || 0;
  const fi = Math.min(inici + MIDA_TROS, m.size) - 1;
  const resp = UrlFetchApp.fetch(API_DRIVE + m.driveId + '?alt=media', {
    headers: Object.assign(capcaleresDrive_(), { Range: 'bytes=' + inici + '-' + fi }),
    muteHttpExceptions: true
  });
  const codi = resp.getResponseCode();
  if (codi !== 200 && codi !== 206) throw errUsuari_('No s\'ha pogut llegir el fitxer del Drive (' + codi + ').', 'DRIVE');
  const bytes = resp.getContent();
  return { data: Utilities.base64Encode(bytes), offset: inici, size: m.size, mime: m.mime };
}

/* ---------- Bústia del Drive ---------- */
/** Fitxers que algú ha deixat a la carpeta «Bústia» del Drive. */
function fitxersBustia_() {
  const carpeta = DriveApp.getFolderById(idCarpeta_('bustia'));
  const it = carpeta.getFiles();
  const llista = [];
  while (it.hasNext() && llista.length < 200) {
    const f = it.next();
    llista.push({ id: f.getId(), name: f.getName(), mime: f.getMimeType(), size: f.getSize(), kind: tipusMitja_(f.getMimeType()) });
  }
  return llista;
}

function accioLlistaBustia_() {
  return { files: fitxersBustia_(), folderUrl: 'https://drive.google.com/drive/folders/' + idCarpeta_('bustia') };
}

/* ---------- Fotos girades ----------
 * Les fotos de mòbil sovint es desen «de costat» amb una marca (EXIF) que diu com s'han de girar.
 * Els navegadors de les teles antigues no la tenen en compte i les mostren girades. El Drive ja les
 * sap girar: en fem una còpia (2560 px com a màxim) ja dreta. */
function copiaDreta_(idFitxer, nom) {
  const r = UrlFetchApp.fetch(API_DRIVE + idFitxer + '?supportsAllDrives=true&fields=thumbnailLink,imageMediaMetadata(width,height,rotation)', { headers: capcaleresDrive_(), muteHttpExceptions: true });
  const codi = r.getResponseCode();
  if (codi === 404 || codi === 403) return { dreta: true }; // no hi podem fer res
  if (codi !== 200) return null;
  const d = JSON.parse(r.getContentText());
  const im = d.imageMediaMetadata || {};
  if (!im.rotation || !d.thumbnailLink || !im.width) return { dreta: true };
  const t = UrlFetchApp.fetch(d.thumbnailLink.replace(/=s\d+(-c)?$/, '') + '=s2560', { headers: capcaleresDrive_(), muteHttpExceptions: true });
  if (t.getResponseCode() !== 200) return null;
  const blob = t.getBlob();
  blob.setName(String(nom || 'foto').replace(/\.[^.]+$/, '') + '.jpg');
  const f = DriveApp.getFolderById(idCarpeta_('mitjans')).createFile(blob);
  const gira = im.rotation === 1 || im.rotation === 3;
  let w = gira ? im.height : im.width, h = gira ? im.width : im.height;
  const k = Math.min(1, 2560 / Math.max(w, h));
  return { dreta: false, driveId: f.getId(), name: blob.getName(), mime: 'image/jpeg', size: f.getSize(), w: Math.round(w * k), h: Math.round(h * k) };
}

/** Revisa unes quantes fotos de la biblioteca cada vegada (activador de 10 min) i arregla les girades. */
function arreglaFotosGirades_() {
  const bd = llegeixBd_();
  const pendents = bd.media.filter(function (m) { return m.kind === 'image' && !m.dreta && m.driveId; }).slice(0, 15);
  if (!pendents.length) return 0;
  const fets = [];
  pendents.forEach(function (m) {
    try {
      const c = copiaDreta_(m.driveId, m.name);
      if (c) fets.push({ id: m.id, c: c, vell: m.driveId });
    } catch (e) { /* ho tornarem a provar */ }
  });
  if (!fets.length) return 0;
  const canvis = {}; // id vell → id nou (les pantalles guarden els fitxers per id: cal un id nou perquè el tornin a baixar)
  modifica_(function (b) {
    fets.forEach(function (x) {
      const m = troba_(b.media, x.id);
      if (!m) return;
      if (x.c.dreta) { m.dreta = true; return; }
      canvis[m.id] = nouId_('m');
      m.driveId = x.c.driveId; m.mime = x.c.mime; m.size = x.c.size; m.w = x.c.w; m.h = x.c.h; m.dreta = true;
    });
    if (!Object.keys(canvis).length) return;
    let txt = JSON.stringify(b);
    Object.keys(canvis).forEach(function (v) { txt = txt.split('"' + v + '"').join('"' + canvis[v] + '"'); });
    const nou = JSON.parse(txt);
    Object.keys(nou).forEach(function (k) { b[k] = nou[k]; });
    const nousIds = Object.keys(canvis).map(function (v) { return '"' + canvis[v] + '"'; });
    b.playlists.forEach(function (l) {
      const t = JSON.stringify(l);
      if (nousIds.some(function (x) { return t.indexOf(x) >= 0; })) l.v = (l.v || 0) + 1; // el panell ha de recarregar la llista
    });
    registra_(b, 'sistema', 'Ha redreçat ' + Object.keys(canvis).length + ' foto' + (Object.keys(canvis).length > 1 ? 's' : '') + ' que sortien girades');
  });
  if (Object.keys(canvis).length) {
    modificaMiniatures_(function (mini) { Object.keys(canvis).forEach(function (v) { if (mini[v]) { mini[canvis[v]] = mini[v]; delete mini[v]; } }); });
    fets.forEach(function (x) { if (x.c && !x.c.dreta && canvis[x.id]) { try { DriveApp.getFileById(x.vell).setTrashed(true); } catch (e) { /* res */ } } });
  }
  return Object.keys(canvis).length;
}

/** Miniatura petita (240 px, ja ben girada) d'un fitxer del Drive. */
function miniaturaFitxer_(idFitxer) {
  try {
    const r = UrlFetchApp.fetch(API_DRIVE + idFitxer + '?supportsAllDrives=true&fields=thumbnailLink', { headers: capcaleresDrive_(), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return '';
    const l = JSON.parse(r.getContentText()).thumbnailLink;
    if (!l) return '';
    const t = UrlFetchApp.fetch(l.replace(/=s\d+(-c)?$/, '') + '=s240', { headers: capcaleresDrive_(), muteHttpExceptions: true });
    return t.getResponseCode() === 200 ? 'data:image/jpeg;base64,' + Utilities.base64Encode(t.getContent()) : '';
  } catch (e) { return ''; }
}

function importaDeBustia_(idFitxer, idLlista, qui) {
  const f = DriveApp.getFileById(idFitxer);
  const mime = f.getMimeType();
  const kind = tipusMitja_(mime);
  if (!kind) return null;
  if (kind === 'image') {
    // Si la foto ve girada (EXIF), en desem una còpia ja dreta i llencem l'original
    let c = null;
    try { c = copiaDreta_(idFitxer, f.getName()); } catch (e) { c = null; }
    if (c && !c.dreta) {
      const mc = miniaturaFitxer_(idFitxer);
      f.moveTo(DriveApp.getFolderById(idCarpeta_('mitjans')));
      f.setTrashed(true);
      return registraMitja_({ driveId: c.driveId, name: c.name, mime: c.mime, kind: 'image', size: c.size, w: c.w, h: c.h, duration: 0, by: qui, dreta: true },
        mc.length < 60000 ? mc : '', idLlista, qui);
    }
  }
  let info = {};
  try {
    const r = UrlFetchApp.fetch(API_DRIVE + idFitxer + '?fields=thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)', { headers: capcaleresDrive_(), muteHttpExceptions: true });
    if (r.getResponseCode() === 200) info = JSON.parse(r.getContentText());
  } catch (e) { /* sense metadades */ }
  const meta = info.imageMediaMetadata || info.videoMediaMetadata || {};
  let mini = '';
  if (info.thumbnailLink) {
    try {
      const t = UrlFetchApp.fetch(info.thumbnailLink.replace(/=s\d+$/, '=s240'), { headers: capcaleresDrive_(), muteHttpExceptions: true });
      if (t.getResponseCode() === 200) mini = 'data:image/jpeg;base64,' + Utilities.base64Encode(t.getContent());
    } catch (e) { /* sense miniatura */ }
  }
  f.moveTo(DriveApp.getFolderById(idCarpeta_('mitjans')));
  return registraMitja_({
    driveId: idFitxer, name: f.getName(), mime: mime, kind: kind, size: f.getSize(),
    w: meta.width || 0, h: meta.height || 0, duration: meta.durationMillis ? meta.durationMillis / 1000 : 0, by: qui
  }, mini.length < 60000 ? mini : '', idLlista, qui);
}

function accioImportaBustia_(req, u) {
  const ids = [].concat(req.fileIds || []);
  const fets = [];
  ids.forEach(function (id) {
    const m = importaDeBustia_(id, req.playlistId, u.email);
    if (m) fets.push(m);
  });
  return { media: fets };
}

/** S'executa sol cada 10 minuts (activador): importa la bústia a la llista triada. */
function revisaBustia() {
  // Aprofitem aquest activador (cada 10 minuts) per mirar també l'arxiu fotogràfic
  if (typeof revisaArxiu === 'function') revisaArxiu();
  try { arreglaFotosGirades_(); } catch (e) { console.log('Fotos girades: ' + e.message); }
  const bd = llegeixBd_();
  const idLlista = bd.settings.bustiaPlaylistId;
  if (!idLlista || !troba_(bd.playlists, idLlista)) return;
  fitxersBustia_().forEach(function (f) {
    if (f.kind) importaDeBustia_(f.id, idLlista, 'bústia automàtica');
  });
}

/* ---------- Esborrar ---------- */
/* ---------- Fotos repetides ----------
 * El panell troba les fotos iguals (comparant les miniatures) i ens envia grups {keep, remove:[…]}.
 * Totes les llistes, collages, fons i logotips passen a apuntar a la que es queda; les altres
 * s'esborren de la biblioteca i van a la paperera del Drive. */
function accioFusionaMitjans_(req, u) {
  const grups = [].concat(req.groups || []).slice(0, 200);
  const llencar = []; // fitxers del Drive que van a la paperera
  const esborrats = [];
  modifica_(function (bd) {
    const canvis = {}; // id esborrat → id que es queda
    grups.forEach(function (g) {
      const keep = troba_(bd.media, g.keep);
      if (!keep) return;
      [].concat(g.remove || []).forEach(function (id) {
        if (id === keep.id || canvis[id]) return;
        const m = troba_(bd.media, id);
        if (!m || m.kind !== keep.kind) return;
        canvis[id] = keep.id;
      });
    });
    const ids = Object.keys(canvis);
    if (!ids.length) return;
    // Si un dels que es queden també s'havia d'esborrar (cadenes), segueix la cadena
    ids.forEach(function (id) { let d = canvis[id], n = 0; while (canvis[d] && n++ < 20) d = canvis[d]; canvis[id] = d; });
    bd.media = bd.media.filter(function (m) {
      if (!canvis[m.id]) return true;
      llencar.push(m.driveId); esborrats.push(m.id);
      return false;
    });
    const subst = function (id) { return canvis[id] || id; };
    bd.playlists.forEach(function (l) {
      let tocada = false;
      const vistos = {};
      l.items = l.items.filter(function (it) {
        if (it.mediaId && canvis[it.mediaId]) { it.mediaId = subst(it.mediaId); tocada = true; }
        if (it.text && it.text.bgMediaId && canvis[it.text.bgMediaId]) { it.text.bgMediaId = subst(it.text.bgMediaId); tocada = true; }
        if (it.kind === 'collage' && it.photos) {
          const abans = it.photos.join();
          const unics = [];
          it.photos.map(subst).forEach(function (x) { if (unics.indexOf(x) < 0) unics.push(x); });
          it.photos = unics;
          if (it.photos.join() !== abans) tocada = true;
        }
        // La mateixa foto dues vegades a la llista (eren dues còpies): en deixem una
        if (it.kind === 'media') {
          if (vistos[it.mediaId]) { tocada = true; return false; }
          vistos[it.mediaId] = true;
        }
        return it.kind !== 'collage' || (it.photos || []).length >= 2;
      });
      if (tocada) l.v = (l.v || 0) + 1;
    });
    if (canvis[bd.settings.logoMediaId]) bd.settings.logoMediaId = subst(bd.settings.logoMediaId);
    if (canvis[bd.settings.logoNegMediaId]) bd.settings.logoNegMediaId = subst(bd.settings.logoNegMediaId);
    if (bd.arxiu && bd.arxiu.aprovades) bd.arxiu.aprovades.forEach(function (a) { if (canvis[a.mediaId]) a.mediaId = subst(a.mediaId); });
    registra_(bd, u.email, 'Ha esborrat ' + ids.length + ' foto' + (ids.length > 1 ? 's' : '') + ' repetida' + (ids.length > 1 ? 's' : '') + ' (les llistes fan servir la que es queda)');
  });
  llencar.forEach(function (id) { if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ja no hi era */ } } });
  if (esborrats.length) modificaMiniatures_(function (mini) { esborrats.forEach(function (id) { delete mini[id]; }); });
  return { removed: esborrats.length };
}

function accioEsborraMitja_(req, u) {
  let driveId = null;
  modifica_(function (bd) {
    const m = troba_(bd.media, req.id);
    if (!m) return;
    driveId = m.driveId;
    bd.media = bd.media.filter(function (x) { return x.id !== req.id; });
    bd.playlists.forEach(function (l) {
      const abans = l.items.length;
      l.items = l.items.filter(function (it) { return it.mediaId !== req.id; });
      l.items.forEach(function (it) {
        if (it.text && it.text.bgMediaId === req.id) it.text.bgMediaId = '';
        if (it.kind === 'collage') it.photos = (it.photos || []).filter(function (x) { return x !== req.id; });
      });
      l.items = l.items.filter(function (it) { return it.kind !== 'collage' || (it.photos || []).length >= 2; });
      if (l.items.length !== abans) l.v = (l.v || 0) + 1;
    });
    if (bd.settings.logoMediaId === req.id) bd.settings.logoMediaId = '';
    if (bd.settings.logoNegMediaId === req.id) bd.settings.logoNegMediaId = '';
    registra_(bd, u.email, 'Ha esborrat «' + m.name + '» de la biblioteca');
  });
  if (driveId) { try { DriveApp.getFileById(driveId).setTrashed(true); } catch (e) { /* ja no hi era */ } }
  modificaMiniatures_(function (mini) { delete mini[req.id]; });
  return {};
}
