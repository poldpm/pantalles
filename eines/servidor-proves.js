#!/usr/bin/env node
/* =====================================================================
 *  PANTALLES · Servidor de proves local
 *  Executa el codi REAL d'Apps Script (apps-script/*.gs) dins Node amb
 *  imitacions dels serveis de Google (Drive, correu, memòria cau…), i
 *  serveix la web. Serveix per provar-ho tot a l'ordinador sense Google.
 *
 *    node eines/servidor-proves.js [port]
 *    → http://localhost:8080/panell/   (correu: admin@escola.cat)
 *      El codi d'accés surt per la consola (no s'envia cap correu).
 * ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ARREL = path.join(__dirname, '..');
const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const ADMIN = process.env.ADMIN || 'admin@escola.cat';
const LENT = parseInt(process.env.LENT || '0', 10); // ms de retard artificial per petició

/* ---------------- Imitacions dels serveis de Google ---------------- */
const propietats = {};
const cau = {};
const correus = [];
const fitxers = {};   // id → {id,name,mime,data:Buffer,parent,trashed,folder:false}
const carpetes = {};  // id → {id,name,parent}
const pujades = {};
let comptador = 1;
const nouIdDrive = () => 'drv' + (comptador++).toString(36) + crypto.randomBytes(4).toString('hex');

const aSignat = (buf) => Array.from(new Int8Array(buf.buffer, buf.byteOffset, buf.length));
const deSignat = (arr) => Buffer.from(Uint8Array.from(arr, (x) => (x + 256) % 256));

function objCarpeta(c) {
  return {
    getId: () => c.id, getName: () => c.name, getUrl: () => 'https://drive.google.com/drive/folders/' + c.id,
    createFolder: (nom) => { const n = { id: nouIdDrive(), name: nom, parent: c.id }; carpetes[n.id] = n; return objCarpeta(n); },
    createFile: (nom, contingut, mime) => {
      const esBlob = nom && nom._buf;
      const f = esBlob ? { id: nouIdDrive(), name: nom._nom, mime: nom._tipus, data: nom._buf, parent: c.id, trashed: false } :
        { id: nouIdDrive(), name: nom, mime: mime || 'text/plain', data: Buffer.from(String(contingut)), parent: c.id, trashed: false, mod: Date.now() };
      fitxers[f.id] = f; return objFitxer(f);
    },
    getFiles: () => {
      const llista = Object.values(fitxers).filter((f) => f.parent === c.id && !f.trashed);
      let i = 0;
      return { hasNext: () => i < llista.length, next: () => objFitxer(llista[i++]) };
    }
  };
}
function objFitxer(f) {
  return {
    getId: () => f.id, getName: () => f.name, getMimeType: () => f.mime, getSize: () => f.data.length,
    getBlob: () => ({ getDataAsString: () => f.data.toString('utf8'), getBytes: () => aSignat(f.data) }),
    setContent: (t) => { f.data = Buffer.from(String(t)); f.mod = Date.now(); return objFitxer(f); },
    setTrashed: (v) => { f.trashed = !!v; },
    moveTo: (carp) => { f.parent = carp.getId(); },
    getUrl: () => 'https://drive.google.com/file/d/' + f.id,
    getLastUpdated: () => new Date(f.mod || 0)
  };
}
function blobDe(buf, tipus) {
  return { _buf: buf, _nom: 'fitxer', _tipus: tipus, setName(n) { this._nom = n; return this; }, getName() { return this._nom; }, getContentType() { return this._tipus; }, getBytes() { return aSignat(buf); } };
}
function resposta(codi, cos, capcaleres) {
  const buf = Buffer.isBuffer(cos) ? cos : Buffer.from(typeof cos === 'string' ? cos : JSON.stringify(cos || {}));
  return { getResponseCode: () => codi, getContentText: () => buf.toString('utf8'), getContent: () => aSignat(buf), getHeaders: () => capcaleres || {}, getBlob: () => blobDe(buf, 'image/jpeg') };
}

