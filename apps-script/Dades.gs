/**
 * PANTALLES · Dades
 * ------------------------------------------------------------------
 * Tota la configuració (pantalles, llistes, biblioteca, avisos, usuaris…)
 * es desa en un sol fitxer JSON dins la carpeta de l'aplicació al Drive.
 * Les miniatures van en un fitxer a part perquè les pantalles no les
 * necessiten. Les escriptures van sempre dins d'un bloqueig (LockService)
 * perquè dues persones editant alhora no es trepitgin.
 */

const VERSIO_APP = '1.3.0';
const NOM_CARPETA_APP = 'Pantalles de l\'escola (no esborrar)';
const MAX_REGISTRE = 400;

/* ---------- Propietats ---------- */
function prop_(k, v) {
  const p = PropertiesService.getScriptProperties();
  if (v === undefined) return p.getProperty(k);
  if (v === null) p.deleteProperty(k); else p.setProperty(k, String(v));
  return v;
}

function idCarpeta_(nom) {
  const id = prop_('carpeta_' + nom);
  if (!id) throw errUsuari_('L\'aplicació no està instal·lada. Executa la funció «installar» des de l\'editor d\'Apps Script.', 'NO_INSTALLAT');
  return id;
}

/* ---------- Valors per defecte ---------- */
function bdBuida_() {
  return {
    rev: 1,
    settings: {
      schoolName: 'Vedruna Escorial Vic',
      accent: '#c8102e',
      logoMediaId: '',
      logoNegMediaId: '',
      defaultDuration: 10,
      defaultTransition: 'fade',
      bustiaPlaylistId: '',
      tickerSpeed: 90
    },
    users: [],
    screens: [],
    playlists: [],
    media: [],
    alerts: [],
    ticker: [],
    log: []
  };
}

function normalitzaBd_(bd) {
  const base = bdBuida_();
  Object.keys(base).forEach(function (k) { if (bd[k] === undefined) bd[k] = base[k]; });
  Object.keys(base.settings).forEach(function (k) { if (bd.settings[k] === undefined) bd.settings[k] = base.settings[k]; });
  return bd;
}

/* ---------- Lectura / escriptura amb memòria cau ---------- */
const CAU_TROS = 45000; // caràcters per tros (el límit de la memòria cau és 100 kB per valor)

function cauDesa_(clau, text, segons) {
  const c = CacheService.getScriptCache();
  const n = Math.ceil(text.length / CAU_TROS) || 1;
  const obj = {};
  for (let i = 0; i < n; i++) obj[clau + '_' + i] = text.substr(i * CAU_TROS, CAU_TROS);
  obj[clau + '_n'] = String(n);
  try { c.putAll(obj, segons || 21600); } catch (e) { /* si no hi cap, es llegirà del Drive */ }
}

function cauLlegeix_(clau) {
  const c = CacheService.getScriptCache();
  const n = parseInt(c.get(clau + '_n'), 10);
  if (!n) return null;
  const claus = [];
  for (let i = 0; i < n; i++) claus.push(clau + '_' + i);
  const tot = c.getAll(claus);
  let text = '';
  for (let i = 0; i < n; i++) {
    if (tot[claus[i]] == null) return null;
    text += tot[claus[i]];
  }
  return text;
}

function fitxerBd_() { return DriveApp.getFileById(prop_('fitxer_bd')); }

function llegeixBd_() {
  const enCau = cauLlegeix_('bd');
  if (enCau) {
    try { return normalitzaBd_(JSON.parse(enCau)); } catch (e) { /* continua */ }
  }
  if (!prop_('fitxer_bd')) throw errUsuari_('L\'aplicació no està instal·lada. Executa «installar».', 'NO_INSTALLAT');
  const text = fitxerBd_().getBlob().getDataAsString();
  cauDesa_('bd', text);
  return normalitzaBd_(JSON.parse(text));
}

function desaBd_(bd) {
  bd.rev = (bd.rev || 0) + 1;
  if (bd.log.length > MAX_REGISTRE) bd.log = bd.log.slice(-MAX_REGISTRE);
  const text = JSON.stringify(bd);
  fitxerBd_().setContent(text);
  cauDesa_('bd', text);
  prop_('rev', bd.rev);
  copiaSeguretat_(text);
  return bd;
}

/** Fa una còpia diària de la base de dades (es conserven les 30 últimes). */
function copiaSeguretat_(text) {
  const avui = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
  if (prop_('ultima_copia') === avui) return;
  try {
    const carpeta = DriveApp.getFolderById(idCarpeta_('copies'));
    carpeta.createFile('copia-' + avui + '.json', text, 'application/json');
    prop_('ultima_copia', avui);
    const fitxers = [];
    const it = carpeta.getFiles();
    while (it.hasNext()) fitxers.push(it.next());
    fitxers.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
    fitxers.slice(30).forEach(function (f) { f.setTrashed(true); });
  } catch (e) { /* la còpia mai ha d'impedir desar */ }
}

/** Executa una modificació de la base de dades dins un bloqueig. */
function modifica_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw errUsuari_('El sistema està ocupat desant un altre canvi. Torna-ho a provar d\'aquí uns segons.', 'OCUPAT');
  try {
    CacheService.getScriptCache().remove('bd_n'); // força llegir la versió real del Drive
    const bd = llegeixBd_();
    const res = fn(bd);
    desaBd_(bd);
    return res;
  } finally {
    lock.releaseLock();
  }
}

function registra_(bd, qui, que) {
  bd.log.push({ at: new Date().toISOString(), by: qui || 'sistema', what: que });
}

/* ---------- Miniatures (fitxer a part) ---------- */
function llegeixMiniatures_() {
  const id = prop_('fitxer_mini');
  if (!id) return {};
  const enCau = cauLlegeix_('mini');
  if (enCau) { try { return JSON.parse(enCau); } catch (e) { /* continua */ } }
  const text = DriveApp.getFileById(id).getBlob().getDataAsString() || '{}';
  if (text.length < 900000) cauDesa_('mini', text);
  return JSON.parse(text);
}

function modificaMiniatures_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    CacheService.getScriptCache().remove('mini_n');
    const m = llegeixMiniatures_();
    fn(m);
    const text = JSON.stringify(m);
    DriveApp.getFileById(prop_('fitxer_mini')).setContent(text);
    if (text.length < 900000) cauDesa_('mini', text); else CacheService.getScriptCache().remove('mini_n');
  } finally { lock.releaseLock(); }
}

/* ---------- Utilitats ---------- */
function nouId_(prefix) {
  return (prefix || '') + Utilities.getUuid().replace(/-/g, '').substr(0, 12);
}

function tokenAleatori_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function errUsuari_(missatge, codi) {
  const e = new Error(missatge);
  e.userMsg = missatge;
  e.code = codi || 'ERR';
  return e;
}

function troba_(llista, id) {
  for (let i = 0; i < llista.length; i++) if (llista[i].id === id) return llista[i];
  return null;
}

function text_(v, max) {
  return String(v == null ? '' : v).substr(0, max || 500);
}
