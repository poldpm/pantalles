#!/usr/bin/env node
/* =====================================================================
 *  PANTALLES · Prova completa amb navegador real (Playwright)
 *    node eines/prova-e2e.js <carpeta-amb-fitxers-de-prova> [carpeta-captures]
 *  Engega el servidor de proves, obre una «pantalla» i el panell, i fa
 *  tot el recorregut: entrar, vincular, pujar, llistes, avisos…
 * ===================================================================== */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const FITXERS = path.resolve(process.argv[2] || '.');
const CAPTURES = process.argv[3] ? path.resolve(process.argv[3]) : null;
const PORT = 8093;
const BASE = 'http://localhost:' + PORT;
let errors = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) errors++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'servidor-proves.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.once('data', r));
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const nav = await chromium.launch({ proxy });
  const captura = async (pag, nom) => { if (CAPTURES) await pag.screenshot({ path: path.join(CAPTURES, nom + '.png') }); };
  try {
    /* ---------- 1. La pantalla nova mostra un codi ---------- */
    console.log('Pantalla nova');
    const ctxTv = await nav.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
    const tv = await ctxTv.newPage();
    const errorsTv = [];
    tv.on('pageerror', (e) => errorsTv.push(e.message));
    await tv.goto(BASE + '/pantalla/?_sync=3');
    await tv.waitForSelector('.sistema .codi', { timeout: 10000 });
    const codi = (await tv.textContent('.sistema .codi')).replace(/\D/g, '');
    ok(/^\d{6}$/.test(codi), 'mostra el codi de vinculació ' + codi);
    await captura(tv, '01-pantalla-codi');

    /* ---------- 2. Entrar al panell ---------- */
    console.log('Panell: entrada');
    const ctxP = await nav.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, deviceScaleFactor: 1 });
    const p = await ctxP.newPage();
    const errorsP = [];
    p.on('pageerror', (e) => errorsP.push(e.message));
    await p.goto(BASE + '/panell/');
    await p.fill('#correu', 'admin@escola.cat');
    await captura(p, '02-panell-entrada');
    await p.click('#form-correu button');
    await p.waitForSelector('#form-codi:not([hidden])');
    const correus = await (await fetch(BASE + '/__correus')).json();
    const codiCorreu = correus[correus.length - 1].subject.match(/\d{6}/)[0];
    await p.fill('#codi', '000000'); // primer, un codi dolent
    await p.waitForFunction(() => document.querySelector('#login-error').textContent.length > 0);
    ok((await p.textContent('#login-error')).includes('incorrecte'), 'rebutja un codi incorrecte');
    await p.fill('#codi', codiCorreu);
    await p.waitForSelector('#app:not([hidden])', { timeout: 10000 });
    ok(await p.isVisible('.salutacio'), 'entra al panell amb el codi del correu');

    /* ---------- 3. Vincular la pantalla ---------- */
    console.log('Vinculació');
    await p.click('a[data-sec=pantalles]');
    await p.click('[data-accio=afegir]');
    await p.fill('[data-codi]', codi);
    await p.fill('[data-nom]', 'Recepció principal');
    await p.fill('[data-lloc]', 'Entrada c/ Escorial');
    await p.click('[data-vincula]');
    await p.waitForFunction(() => location.hash.indexOf('#pantalla/') === 0, null, { timeout: 10000 });
    ok(true, 'pantalla vinculada des del panell');
    await tv.waitForSelector('.sistema .hora-gran', { timeout: 15000 });
    ok(true, 'la pantalla passa a mostrar l\'hora (encara sense contingut)');

    /* ---------- 4. Llista i pujada de fitxers ---------- */
    console.log('Llista i fitxers');
    await p.click('a[data-sec=llistes]');
    await p.click('[data-accio=nova]');
    await p.fill('[data-nom]', 'Activitats del trimestre');
    await p.click('[data-crea]');
    await p.waitForSelector('[data-zona]');
    const fitxers = ['foto1.jpg', 'foto2.jpg', 'foto3.jpg', 'canva.pdf', 'video.webm'].map((f) => path.join(FITXERS, f)).filter((f) => fs.existsSync(f));
    const [tria] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-afegeix=pujar]')]);
    await tria.setFiles(fitxers);
    await p.waitForFunction(() => document.querySelectorAll('[data-items] .item').length >= 6, null, { timeout: 60000 });
    const n = await p.$$eval('[data-items] .item', (e) => e.length);
    ok(n === 6, 'pujats 3 fotos + PDF de 2 pàgines + vídeo → ' + n + ' elements a la llista');
    const media = await p.evaluate(() => window.__panell.S.d.media.map((m) => [m.name, m.w, m.h, m.size]));
    ok(media.every((m) => Math.max(m[1], m[2]) <= 2560 || m[0].endsWith('.webm')), 'les fotos grans s\'han reduït (màx. 2560 px): ' + media.map((m) => m[1] + '×' + m[2]).join(', '));
    await espera(4500); // que s'amagui el quadre de pujades
    await captura(p, '04-llista');

    // Afegir una diapositiva de text
    await p.click('[data-afegeix=text]');
    await p.fill('[data-t=title]', 'Benvinguts!');
    await p.fill('[data-t=body]', 'Avui és **dia de portes obertes**\n- Visites guiades a les 17 h\n- Xocolatada al pati');
    await captura(p, '05-editor-text');
    await p.click('[data-ok]');
    await p.waitForFunction(() => document.querySelectorAll('[data-items] .item').length === 7);
    await p.waitForFunction(() => document.querySelector('#indicador').textContent.includes('desat'), null, { timeout: 10000 });
    ok(true, 'afegida i desada una diapositiva de text');

    // Programar un element per a dates passades → no s'ha de mostrar
    await p.click('[data-items] .item:nth-child(3) [data-edita]');
    await p.click('label:has(input[name=h-mode][value=prog]) span');
    await p.fill('[data-h=from]', '2025-01-01');
    await p.fill('[data-h=to]', '2025-01-31');
    await p.click('[data-ok]');
    await p.waitForSelector('[data-items] .item.caducat');
    ok(true, 'un element programat en dates passades queda marcat com a caducat');

    /* ---------- 5. La pantalla mostra el contingut ---------- */
    console.log('Reproducció');
    await tv.waitForSelector('.capa.visible img.mitja, .capa.visible .dp, .capa.visible video', { timeout: 30000 });
    ok(true, 'la pantalla mostra contingut');
    await tv.waitForFunction(() => { const c = window.__pantalla.config(); return c && c.items.some((i) => i.schedule); }, null, { timeout: 20000 });
    const vistos = new Set();
    for (let i = 0; i < 14; i++) {
      await tv.evaluate(() => window.__pantalla.seguent());
      await espera(1500);
      const e = await tv.evaluate(() => window.__pantalla.estat());
      vistos.add(e.item);
    }
    ok(!vistos.has('foto3.jpg'), 'no mostra l\'element caducat');
    ok(vistos.has('Benvinguts!'), 'mostra la diapositiva de text');
    ok([...vistos].some((v) => /pàg\. 2/.test(v)), 'mostra les pàgines del PDF');
    await tv.evaluate(() => window.__pantalla.seguent());
    while (!(await tv.evaluate(() => window.__pantalla.estat().item)).startsWith('Benvinguts')) { await tv.evaluate(() => window.__pantalla.seguent()); await espera(1300); }
    await espera(1200);
    await captura(tv, '06-pantalla-text');
    while (!(await tv.evaluate(() => window.__pantalla.estat().item)).startsWith('foto1')) { await tv.evaluate(() => window.__pantalla.seguent()); await espera(1300); }
    await espera(1200);
    await captura(tv, '07-pantalla-foto');

    /* ---------- 6. Configuració de la pantalla: rellotge i cinta ---------- */
    console.log('Superposicions');
    await p.click('a[data-sec=avisos]');
    await p.click('[data-accio=afegir-cinta]');
    await p.fill('[data-cinta] [data-text]', 'Dimecres 12: jornada de portes obertes de 17 a 19 h');
    await p.waitForFunction(() => document.querySelector('#indicador').textContent.includes('desat'), null, { timeout: 10000 });
    await p.goto(BASE + '/panell/#pantalles');
    await p.click('.t-pantalla a.btn');
    await p.check('[data-o=clock]');
    await p.waitForFunction(() => document.querySelector('#indicador').textContent.includes('desat'), null, { timeout: 10000 });
    await tv.waitForSelector('.sup-rellotge', { timeout: 15000 });
    await tv.waitForSelector('.sup-cinta', { timeout: 15000 });
    ok(true, 'la pantalla mostra el rellotge i la cinta de missatges');
    await espera(2500);
    await captura(tv, '08-pantalla-rellotge-cinta');
    await captura(p, '09-config-pantalla');

    /* ---------- 7. Avís urgent ---------- */
    console.log('Avís urgent');
    await p.click('a[data-sec=inici]');
    await p.click('[data-accio=urgent]');
    await p.fill('[data-a=title]', 'Simulacre d\'evacuació');
    await p.fill('[data-a=text]', 'Sortiu en ordre cap al punt de trobada del pati.');
    await captura(p, '10-nou-avis');
    await p.click('[data-ok]');
    await tv.waitForSelector('.avis-complet', { timeout: 15000 });
    ok(true, 'l\'avís apareix a pantalla completa');
    await espera(1200);
    await captura(tv, '11-pantalla-avis');
    await p.goto(BASE + '/panell/#inici');
    await p.waitForSelector('[data-atura]');
    await captura(p, '03-inici');
    await p.click('[data-atura]');
    await tv.waitForSelector('.avis-complet', { state: 'detached', timeout: 15000 });
    ok(true, 'en aturar-lo, desapareix');

    /* ---------- 8. Sense xarxa: continua funcionant ---------- */
    console.log('Sense xarxa');
    await ctxTv.setOffline(true);
    await tv.reload().catch(() => {});
    await tv.waitForSelector('.capa.visible', { timeout: 20000 }).catch(() => {});
    const capa = await tv.$('.capa.visible');
    ok(!!capa, 'sense xarxa i després de recarregar, continua mostrant el contingut guardat');
    await ctxTv.setOffline(false);

    /* ---------- 9. Vista prèvia i mòbil ---------- */
    console.log('Vista prèvia i mòbil');
    await p.goto(BASE + '/panell/#pantalles');
    await p.click('.t-pantalla [data-previa]');
    const marc = p.frameLocator('.marc-previa iframe');
    await marc.locator('.capa.visible').first().waitFor({ timeout: 20000 });
    ok(true, 'la vista prèvia del panell mostra el contingut de la pantalla');
    await espera(1500);
    await captura(p, '12-vista-previa');
    await p.keyboard.press('Escape');

    const ctxM = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
    const m = await ctxM.newPage();
    await m.goto(BASE + '/panell/');
    await m.evaluate(([s, u]) => { localStorage.setItem('pnt_session', s); localStorage.setItem('pnt_user', u); }, await p.evaluate(() => [localStorage.getItem('pnt_session'), localStorage.getItem('pnt_user')]));
    await m.reload();
    await m.waitForSelector('.salutacio');
    await espera(600);
    const ample = await m.evaluate(() => document.documentElement.scrollWidth);
    ok(ample <= 390, 'al mòbil no hi ha desplaçament horitzontal (' + ample + ' px)');
    await captura(m, '13-mobil-inici');
    await m.goto(BASE + '/panell/#biblioteca');
    await m.waitForSelector('.mitja');
    await captura(m, '14-mobil-biblioteca');
    await m.goto(BASE + '/panell/#llistes');
    await m.click('.t-llista');
    await m.waitForSelector('[data-items] .item');
    const ample2 = await m.evaluate(() => document.documentElement.scrollWidth);
    ok(ample2 <= 390, 'l\'editor de llista cap al mòbil (' + ample2 + ' px)');
    await captura(m, '15-mobil-llista');

    /* ---------- 10. Bústia del Drive ---------- */
    console.log('Bústia');
    await fetch(BASE + '/__bustia?nom=bustia.jpg&mime=image/jpeg', { method: 'POST', body: fs.readFileSync(path.join(FITXERS, 'foto2.jpg')) });
    await p.goto(BASE + '/panell/#biblioteca');
    await p.click('[data-accio=bustia]');
    await p.click('[data-importa]');
    await p.waitForFunction(() => window.__panell.S.d.media.some((x) => x.name === 'bustia.jpg'), null, { timeout: 15000 });
    ok(true, 'importa fitxers de la bústia del Drive');
    await captura(p, '16-biblioteca');

    ok(errorsTv.length === 0, 'cap error de JavaScript a la pantalla' + (errorsTv.length ? ': ' + errorsTv.join(' | ') : ''));
    ok(errorsP.length === 0, 'cap error de JavaScript al panell' + (errorsP.length ? ': ' + errorsP.join(' | ') : ''));
  } catch (e) {
    console.error('✗ Error inesperat:', e);
    try {
      for (const pg of nav.contexts().flatMap((c) => c.pages())) {
        console.error('  pàgina', pg.url(), '\n   ', (await pg.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').substr(0, 600));
      }
    } catch (e2) { /* res */ }
    errors++;
  } finally {
    await nav.close();
    srv.kill();
  }
  console.log(errors ? '\n✗ ' + errors + ' proves han fallat' : '\n✓ Totes les proves han passat');
  process.exit(errors ? 1 : 0);
})();
