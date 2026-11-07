/**
 * PANTALLES · Accés al panell
 * ------------------------------------------------------------------
 * Només hi poden entrar els correus de la llista d'usuaris. Per entrar:
 *   1. La persona escriu el seu correu de l'escola.
 *   2. Rep un codi de 6 xifres al correu (vàlid 10 minuts).
 *   3. Amb el codi obté una sessió (30 dies en aquest dispositiu).
 * No cal crear contrasenyes ni configurar res a Google Cloud.
 */

const DIES_SESSIO = 30;
const MAX_INTENTS_CODI = 5;

function normalitzaCorreu_(c) { return String(c || '').trim().toLowerCase(); }

function usuari_(bd, correu) {
  correu = normalitzaCorreu_(correu);
  for (let i = 0; i < bd.users.length; i++) if (normalitzaCorreu_(bd.users[i].email) === correu) return bd.users[i];
  return null;
}

function hash_(text) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text);
  return b.map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

function accioIniciaLogin_(req) {
  const correu = normalitzaCorreu_(req.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correu)) throw errUsuari_('Escriu un correu vàlid.', 'CORREU');
  const bd = llegeixBd_();
  const u = usuari_(bd, correu);
  // Per seguretat, la resposta és la mateixa tant si el correu té accés com si no.
  if (!u) return { sent: true };
  const cau = CacheService.getScriptCache();
  const limit = parseInt(cau.get('lim_' + correu) || '0', 10);
  if (limit >= 5) throw errUsuari_('Has demanat massa codis. Espera 15 minuts.', 'LIMIT');
  cau.put('lim_' + correu, String(limit + 1), 900);
  const codi = String(Math.floor(100000 + Math.random() * 900000));
  cau.put('codi_' + correu, JSON.stringify({ h: hash_(codi + correu), n: 0 }), 600);
  const escola = bd.settings.schoolName || 'Escola';
  MailApp.sendEmail({
    to: correu,
    subject: 'Codi d\'accés a Pantalles · ' + codi,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">' +
      '<p>Hola ' + (u.name || '') + ',</p>' +
      '<p>El teu codi per entrar al panell de les pantalles de <b>' + escola + '</b> és:</p>' +
      '<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:16px 0">' + codi + '</p>' +
      '<p style="color:#666">Caduca d\'aquí 10 minuts. Si no l\'has demanat tu, pots ignorar aquest correu.</p></div>',
    body: 'El teu codi d\'accés a Pantalles és: ' + codi + ' (caduca en 10 minuts).',
    name: 'Pantalles · ' + escola
  });
  return { sent: true };
}

function accioVerificaLogin_(req) {
  const correu = normalitzaCorreu_(req.email);
  const codi = String(req.code || '').replace(/\D/g, '');
  const cau = CacheService.getScriptCache();
  const guardat = cau.get('codi_' + correu);
  if (!guardat) throw errUsuari_('El codi ha caducat o no és correcte. Demana\'n un de nou.', 'CODI');
  const g = JSON.parse(guardat);
  if (g.n >= MAX_INTENTS_CODI) { cau.remove('codi_' + correu); throw errUsuari_('Massa intents. Demana un codi nou.', 'CODI'); }
  if (g.h !== hash_(codi + correu)) {
    g.n++; cau.put('codi_' + correu, JSON.stringify(g), 600);
    throw errUsuari_('Codi incorrecte.', 'CODI');
  }
  cau.remove('codi_' + correu);
  const bd = llegeixBd_();
  const u = usuari_(bd, correu);
  if (!u) throw errUsuari_('Aquest correu no té accés.', 'SENSE_ACCES');
  const sessio = tokenAleatori_();
  netejaSessions_();
  prop_('ses_' + hash_(sessio), JSON.stringify({ email: correu, exp: Date.now() + DIES_SESSIO * 864e5, dev: text_(req.device, 120) }));
  modifica_(function (b) { registra_(b, correu, 'Ha entrat al panell'); });
  return { session: sessio, user: { email: correu, name: u.name || '', role: u.role || 'editor' } };
}

function accioSurt_(req) {
  if (req.session) prop_('ses_' + hash_(req.session), null);
  return {};
}

function netejaSessions_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const ara = Date.now();
  Object.keys(p).forEach(function (k) {
    if (k.indexOf('ses_') !== 0) return;
    try { if (JSON.parse(p[k]).exp < ara) prop_(k, null); } catch (e) { prop_(k, null); }
  });
}

/** Comprova la sessió i retorna l'usuari. Llança error si no és vàlida. */
function usuariSessio_(req, bd, calAdmin) {
  if (!req.session) throw errUsuari_('Cal tornar a entrar.', 'SESSIO');
  const s = prop_('ses_' + hash_(req.session));
  if (!s) throw errUsuari_('La sessió ha caducat. Torna a entrar.', 'SESSIO');
  const dades = JSON.parse(s);
  if (dades.exp < Date.now()) { prop_('ses_' + hash_(req.session), null); throw errUsuari_('La sessió ha caducat. Torna a entrar.', 'SESSIO'); }
  const u = usuari_(bd || llegeixBd_(), dades.email);
  if (!u) throw errUsuari_('Aquest correu ja no té accés.', 'SESSIO');
  if (calAdmin && u.role !== 'admin') throw errUsuari_('Només els administradors poden fer això.', 'PERMIS');
  // Sessió que es renova sola: mentre la facis servir, no caduca (com a molt, una escriptura al dia).
  if (dades.exp - Date.now() < (DIES_SESSIO - 1) * 864e5) {
    dades.exp = Date.now() + DIES_SESSIO * 864e5;
    prop_('ses_' + hash_(req.session), JSON.stringify(dades));
  }
  return { email: normalitzaCorreu_(u.email), name: u.name || '', role: u.role || 'editor' };
}
