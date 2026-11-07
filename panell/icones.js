/* PANTALLES · Icones del panell (traç de línia recta, coherent amb la identitat: vores rectes) */
(function () {
  'use strict';
  var P = {
    inici: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
    pantalles: '<rect x="2" y="3" width="20" height="14"/><path d="M8 21h8M12 17v4"/>',
    llistes: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    biblioteca: '<rect x="3" y="3" width="18" height="18"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    avisos: '<path d="M3 10v4h3l7 5V5L6 10H3z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/>',
    ajustos: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    mes: '<path d="M12 5v14M5 12h14"/>',
    pujar: '<path d="M21 15v6H3v-6"/><path d="m17 8-5-5-5 5"/><path d="M12 3v13"/>',
    edita: '<path d="M16 3l5 5L8 21H3v-5L16 3z"/><path d="m13 6 5 5"/>',
    puntets: '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    esborra: '<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    previa: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    identifica: '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="3"/>',
    recarrega: '<path d="M20 11A8 8 0 1 0 18 17"/><path d="M20 4v7h-7"/>',
    enllac: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
    canvia: '<path d="M4 8h15l-4-4M20 16H5l4 4"/>',
    rellotge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    compte: '<path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4"/>',
    text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9"/>',
    youtube: '<rect x="2" y="5" width="20" height="14"/><path d="m10 9 5 3-5 3z"/>',
    duplica: '<rect x="8" y="8" width="13" height="13"/><path d="M4 16V4h12"/>',
    agafa: '<circle cx="9" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1" fill="currentColor" stroke="none"/>',
    tanca: '<path d="M18 6 6 18M6 6l12 12"/>',
    fet: '<path d="m4 12 5 5L20 6"/>',
    calendari: '<rect x="3" y="4" width="18" height="17"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    surt: '<path d="M9 21H3V3h6M16 17l5-5-5-5M21 12H9"/>',
    bustia: '<path d="M22 13h-6l-2 3h-4l-2-3H2"/><path d="M5 5h14l3 8v7H2v-7z"/>',
    amunt: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    avall: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    principi: '<path d="M5 3h14M12 21V8M5 15l7-7 7 7"/>',
    enrere: '<path d="m15 18-6-6 6-6"/>',
    endavant: '<path d="m9 18 6-6-6-6"/>',
    persones: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 3.5a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6"/>',
    atura: '<rect x="6" y="6" width="12" height="12"/>',
    alerta: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v4M12 17v.5"/>',
    registre: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    neteja: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    carpeta: '<path d="M3 5h6l2 2h10v13H3z"/>',
    temps: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    video: '<rect x="2" y="5" width="14" height="14"/><path d="m22 8-6 4 6 4z"/>',
    fitxer: '<path d="M14 2H5v20h14V7z"/><path d="M14 2v5h5"/>',
    copia: '<rect x="8" y="8" width="13" height="13"/><path d="M4 16V4h12"/>',
    qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v3M14 20h3M20 20v1"/>',
    cerca: '<circle cx="11" cy="11" r="7"/><path d="m21 21-5-5"/>'
  };
  /** Retorna l'SVG d'una icona. mida en px (per defecte 18). */
  window.IC = function (nom, mida, classe) {
    var m = mida || 18;
    return '<svg class="ic-svg' + (classe ? ' ' + classe : '') + '" width="' + m + '" height="' + m + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">' + (P[nom] || '') + '</svg>';
  };
})();
