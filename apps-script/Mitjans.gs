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

function importaDeBustia_(idFitxer, idLlista, qui) {
  const f = DriveApp.getFileById(idFitxer);
  const mime = f.getMimeType();
  const kind = tipusMitja_(mime);
  if (!kind) return null;
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
  const bd = llegeixBd_();
  const idLlista = bd.settings.bustiaPlaylistId;
  if (!idLlista || !troba_(bd.playlists, idLlista)) return;
  fitxersBustia_().forEach(function (f) {
    if (f.kind) importaDeBustia_(f.id, idLlista, 'bústia automàtica');
  });
}

/* ---------- Esborrar ---------- */
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
