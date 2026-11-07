/**
 * PANTALLES · Carregador (aquest fitxer NO s'actualitza sol: no cal tocar-lo mai)
 * ------------------------------------------------------------------
 * Fa que el servei faci servir sempre el codi publicat a GitHub (branca main),
 * sense haver de copiar fitxers ni fer versions noves:
 *
 *   1. Quan es publica un canvi, l'acció «selfUpdate» baixa el codi de GitHub,
 *      comprova que no tingui errors i el desa al Drive.
 *   2. A cada petició, aquest carregador posa en marxa el codi desat, que
 *      substitueix el dels altres fitxers del projecte.
 *   3. Si alguna cosa falla, es fa servir el codi dels fitxers del projecte
 *      (la darrera versió copiada a mà), així que el servei mai no es queda aturat.
 *
 * Ha de ser l'ÚLTIM fitxer de la llista de l'editor (crea'l l'últim).
 */

var CARREGADOR_REPO = 'poldpm/pantalles';
var CARREGADOR_BRANCA = 'main';
var CARREGADOR_TROS = 40000;

function carregadorProps_() { return PropertiesService.getScriptProperties(); }

function carregadorCauLlegeix_() {
  var c = CacheService.getScriptCache();
  var n = parseInt(c.get('codiremot_n'), 10);
  if (!n) return null;
  var claus = [];
  for (var i = 0; i < n; i++) claus.push('codiremot_' + i);
  var tot = c.getAll(claus), text = '';
  for (var j = 0; j < n; j++) { if (tot[claus[j]] == null) return null; text += tot[claus[j]]; }
  return text;
}

function carregadorCauDesa_(text) {
  var c = CacheService.getScriptCache(), obj = {}, n = Math.ceil(text.length / CARREGADOR_TROS) || 1;
  for (var i = 0; i < n; i++) obj['codiremot_' + i] = text.substr(i * CARREGADOR_TROS, CARREGADOR_TROS);
  obj.codiremot_n = String(n);
  try { c.putAll(obj, 21600); } catch (e) { /* es llegirà del Drive */ }
}

/** Fitxer del Drive on es guarda el codi baixat de GitHub. */
function carregadorFitxer_(nom, crea) {
  var p = carregadorProps_(), clau = 'fitxer_' + nom;
  var id = p.getProperty(clau);
  if (id) { try { return DriveApp.getFileById(id); } catch (e) { /* s'ha esborrat */ } }
  if (!crea) return null;
  var arrel = p.getProperty('carpeta_arrel');
  var carpeta = arrel ? DriveApp.getFolderById(arrel) : DriveApp.getRootFolder();
  var f = carpeta.createFile(nom + '.js', '', 'text/plain');
  p.setProperty(clau, f.getId());
  return f;
}

function carregadorCommitGitHub_() {
  var r = UrlFetchApp.fetch('https://github.com/' + CARREGADOR_REPO + '.git/info/refs?service=git-upload-pack', { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('No s\'ha pogut consultar GitHub (' + r.getResponseCode() + ').');
  var m = new RegExp('([0-9a-f]{40}) refs/heads/' + CARREGADOR_BRANCA + '\\b').exec(r.getContentText());
  if (!m) throw new Error('No s\'ha trobat la branca ' + CARREGADOR_BRANCA + ' a GitHub.');
  return m[1];
}

function carregadorRaw_(commit, cami) {
  var r = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + CARREGADOR_REPO + '/' + commit + '/' + cami, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('No s\'ha pogut llegir ' + cami + ' de GitHub (' + r.getResponseCode() + ').');
  return r.getContentText();
}

/**
 * Baixa el codi de GitHub si n'hi ha de nou i el deixa a punt.
 * Només fa cas de la branca principal del repositori: res que vingui de fora.
 */
function actualitzaCodiRemot_(forcar) {
  var p = carregadorProps_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { estat: 'ocupat', missatge: 'Ja s\'està actualitzant.' };
  try {
    var commit = carregadorCommitGitHub_();
    if (!forcar && p.getProperty('commit_remot') === commit && carregadorFitxer_('codi-remot', false)) {
      return { estat: 'al_dia', commit: commit, missatge: 'El servei ja té la darrera versió de GitHub.' };
    }
    var llista = JSON.parse(carregadorRaw_(commit, 'apps-script/fitxers.json'));
    var codi = llista.filter(function (nom) { return nom !== 'Carregador'; }).map(function (nom) {
      return '// ===== ' + nom + '.gs =====\n' + carregadorRaw_(commit, 'apps-script/' + nom + '.gs');
    }).join('\n;\n');
    new Function(codi); // comprova que no hi hagi errors de sintaxi abans de fer-lo servir
    var actual = carregadorFitxer_('codi-remot', true);
    var anterior = carregadorFitxer_('codi-anterior', true);
    anterior.setContent(actual.getBlob().getDataAsString() || '');
    p.setProperty('commit_anterior', p.getProperty('commit_remot') || '');
    actual.setContent(codi);
    carregadorCauDesa_(codi);
    p.setProperty('commit_remot', commit);
    p.setProperty('darrera_actualitzacio', new Date().toISOString());
    p.deleteProperty('error_actualitzacio');
    return { estat: 'actualitzat', commit: commit, missatge: 'Servei actualitzat a la darrera versió de GitHub (' + commit.substr(0, 7) + ').' };
  } catch (e) {
    p.setProperty('error_actualitzacio', String(e.message || e).substr(0, 300));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** Torna al codi d'abans de l'última actualització. */
function tornaCodiAnterior_() {
  var p = carregadorProps_();
  var anterior = carregadorFitxer_('codi-anterior', false);
  var text = anterior ? anterior.getBlob().getDataAsString() : '';
  if (!text) throw new Error('No hi ha cap versió anterior desada.');
  var actual = carregadorFitxer_('codi-remot', true);
  actual.setContent(text);
  carregadorCauDesa_(text);
  p.setProperty('commit_remot', p.getProperty('commit_anterior') || 'anterior');
  return { estat: 'restaurat', missatge: 'S\'ha tornat a la versió anterior.' };
}

/* ---------- Posada en marxa (s'executa a cada petició) ---------- */
(function () {
  var codi = null;
  try {
    codi = carregadorCauLlegeix_();
    if (!codi) {
      var f = carregadorFitxer_('codi-remot', false);
      if (f) { codi = f.getBlob().getDataAsString(); if (codi) carregadorCauDesa_(codi); }
    }
    var darrerIntent = parseInt(carregadorProps_().getProperty('carregador_intent') || '0', 10);
    if (!codi && Date.now() - darrerIntent > 60000) {
      // Primer cop (o l'anterior intent va fallar): baixa el codi de GitHub ara mateix.
      carregadorProps_().setProperty('carregador_intent', String(Date.now()));
      actualitzaCodiRemot_(true);
      codi = carregadorCauLlegeix_();
    }
    if (codi) (0, eval)(codi);
  } catch (e) {
    // Es fa servir el codi dels fitxers del projecte.
    try { carregadorProps_().setProperty('error_actualitzacio', 'Carregador: ' + String(e.message || e).substr(0, 280)); } catch (e2) { /* res */ }
  }
})();
