/**
 * PANTALLES · Actualització automàtica des de GitHub
 * ------------------------------------------------------------------
 * Quan es publica un canvi a GitHub, es fa una crida a l'acció «selfUpdate»
 * i el servei s'actualitza a l'instant. (Per si de cas, també ho comprova
 * sol cada hora i un administrador ho pot forçar des del panell.)
 * El servei mira si al repositori de GitHub hi ha una versió nova del codi. Si n'hi
 * ha, la copia a aquest projecte, en fa una versió nova i la posa en marxa
 * a la mateixa adreça. Si alguna cosa falla, es queda la versió que hi havia.
 *
 * Requisit (una sola vegada): activar l'«API de Google Apps Script» a
 * https://script.google.com/home/usersettings
 */

const REPO_PER_DEFECTE = 'poldpm/pantalles';
const BRANCA = 'main';
const API_SCRIPT = 'https://script.googleapis.com/v1/projects/';

function repo_() { return prop_('repo') || REPO_PER_DEFECTE; }

/**
 * Commit actual de la branca principal. Es llegeix del protocol git (sempre al dia,
 * sense memòria cau ni límits de l'API). Mai no es fa cas d'un commit que ens enviïn:
 * només s'instal·la el que hi ha publicat a la branca principal del repositori.
 */
function commitActual_() {
  const r = UrlFetchApp.fetch('https://github.com/' + repo_() + '.git/info/refs?service=git-upload-pack', { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw errUsuari_('No s\'ha pogut consultar GitHub (' + r.getResponseCode() + ').', 'GITHUB');
  const m = new RegExp('([0-9a-f]{40}) refs/heads/' + BRANCA + '\\b').exec(r.getContentText());
  if (!m) throw errUsuari_('No s\'ha trobat la branca ' + BRANCA + ' a GitHub.', 'GITHUB');
  return m[1];
}

function rawGitHub_(cami, commit) {
  const url = 'https://raw.githubusercontent.com/' + repo_() + '/' + commit + '/' + cami;
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'Cache-Control': 'no-cache' } });
  if (r.getResponseCode() !== 200) throw errUsuari_('No s\'ha pogut llegir ' + cami + ' de GitHub (' + r.getResponseCode() + ').', 'GITHUB');
  return r.getContentText();
}

function apiScript_(metode, cami, cos) {
  const opc = { method: metode, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (cos) { opc.contentType = 'application/json'; opc.payload = JSON.stringify(cos); }
  const r = UrlFetchApp.fetch(API_SCRIPT + ScriptApp.getScriptId() + cami, opc);
  const codi = r.getResponseCode();
  let dades = {};
  try { dades = JSON.parse(r.getContentText() || '{}'); } catch (e) { dades = {}; }
  if (codi >= 300) {
    const msg = (dades.error && dades.error.message) || r.getContentText().substr(0, 300);
    if (codi === 403 && /Apps Script API/i.test(msg)) {
      throw errUsuari_('Cal activar l\'«API de Google Apps Script» a script.google.com/home/usersettings (una sola vegada).', 'API_DESACTIVADA');
    }
    throw errUsuari_('Error de l\'API d\'Apps Script (' + codi + '): ' + msg, 'API');
  }
  return dades;
}

/** Baixa el codi de GitHub. Retorna { fitxers, empremta }. */
function codiDeGitHub_() {
  const commit = commitActual_();
  const llista = JSON.parse(rawGitHub_('apps-script/fitxers.json', commit));
  const fitxers = llista.map(function (nom) {
    return { name: nom, type: 'SERVER_JS', source: rawGitHub_('apps-script/' + nom + '.gs', commit) };
  });
  fitxers.push({ name: 'appsscript', type: 'JSON', source: rawGitHub_('apps-script/appsscript.json', commit) });
  fitxers.forEach(function (f) { if (!f.source || f.source.length < 20) throw errUsuari_('El fitxer ' + f.name + ' de GitHub és buit.', 'GITHUB'); });
  return { commit: commit, fitxers: fitxers, empremta: hash_(fitxers.map(function (f) { return f.name + '\n' + f.source; }).join('\n\n')) };
}

/** Implementacions d'aplicació web que s'han d'actualitzar (no la de proves). */
function implementacionsWeb_() {
  const r = apiScript_('get', '/deployments?pageSize=50');
  return (r.deployments || []).filter(function (d) {
    const c = d.deploymentConfig || {};
    return c.versionNumber && (d.entryPoints || []).some(function (e) { return e.entryPointType === 'WEB_APP'; });
  });
}

/**
 * Actualitza el servei si GitHub té un codi diferent.
 * @param {boolean} forcar actualitza encara que l'empremta coincideixi
 * @return {{estat: string, versio?: number, missatge: string}}
 */
function actualitzaServei_(forcar, qui) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { estat: 'ocupat', missatge: 'Ja s\'està actualitzant.' };
  try {
    const codi = codiDeGitHub_();
    if (!forcar && prop_('empremta_codi') === codi.empremta) return { estat: 'al_dia', missatge: 'El servei ja té la versió de GitHub.' };
    const deps = implementacionsWeb_();
    if (!deps.length) throw errUsuari_('No s\'ha trobat cap implementació d\'aplicació web.', 'API');
    // 1. Codi nou al projecte (si té errors de sintaxi, Google el rebutja i no canvia res)
    apiScript_('put', '/content', { files: codi.fitxers });
    // 2. Versió nova
    const v = apiScript_('post', '/versions', { description: 'Actualització automàtica des de GitHub ' + new Date().toISOString() });
    // 3. Les implementacions passen a la versió nova (la mateixa adreça)
    const anterior = deps[0].deploymentConfig.versionNumber;
    deps.forEach(function (d) {
      apiScript_('put', '/deployments/' + d.deploymentId, {
        deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: v.versionNumber, manifestFileName: 'appsscript', description: d.deploymentConfig.description || 'Pantalles' }
      });
    });
    prop_('empremta_codi', codi.empremta);
    prop_('versio_anterior', anterior);
    prop_('darrera_actualitzacio', new Date().toISOString());
    prop_('commit_desplegat', codi.commit);
    prop_('error_actualitzacio', null);
    try { modifica_(function (bd) { registra_(bd, qui || 'actualització automàtica', 'Servei actualitzat des de GitHub (versió ' + v.versionNumber + ')'); }); } catch (e) { /* no és imprescindible */ }
    return { estat: 'actualitzat', versio: v.versionNumber, missatge: 'Servei actualitzat a la versió ' + v.versionNumber + '.' };
  } finally {
    lock.releaseLock();
  }
}

