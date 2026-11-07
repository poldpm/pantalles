# Instruccions per a Claude Code

## Sincronització amb GitHub: automàtica, sempre

En Pol treballa des de diversos ordinadors (la torre, portàtils, el mòbil).
GitHub és l'única còpia que veuen tots. Per tant, **sense que ho demani**:

- **En començar** qualsevol conversa: `git pull` abans de tocar res. Si hi ha
  canvis locals sense desar o un conflicte, atura't i explica-li-ho.
- **En acabar cada canvi** (fet i comprovat): commit amb un missatge clar en
  català i `git push`. No cal preguntar-ho.
- ⚠ Aquest repositori publica una web (GitHub Pages): **el push la publica** i
  les pantalles de les recepcions s'actualitzen soles (el reproductor carrega el
  codi nou). Push només quan el canvi està acabat i verificat, mai a mig fer.
- Si el pull o el push fallen, digues-ho clarament: si no, el canvi es queda
  en un sol ordinador i en Pol no ho sabrà.

## Què és

Sistema de cartelleria digital (digital signage) de l'escola Vedruna Escorial Vic.
Substitueix el NovoDS Studio (Vivitek). Ho porta una persona no tècnica: tot
ha de ser en català, clar i sense sorpreses.

## Arquitectura

- `apps-script/*.gs`: backend a Google Apps Script, desplegat com a aplicació web
  («Executa com: jo», «Qualsevol usuari»). Una sola acció per petició:
  `POST {action, ...}` amb `Content-Type: text/plain` (evita el preflight CORS).
  - Les dades són a `dades.json` al Drive (bloqueig amb `LockService` i memòria cau en trossos).
  - Les miniatures són a `miniatures.json`.
  - Hi ha còpia diària a la carpeta «Còpies de seguretat».
  - Els fitxers es pugen i es baixen **per trossos de 2 MB** amb l'API REST del Drive
    (pujada reanudable i `Range`), perquè són privats i no tenen enllaç públic.
  - Accés al panell: codi de 6 xifres per correu (`MailApp`) i sessió de 30 dies a `ScriptProperties`.
    Rols `admin` / `editor`.
  - Pantalles: vinculació amb codi (`pairStart` / `pairCheck` / `pairScreen`) i un token per pantalla.
    `sync` cada ~30 s envia l'estat i rep la configuració si `rev` ha canviat, i les ordres
    (`reload`, `identify`, `clearcache`).
- `pantalla/`: reproductor. JS ES5 (sense arrow functions) per compatibilitat amb
  navegadors de tele antics.
  - Guarda la configuració i els fitxers a IndexedDB i té un service worker:
    continua funcionant sense xarxa.
  - Avalua la programació amb l'hora de l'escola (`Europe/Madrid` + desfasament del servidor).
  - Té un vigilant que es recupera si s'encalla i es recarrega cada dia a les 4 h.
- `panell/`: SPA vanilla JS. Desa automàticament, amb control de conflictes per llista (`v`).
  - Converteix els PDF en imatges amb pdf.js, redueix les fotos a 2560 px i fa les miniatures al navegador.
- `comu/`: `api.js` (client, horaris, utilitats), `diapos.js/css` (diapositives de text,
  rellotge i compte enrere, compartides entre panell i reproductor), `vendor/` (llibreries
  incloses: no depenem de CDN).
- `config.js`: l'URL `/exec` d'Apps Script. És l'únic que cal configurar.

## Provar

- `node eines/servidor-proves.js`: executa el codi real de `apps-script/` dins Node amb
  imitacions dels serveis de Google i serveix la web a http://localhost:8080.
- `node eines/prova-e2e.js <carpeta-fitxers> [carpeta-captures]`: recorregut complet amb
  Playwright (vincular, pujar, programar, avisos, sense xarxa, mòbil, bústia).
  **Ha de passar sencera abans de cada push.**
- Si canvies `apps-script/`: el servei executa sempre el codi de GitHub (`Carregador.gs` el baixa, el desa al Drive i el posa en marxa amb `eval`; `Carregador.gs` i `appsscript.json` NO s'actualitzen sols: evita canviar-los). En fer push,
  el workflow `.github/workflows/actualitza-servei.yml` crida l'acció pública `selfUpdate`. Si el workflow
  no s'executa, crida-la tu mateix: `curl -sSL -d '{"action":"selfUpdate"}' <URL de config.js>`.
  Un fitxer .gs nou s'ha d'afegir a `apps-script/fitxers.json`. Puja `VERSIO_APP` (Dades.gs) i
  `VERSIO_SERVEI` (panell.js) quan el panell depengui de canvis del servei.
