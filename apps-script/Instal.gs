/**
 * PANTALLES · Instal·lació
 * ------------------------------------------------------------------
 * Executa «installar» UNA SOLA VEGADA des de l'editor (botó ▶ Executa).
 * Crea al teu Drive:
 *
 *   📁 Pantalles de l'escola (no esborrar)
 *      ├─ 📁 Fitxers         ← fotos i vídeos de la biblioteca (privats)
 *      ├─ 📁 Bústia          ← deixa-hi fitxers i s'importen sols
 *      ├─ 📁 Còpies de seguretat
 *      ├─ dades.json         ← tota la configuració
 *      └─ miniatures.json
 *
 * Tu (el compte que l'executa) quedes com a primer administrador.
 * Es pot tornar a executar sense perill: no esborra res.
 */

function installar() {
  const jo = Session.getEffectiveUser().getEmail();
  let arrel = prop_('carpeta_arrel') ? DriveApp.getFolderById(prop_('carpeta_arrel')) : null;
  if (!arrel) {
    arrel = DriveApp.createFolder(NOM_CARPETA_APP);
    prop_('carpeta_arrel', arrel.getId());
  }
  [['mitjans', 'Fitxers'], ['bustia', 'Bústia (deixa-hi fotos i vídeos)'], ['copies', 'Còpies de seguretat']].forEach(function (c) {
    if (!prop_('carpeta_' + c[0])) prop_('carpeta_' + c[0], arrel.createFolder(c[1]).getId());
  });
  if (!prop_('fitxer_bd')) {
    const bd = bdBuida_();
    bd.users.push({ email: normalitzaCorreu_(jo), name: '', role: 'admin' });
    registra_(bd, jo, 'Instal·lació del sistema');
    prop_('fitxer_bd', arrel.createFile('dades.json', JSON.stringify(bd), 'application/json').getId());
  }
  if (!prop_('fitxer_mini')) prop_('fitxer_mini', arrel.createFile('miniatures.json', '{}', 'application/json').getId());

  // Activador de la bústia automàtica (cada 10 minuts).
  const jaHiEs = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'revisaBustia'; });
  if (!jaHiEs) ScriptApp.newTrigger('revisaBustia').timeBased().everyMinutes(10).create();
  // Actualització automàtica des de GitHub (pla B: la normal és a l'instant, en publicar).
  const jaActualitza = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'actualitzaAutomaticament'; });
  if (!jaActualitza) ScriptApp.newTrigger('actualitzaAutomaticament').timeBased().everyHours(1).create();

  console.log('✅ Instal·lat. Administrador: ' + jo);
  console.log('📁 Carpeta: ' + arrel.getUrl());
  console.log('Següent pas: Implementa → Nova implementació → Aplicació web (vegeu GUIA.md).');
}

/** Afegeix una persona amb accés des de l'editor (per si et quedes sense accés al panell). */
function afegirAdministrador() {
  const CORREU = 'posa.aqui@el-correu.cat'; // ← canvia-ho i executa
  modifica_(function (bd) {
    const c = normalitzaCorreu_(CORREU);
    const u = usuari_(bd, c);
    if (u) u.role = 'admin'; else bd.users.push({ email: c, name: '', role: 'admin' });
    registra_(bd, 'editor Apps Script', 'Ha donat accés d\'administrador a ' + c);
  });
  console.log('Fet.');
}

/** Comprovació ràpida de l'estat del sistema. */
function diagnostic() {
  const bd = llegeixBd_();
  console.log('Versió: ' + VERSIO_APP + ' · revisió de dades: ' + bd.rev);
  console.log('Persones amb accés: ' + bd.users.map(function (u) { return u.email + ' (' + u.role + ')'; }).join(', '));
  console.log('Pantalles: ' + bd.screens.length + ' · Llistes: ' + bd.playlists.length + ' · Fitxers: ' + bd.media.length);
  const est = estatsPantalles_(bd);
  bd.screens.forEach(function (p) {
    const e = est[p.id];
    console.log(' - ' + p.name + ': ' + (e && e.seen ? 'última connexió ' + new Date(e.seen).toLocaleString() : 'mai connectada'));
  });
}