const serveis = {
  console,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in propietats ? propietats[k] : null),
      setProperty: (k, v) => { propietats[k] = String(v); },
      deleteProperty: (k) => { delete propietats[k]; },
      getProperties: () => Object.assign({}, propietats)
    })
  },
  CacheService: {
    getScriptCache: () => {
      const viu = (k) => cau[k] && cau[k].exp > Date.now();
      return {
        get: (k) => (viu(k) ? cau[k].v : null),
        put: (k, v, s) => { if (String(v).length > 100000) throw new Error('Argument too large'); cau[k] = { v: String(v), exp: Date.now() + (s || 600) * 1000 }; },
        putAll: (o, s) => { Object.keys(o).forEach((k) => { cau[k] = { v: String(o[k]), exp: Date.now() + (s || 600) * 1000 }; }); },
        getAll: (claus) => { const r = {}; claus.forEach((k) => { if (viu(k)) r[k] = cau[k].v; }); return r; },
        remove: (k) => { delete cau[k]; }
      };
    }
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    base64Encode: (b) => (typeof b === 'string' ? Buffer.from(b) : deSignat(b)).toString('base64'),
    base64Decode: (s) => aSignat(Buffer.from(s, 'base64')),
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (alg, text) => aSignat(crypto.createHash(alg).update(String(text)).digest()),
    formatDate: (d) => new Date(d.getTime() + 3600e3).toISOString().substr(0, 10),
    sleep: () => {}
  },
  Session: { getEffectiveUser: () => ({ getEmail: () => ADMIN }), getActiveUser: () => ({ getEmail: () => '' }) },
  ScriptApp: {
    getOAuthToken: () => 'testoken',
    getScriptId: () => 'script-de-proves',
    getProjectTriggers: () => [],
    newTrigger: () => { const t = { timeBased: () => t, everyMinutes: () => t, everyHours: () => t, create: () => t }; return t; }
  },
  MailApp: {
    sendEmail: (o) => {
      correus.push(o);
      const codi = (o.subject.match(/(\d{6})/) || [])[1];
      console.log('\n📧 Correu per a ' + o.to + ' → codi ' + codi + '\n');
    }
  },
  DriveApp: {
    createFolder: (nom) => { const c = { id: nouIdDrive(), name: nom, parent: null }; carpetes[c.id] = c; return objCarpeta(c); },
    getFolderById: (id) => { if (!carpetes[id]) throw new Error('No folder ' + id); return objCarpeta(carpetes[id]); },
    getFileById: (id) => { if (!fitxers[id]) throw new Error('No file ' + id); return objFitxer(fitxers[id]); }
  },
  UrlFetchApp: {
    fetch: (url, o) => {
      o = o || {};
      const metode = (o.method || 'get').toLowerCase();
      const capc = o.headers || {};
      if (url.indexOf('https://www.googleapis.com/upload/drive/v3/files') === 0 && metode === 'post') {
        const meta = JSON.parse(o.payload);
        const sid = nouIdDrive();
        pujades[sid] = { meta, mime: capc['X-Upload-Content-Type'], total: +capc['X-Upload-Content-Length'], parts: [] };
        return resposta(200, '', { Location: 'mock://pujada/' + sid });
      }
      if (url.indexOf('mock://pujada/') === 0) {
        const p = pujades[url.split('/').pop()];
        const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(capc['Content-Range']);
        p.parts.push(deSignat(o.payload));
        if (+m[2] + 1 >= p.total) {
          const f = { id: nouIdDrive(), name: p.meta.name, mime: p.mime, data: Buffer.concat(p.parts), parent: p.meta.parents[0], trashed: false };
          fitxers[f.id] = f;
          return resposta(200, { id: f.id, name: f.name, mimeType: f.mime, size: String(f.data.length) });
        }
        return resposta(308, '');
      }
      if (url.indexOf('https://www.googleapis.com/drive/v3/files?') === 0) {
        const q = decodeURIComponent((/[?&]q=([^&]*)/.exec(url) || [])[1] || '');
        const pares = []; q.replace(/'([^']+)' in parents/g, (x, id) => pares.push(id));
        const carpeta = /mimeType = 'application\/vnd.google-apps.folder'/.test(q);
        const res = [];
        if (carpeta) Object.values(carpetes).forEach((c) => { if (pares.indexOf(c.parent) >= 0) res.push({ id: c.id, name: c.name, parents: [c.parent] }); });
        else Object.values(fitxers).forEach((f) => { if (!f.trashed && pares.indexOf(f.parent) >= 0 && /^image\//.test(f.mime)) res.push({ id: f.id, name: f.name, mimeType: f.mime, size: String(f.data.length), parents: [f.parent], createdTime: f.creat || new Date().toISOString(), thumbnailLink: 'https://miniatura.prova/' + f.id + '=s220' }); });
        return resposta(200, { files: res });
      }
      if (url.indexOf('https://miniatura.prova/') === 0) {
        const f = fitxers[url.split('/').pop().replace(/=s\d+$/, '')];
        return f ? resposta(200, f.data) : resposta(404, '');
      }
      const m = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?(.*)$/.exec(url);
      if (m) {
        const f = fitxers[m[1]];
        if (!f) return resposta(404, { error: 'notFound' });
        if (m[2].indexOf('alt=media') >= 0) {
          const r = /bytes=(\d+)-(\d+)/.exec(capc.Range || '');
          const tros = r ? f.data.subarray(+r[1], +r[2] + 1) : f.data;
          return resposta(r ? 206 : 200, Buffer.from(tros));
        }
        return resposta(200, {});
      }
      return resposta(404, 'no imitat: ' + url);
    }
  },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (s) => ({ text: s, setMimeType() { return this; } })
  }
};

