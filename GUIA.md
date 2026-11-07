# Guia de Pantalles

Aquesta guia té tres parts:

1. **[Posar-ho en marxa](#1-posar-ho-en-marxa-una-sola-vegada)**: es fa una sola vegada i triga uns 30 minuts.
2. **[Connectar cada tele](#2-connectar-cada-tele)**.
3. **[Fer-lo servir cada dia](#3-fer-lo-servir-cada-dia)**: per a la persona que porta les pantalles.

Al final hi ha la secció de [problemes freqüents](#4-problemes-freqüents).

---

## Com funciona (en una imatge)

```
  📱💻 Panell (mòbil, ordinador de casa o de la feina)
          │  puges fotos, vídeos, PDF del Canva, textos, avisos…
          ▼
  ☁️ Google (Apps Script + Drive de l'escola)  ← guarda tot de manera privada
          ▲
          │  cada 30 segons: «hi ha res nou?»
  📺 Cada pantalla (un navegador a pantalla completa)
       └─ guarda el contingut: si cau la xarxa, continua mostrant-lo
```

- **No cal cap ordinador encès** a l'escola. L'ordinador de direcció ja no hi intervé.
- **No cal cap servidor propi** ni cap empresa externa.
- **Cost: 0 €.** Fa servir Google (Apps Script i Drive) i GitHub Pages, que són gratuïts.
- **Si cau la xarxa**, les pantalles continuen mostrant el contingut que tenien guardat.

---

## 1. Posar-ho en marxa (una sola vegada)

### Pas 1 · Crear el servei a Google (Apps Script)

> 💡 És millor fer-ho amb **un compte de l'escola** (per exemple el de la persona que porta les pantalles, o un compte genèric tipus `pantalles@…`). Tot el que es pugi quedarà al Drive d'aquest compte.

1. Entra a **https://script.google.com** amb aquest compte → **Projecte nou**.
2. A dalt, canvia el nom «Projecte sense títol» per **Pantalles**.
3. A l'esquerra hi ha un fitxer anomenat `Codi.gs`. Esborra'n tot el contingut i enganxa-hi el del fitxer [`apps-script/Codi.gs`](apps-script/Codi.gs).
4. Crea els altres fitxers amb el botó **＋ → Script**. Posa'ls exactament aquests noms (sense `.gs`, ja l'afegeix sol) i enganxa-hi el contingut corresponent:
   - `Dades` ← [`apps-script/Dades.gs`](apps-script/Dades.gs)
   - `Acces` ← [`apps-script/Acces.gs`](apps-script/Acces.gs)
   - `Mitjans` ← [`apps-script/Mitjans.gs`](apps-script/Mitjans.gs)
   - `Pantalles` ← [`apps-script/Pantalles.gs`](apps-script/Pantalles.gs)
   - `Instal` ← [`apps-script/Instal.gs`](apps-script/Instal.gs)
5. Ves a ⚙ **Configuració del projecte** (a l'esquerra) → marca **«Mostra el fitxer de manifest "appsscript.json" a l'editor»**. Torna a l'editor, obre `appsscript.json` i substitueix-ne el contingut pel de [`apps-script/appsscript.json`](apps-script/appsscript.json).
6. Desa (icona del disquet o `Ctrl+S`).
7. A la barra de dalt, tria la funció **`installar`** i prem **▶ Executa**.
   - Et demanarà permisos: **Revisa els permisos** → tria el compte.
   - Si surt «Google no ha verificat aquesta aplicació», és normal perquè l'has creada tu: **Configuració avançada → Ves a Pantalles (no segur)** → **Permet**.
   - Al registre de sota hauria de sortir «✅ Instal·lat». Al Drive s'ha creat la carpeta **«Pantalles de l'escola (no esborrar)»**.
8. Prem **Implementa → Nova implementació**:
   - A la roda dentada ⚙ de «Selecciona el tipus», tria **Aplicació web**.
   - **Executa com a:** *Jo*.
   - **Qui hi té accés:** *Qualsevol usuari*. Les pantalles no inicien sessió a Google. La seguretat la porta el sistema: cada pantalla té una clau pròpia i el panell demana un codi enviat al correu.
   - **Implementa** → copia l'**URL de l'aplicació web** (acaba en `/exec`).

> ⚠ Si a «Qui hi té accés» no surt l'opció *Qualsevol usuari*, l'administrador de Google Workspace de l'escola no permet compartir fora del domini. Cal demanar-li que ho permeti per a aquest projecte. Ho has de saber abans de continuar.

### Pas 2 · Publicar la web (GitHub Pages)

1. Crea un repositori a GitHub anomenat **`pantalles`** amb tots aquests fitxers. Ha de ser públic: el codi no conté cap secret ni cap foto.
2. Edita el fitxer **`config.js`** i enganxa l'URL del pas anterior:
   ```js
   window.PANTALLES_CONFIG = {
     apiUrl: 'https://script.google.com/macros/s/XXXXXXXX/exec'
   };
   ```
3. Al repositori: **Settings → Pages → Branch: `main` / `(root)` → Save**. En un minut tindràs:
   - **Panell:** `https://<usuari>.github.io/pantalles/panell/`
   - **Reproductor de les pantalles:** `https://<usuari>.github.io/pantalles/pantalla/`

### Pas 3 · Primera entrada i persones

1. Obre el **panell** i entra amb el correu del compte del pas 1. Rebràs un codi de 6 xifres.
2. Ves a **Ajustos**:
   - Posa el **nom de l'escola**, el color i el **logotip**. El logotip s'ha de pujar primer a la Biblioteca.
   - A **Persones amb accés**, afegeix els correus de les persones que han de gestionar les pantalles (2–5). Tria **Editor/a** o **Administrador/a**.
3. Opcional: al panell, des del mòbil, *Compartir → Afegir a la pantalla d'inici*. Així el tindràs com una app.

### Actualitzacions automàtiques (configuració d'una sola vegada)

Un cop fet això, el servei de Google **s'actualitza sol a l'instant** cada vegada que es publica un canvi a GitHub. Ja no caldrà tornar a copiar fitxers.

1. Entra a **https://script.google.com/home/usersettings** amb el mateix compte i activa **«API de Google Apps Script»**.
2. A l'editor del projecte **Pantalles**, actualitza per darrera vegada el codi a mà:
   - Substitueix el contingut de `Codi`, `Dades`, `Acces`, `Mitjans`, `Pantalles`, `Instal` i `appsscript.json` pels de la carpeta [`apps-script/`](apps-script/).
   - Crea un fitxer nou (**＋ → Script**) anomenat **`Actualitza`** i enganxa-hi [`apps-script/Actualitza.gs`](apps-script/Actualitza.gs).
3. Desa, tria la funció **`installar`** i prem **▶ Executa**. Et demanarà permisos nous (gestionar els projectes i les implementacions d'Apps Script): accepta'ls.
4. **Implementa → Gestiona les implementacions → ✎ → Versió: «Versió nova» → Implementa**. L'adreça es manté.

A **Ajustos → Servei de Google** del panell es veu la versió i l'última actualització, i hi ha dos botons: **Actualitza ara** i **Torna a la versió anterior**, per si alguna actualització no anés bé.

Com funciona: quan es publica un canvi a la carpeta `apps-script/`, GitHub avisa el servei. El servei llegeix el codi de la branca principal del repositori (mai d'enlloc més), el copia, en fa una versió nova i la posa en marxa a la mateixa adreça. Si troba un error, es queda la versió que hi havia. A més, cada hora comprova que estigui al dia.

---

## 2. Connectar cada tele

Una pantalla és **qualsevol aparell amb navegador connectat a la tele**. Només cal que obri aquesta adreça:

```
https://<usuari>.github.io/pantalles/pantalla/
```

1. A la tele surt **«Pantalla nova»** i un **codi de 6 xifres**.
2. Al panell: **Pantalles → ＋ Afegir pantalla** → escriu el codi, el nom («Recepció principal») i tria què ha de mostrar.
3. En pocs segons la tele comença a mostrar el contingut. Ja no cal tocar-la més.

Si a la tele no es pot escriure l'adreça, des de **Afegir pantalla → «Fes servir un enllaç»** obtens un enllaç i un **codi QR**.

### Quin aparell fer servir (de més barat a menys)

| Opció | Cost | Comentari |
|---|---|---|
| **Ordinador vell de l'escola** (portàtil o sobretaula) connectat per HDMI | 0 € | La més fiable si n'hi ha cap al calaix. Vegeu sota com fer que arrenqui sol. |
| **La mateixa Smart TV** (navegador intern) | 0 € | Funciona, però moltes teles no obren el navegador soles en encendre's, i cada matí caldria obrir-lo amb el comandament. |
| **Reproductors Vivitek actuals** | 0 € | Cal comprovar a l'escola si el NovoDS Studio permet afegir una «pàgina web / URL». Si ho permet, es publica **una última vegada** un projecte que només conté aquesta adreça a pantalla completa, i ja no s'ha de tornar a obrir el programa. |
| **Chromecast amb Google TV / Android TV box** | ~30 € | Només si no hi ha cap altra opció. Amb una app de navegador en mode quiosc (per exemple *Fully Kiosk Browser*) arrenca sola. |

**Ordinador amb Windows que arrenqui sol amb la pantalla:**

1. Instal·la Google Chrome.
2. Crea una drecera amb aquest destí (tot en una línia):
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required --disable-session-crashed-bubble --noerrdialogs https://<usuari>.github.io/pantalles/pantalla/
   ```
3. Prem `Win+R`, escriu `shell:startup` i copia-hi la drecera.
4. Configura Windows perquè no s'adormi ni apagui la pantalla (*Configuració → Sistema → Inici/apagada*) i, si pot ser, perquè entri a la sessió sense contrasenya.
5. Per sortir del mode quiosc: `Alt+F4`.

**Comandament o teclat davant de la pantalla:**
- `OK` / `Enter` / clic: pantalla completa.
- `→` / `←`: diapositiva següent o anterior (per comprovar coses).
- `I`: informació de la pantalla (connexió, fitxers guardats, errors).

---

## 3. Fer-lo servir cada dia

### Pujar una presentació del Canva

1. Al Canva: **Comparteix → Baixa** i tria:
   - **PDF**: el més còmode. **Cada pàgina es converteix en una diapositiva.**
   - **MP4**: si vols conservar les animacions. Es mostra com un vídeo.
   - **PNG/JPG**: imatges soltes.
2. Al panell: **Llistes →** la llista que vulguis **→ ⇪ Pujar fitxers**. També pots arrossegar els fitxers a la llista.
3. Ja està: en menys d'un minut es veu a les pantalles d'aquesta llista.

### Diapositives amb el disseny de l'escola

No cal fer-ho tot amb el Canva. A una llista, **Aa Text** crea una diapositiva amb la imatge de Vedruna Escorial Vic (granat i vermell, Titillium Web, vores rectes i el tall a 45°). N'hi ha quatre dissenys:

| Disseny | Per a què |
|---|---|
| **Avís destacat** | Missatges importants. Fons granat. |
| **Informació** | Textos més llargs. Fons clar. |
| **Foto amb text** | Una foto de fons, amb el text en un bloc granat. |
| **Esdeveniment** | La data ben gran, amb l'hora i el lloc. |

També hi ha **🕒 Rellotge** i **⏳ Compte enrere**, amb el mateix estil.

A les **fotos i vídeos** s'hi pot posar un **peu de foto** (✎ → «Peu de foto»): surt en un bloc granat a baix a l'esquerra.

### Logotips (una sola vegada)

A **Ajustos** hi ha dos logotips. Primer s'han de pujar a la Biblioteca, millor en **SVG** o en **PNG amb fons transparent**:

- **Logotip en color**: per als fons clars (diapositives d'informació i d'esdeveniment).
- **Logotip en negatiu (blanc)**: per als fons granat i les fotos (avisos, pantalla d'espera, menú del panell i, si s'activa a la pantalla, a sobre de les fotos).

Fins que no es posin, en el seu lloc surt el nom «Vedruna Escorial Vic» en text.

### Organitzar el contingut

- **Llistes**: grups de contingut, per exemple «Activitats del trimestre», «Benvinguda», «Nadal». Cada llista es pot mostrar a una o més pantalles.
- Dins d'una llista:
  - arrossega **⠿** per canviar l'ordre;
  - l'**interruptor** encén o apaga un element sense esborrar-lo;
  - **✎** canvia la durada, la transició o la **programació**.
- **Programació**: un element (o una llista sencera) es pot programar:
  - per dates («del 27/10 al 31/10»);
  - per dies («dl, dc, dv»);
  - per hores («8:00–9:30»).

  Fora d'aquest horari no surt, i quan caduca desapareix sol.
- **Tipus de contingut**:
  - fotos, vídeos i PDF;
  - **diapositives de text** (avisos, benvingudes…), fetes al moment i sense el Canva;
  - **pàgines web**: una presentació de Google publicada, un full de càlcul publicat, una web de l'escola…;
  - **YouTube**;
  - **rellotge**;
  - **compte enrere** fins a un esdeveniment.

### Avisos urgents

**Inici → Avís urgent**: escriu el títol i tria l'estil (*urgent*, *informatiu* o *sobri*), a quines pantalles i quant de temps. Surt **per sobre de tot** en menys d'un minut. Per treure'l, prem **■ Atura**.

A **Avisos → Cinta de missatges** hi ha les frases curtes que passen per la part de baix de la pantalla.

### Comprovar què s'està mostrant

- **Inici** mostra:
  - l'estat de cada pantalla (🟢 en línia, 🟠 connexió irregular, 🔴 sense connexió);
  - què està mostrant;
  - avisos del que cal revisar: pantalles sense contingut, elements que caduquen avui…
- **▶ Vista prèvia** ensenya exactament el que es veu ara a aquella pantalla.
- **◎ Identifica** fa que la tele mostri el seu nom durant 20 segons (va bé per saber quina és quina).
- **Ajustos → Registre d'activitat**: qui ha canviat què i quan.

### La bústia del Drive (opcional)

Dins la carpeta del Drive hi ha la **Bústia**. Si s'hi deixen fotos o vídeos (per exemple des de l'app del Drive del mòbil), es poden importar des de **Biblioteca → 📥 Bústia del Drive**. Un administrador pot fer que s'afegeixin **sols** a una llista cada 10 minuts (**Ajustos → Bústia automàtica**).

---

## 4. Problemes freqüents

| Problema | Solució |
|---|---|
| No m'arriba el codi per entrar | Mira el correu brossa. Comprova que el teu correu és a *Ajustos → Persones amb accés*. |
| Una pantalla surt «Sense connexió» | La tele pot estar apagada o sense xarxa. Si està encesa, continua mostrant el contingut guardat. Quan torni la xarxa, s'actualitza sola. |
| He fet un canvi i no surt | Espera 1 minut. Comprova a la llista que l'element està encès i que «Ara actiu» surt en verd. Fes servir la **Vista prèvia**. |
| Una pàgina web surt en blanc | Aquella web no deixa que la mostrin dins d'una altra pàgina (passa amb Google, Instagram, diaris…). Fes-ne una captura o un PDF. |
| Un vídeo no es veu | Exporta'l en **MP4 (H.264)**, el format més compatible. Del Canva ja surt així. |
| Una pantalla fa coses estranyes | *Pantalles → la pantalla → ⋯ → Reinicia el reproductor*. |
| Canviem una tele o l'aparell | *Pantalles → la pantalla → ⋯ → Canviar l'aparell* i escriu el codi de l'aparell nou. Es manté tota la configuració. |
| Ningú pot entrar al panell | A l'editor d'Apps Script, a `Instal.gs`, posa el correu a la funció `afegirAdministrador` i executa-la. |
| S'ha esborrat alguna cosa per error | A la carpeta del Drive, *Còpies de seguretat*, hi ha una còpia diària de tota la configuració (30 dies). Els fitxers esborrats van a la paperera del Drive. |

## Privadesa

- Les fotos i vídeos són **privats** al Drive del compte de l'escola i **no tenen cap enllaç públic**.
- Les pantalles els reben amb una clau pròpia que es pot anul·lar en qualsevol moment (*⋯ → Renova l'enllaç*).
- Al panell només hi entren els correus autoritzats. Cada entrada es fa amb un codi enviat al correu, i tot queda al registre d'activitat.
- Només cal mostrar fotos d'alumnes amb el consentiment de dret d'imatge, com ara.
