/**
 * PANTALLES · Actualització des de GitHub
 * ------------------------------------------------------------------
 * El fitxer «Carregador» fa que el servei faci servir sempre el codi publicat
 * a GitHub. Aquí hi ha les accions que el fan anar:
 *   - «selfUpdate»: la crida GitHub en publicar un canvi → actualització a l'instant.
 *   - cada hora, per si de cas (activador creat per «installar»).
 *   - Panell → Ajustos → Servei de Google: «Actualitza ara» i «Torna a la versió anterior».
 */

function carregadorDisponible_() { return typeof actualitzaCodiRemot_ === 'function'; }

function senseCarregador_() {
  throw errUsuari_('Falta el fitxer «Carregador» al projecte d\'Apps Script (vegeu la GUIA, «Actualitzacions automàtiques»).', 'SENSE_CARREGADOR');
}

function actualitza_(forcar, qui) {
  if (!carregadorDisponible_()) senseCarregador_();
  let r;
  try { r = actualitzaCodiRemot_(forcar); }
  catch (e) { throw errUsuari_('No s\'ha pogut actualitzar: ' + (e.message || e), 'ACTUALITZACIO'); }
  if (r.estat === 'actualitzat') {
    try { modifica_(function (bd) { registra_(bd, qui, 'Servei actualitzat des de GitHub (' + r.commit.substr(0, 7) + ')'); }); } catch (e) { /* no és imprescindible */ }
  }
  return r;
}

/** Acció pública: només instal·la el que hi ha a la branca principal de GitHub; si ja hi és, no fa res. */
function accioAutoActualitza_(req) {
  const ara = Date.now();
  const darrera = parseInt(prop_('darrera_consulta') || '0', 10);
  if (ara - darrera < 10000) return { estat: 'espera', missatge: 'Torna-ho a provar d\'aquí uns segons.' };
  prop_('darrera_consulta', ara);
  return actualitza_(false, 'publicació a GitHub');
}

/** S'executa sol cada hora. */
function actualitzaAutomaticament() {
  try { console.log(actualitza_(false, 'actualització automàtica').missatge); }
  catch (e) { console.error(e); }
}

/** Per executar a mà des de l'editor. */
function actualitzaAra() {
  console.log(actualitza_(true, 'editor Apps Script').missatge);
}

/* ---------- Accions del panell (només administradors) ---------- */
function accioActualitzaServei_(req, u) {
  return actualitza_(!!req.force, u.email);
}

function accioTornaVersio_(req, u) {
  if (!carregadorDisponible_()) senseCarregador_();
  let r;
  try { r = tornaCodiAnterior_(); } catch (e) { throw errUsuari_(String(e.message || e), 'ACTUALITZACIO'); }
  try { modifica_(function (bd) { registra_(bd, u.email, 'Ha tornat el servei a la versió anterior'); }); } catch (e) { /* res */ }
  return r;
}

function accioEstatServei_(req, u) {
  return {
    version: VERSIO_APP,
    loader: carregadorDisponible_(),
    commit: prop_('commit_remot') || '',
    lastUpdate: prop_('darrera_actualitzacio') || '',
    lastError: prop_('error_actualitzacio') || ''
  };
}