/* ---------------- Carrega el codi real d'Apps Script ---------------- */
// Com Apps Script: cada fitxer és un script separat, carregat en l'ordre de la guia.
const context = vm.createContext(Object.assign({}, serveis));
const dirGs = path.join(ARREL, 'apps-script');
const ORDRE = ['Codi.gs', 'Dades.gs', 'Acces.gs', 'Mitjans.gs', 'Pantalles.gs', 'Instal.gs'];
const tots = fs.readdirSync(dirGs).filter((f) => f.endsWith('.gs'));
tots.filter((f) => ORDRE.indexOf(f) < 0 && f !== 'Carregador.gs').forEach((f) => ORDRE.push(f)); // el carregador (codi de GitHub) no s'usa en proves
ORDRE.forEach((f) => vm.runInContext(fs.readFileSync(path.join(dirGs, f), 'utf8'), context, { filename: f }));
vm.runInContext('globalThis.__doPost = doPost; globalThis.__installar = installar; globalThis.__revisaBustia = revisaBustia; globalThis.__revisaArxiu = revisaArxiu;', context);
context.__installar();

/* ---------------- Servidor HTTP ---------------- */
const TIPUS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8' };

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname === '/api' && req.method === 'POST') {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      setTimeout(() => {
        let sortida;
        try { sortida = context.__doPost({ postData: { contents: Buffer.concat(parts).toString('utf8') } }).text; }
        catch (e) { console.error(e); sortida = JSON.stringify({ ok: false, error: String(e) }); }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(sortida);
      }, LENT);
    });
    return;
  }
  if (url.pathname === '/__correus') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(correus)); }
  if (url.pathname === '/__bustia' && req.method === 'POST') { // simula deixar un fitxer a la bústia
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      const f = { id: nouIdDrive(), name: url.searchParams.get('nom') || 'foto.png', mime: url.searchParams.get('mime') || 'image/png', data: Buffer.concat(parts), parent: propietats.carpeta_bustia, trashed: false };
      fitxers[f.id] = f;
      res.end(JSON.stringify({ id: f.id }));
    });
    return;
  }
  if (url.pathname === '/__revisaBustia') { context.__revisaBustia(); return res.end('ok'); }
  if (url.pathname === '/__arxiu' && req.method === 'POST') { // simula que un curs deixa una foto a «Per penjar»
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      const ARXIU = '1KkrEu-HGS2cpbuxBXEUYH5n0Sr_ZBhwg';
      if (!carpetes[ARXIU]) carpetes[ARXIU] = { id: ARXIU, name: 'Arxiu fotogràfic', parent: null };
      const fill = (pare, nom) => { let c = Object.values(carpetes).find((x) => x.parent === pare && x.name === nom); if (!c) { c = { id: nouIdDrive(), name: nom, parent: pare }; carpetes[c.id] = c; } return c.id; };
      const etapa = fill(ARXIU, url.searchParams.get('etapa') || 'Primària');
      const curs = fill(etapa, url.searchParams.get('curs') || '4t de primària');
      const perPenjar = fill(curs, 'Per penjar');
      const f = { id: nouIdDrive(), name: url.searchParams.get('nom') || 'foto.jpg', mime: 'image/jpeg', data: Buffer.concat(parts), parent: perPenjar, trashed: false };
      fitxers[f.id] = f;
      res.end(JSON.stringify({ id: f.id }));
    });
    return;
  }
  if (url.pathname === '/__buida') { // simula que el fitxer de dades queda buit
    fitxers[propietats.fitxer_bd].data = Buffer.from('');
    Object.keys(cau).forEach((k) => delete cau[k]);
    return res.end('ok');
  }
  if (url.pathname === '/__revisaArxiu') { context.__revisaArxiu(); return res.end('ok'); }
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': TIPUS['.js'], 'Cache-Control': 'no-store' });
    return res.end('window.PANTALLES_CONFIG = { apiUrl: "http://' + req.headers.host + '/api" };');
  }
  let fitxer = path.normalize(path.join(ARREL, decodeURIComponent(url.pathname)));
  if (!fitxer.startsWith(ARREL)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(fitxer) && fs.statSync(fitxer).isDirectory()) fitxer = path.join(fitxer, 'index.html');
  if (!fs.existsSync(fitxer)) { res.writeHead(404); return res.end('No trobat'); }
  res.writeHead(200, { 'Content-Type': TIPUS[path.extname(fitxer)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fitxer).pipe(res);
});

servidor.listen(PORT, () => {
  console.log('Pantalles (proves) → http://localhost:' + PORT + '/');
  console.log('  Panell:    http://localhost:' + PORT + '/panell/   (entra amb ' + ADMIN + ')');
  console.log('  Pantalla:  http://localhost:' + PORT + '/pantalla/');
});