/** S'executa sol cada hora (activador creat per «installar»). */
function actualitzaAutomaticament() {
  try {
    const r = actualitzaServei_(false, 'actualització automàtica');
    console.log(r.missatge);
  } catch (e) {
    prop_('error_actualitzacio', (e.userMsg || e.message || String(e)).substr(0, 300));
    console.error(e);
  }
}

/** Per executar a mà des de l'editor: força l'actualització ara. */
function actualitzaAra() {
  console.log(actualitzaServei_(true, 'editor Apps Script').missatge);
}

/** Torna a la versió anterior (si una actualització hagués anat malament). */
function tornaVersioAnterior_(qui) {
  const anterior = parseInt(prop_('versio_anterior'), 10);
  if (!anterior) throw errUsuari_('No hi ha cap versió anterior desada.', 'API');
  implementacionsWeb_().forEach(function (d) {
    apiScript_('put', '/deployments/' + d.deploymentId, {
      deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: anterior, manifestFileName: 'appsscript', description: d.deploymentConfig.description || 'Pantalles' }
    });
  });
  prop_('empremta_codi', null);
  try { modifica_(function (bd) { registra_(bd, qui, 'Ha tornat el servei a la versió ' + anterior); }); } catch (e) { /* res */ }
  return { estat: 'restaurat', versio: anterior, missatge: 'S\'ha tornat a la versió ' + anterior + '.' };
}

/**
 * Acció pública «selfUpdate»: qualsevol la pot cridar, però només instal·la el
 * codi publicat a la branca principal de GitHub, i no fa res si ja hi és.
 * Com a molt una consulta cada 10 segons.
 */
function accioAutoActualitza_(req) {
  const ara = Date.now();
  const darrera = parseInt(prop_('darrera_consulta') || '0', 10);
  if (ara - darrera < 10000) return { estat: 'espera', missatge: 'Torna-ho a provar d\'aquí uns segons.' };
  prop_('darrera_consulta', ara);
  try {
    return actualitzaServei_(false, 'publicació a GitHub');
  } catch (e) {
    prop_('error_actualitzacio', (e.userMsg || e.message || String(e)).substr(0, 300));
    throw e;
  }
}

/* ---------- Accions del panell (només administradors) ---------- */
function accioActualitzaServei_(req, u) {
  return actualitzaServei_(!!req.force, u.email);
}
function accioTornaVersio_(req, u) {
  return tornaVersioAnterior_(u.email);
}
function accioEstatServei_(req, u) {
  return {
    version: VERSIO_APP,
    lastUpdate: prop_('darrera_actualitzacio') || '',
    lastError: prop_('error_actualitzacio') || '',
    commit: prop_('commit_desplegat') || '',
    previous: prop_('versio_anterior') || '',
    repo: repo_()
  };
}
