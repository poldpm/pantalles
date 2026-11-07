/* PANTALLES · Diapositives amb la imatge de Vedruna Escorial Vic
 * Les fan servir el reproductor i el panell (vista prèvia).
 * Totes les mides van en «em»: 1em = 1% del costat curt de la pantalla.
 *
 * Plantilles de text:
 *   granat       Avís o missatge destacat (fons granat)
 *   paper        Informació (fons clar)
 *   foto         Foto amb un bloc granat de text
 *   esdeveniment Data gran + títol, lloc i hora
 * I a més: rellotge (clock) i compte enrere (countdown).
 */
(function () {
  'use strict';
  var Pnt = window.Pnt = window.Pnt || {};
  var D = Pnt.diapo = {};

  D.PLANTILLES = [
    { id: 'granat', nom: 'Avís destacat', desc: 'Fons granat, per a missatges importants' },
    { id: 'paper', nom: 'Informació', desc: 'Fons clar, per a textos més llargs' },
    { id: 'foto', nom: 'Foto amb text', desc: 'Una foto de fons i el text en un bloc granat' },
    { id: 'esdeveniment', nom: 'Esdeveniment', desc: 'La data ben gran, amb hora i lloc' }
  ];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function negreta(s) { return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

  /** Text amb format senzill: **negreta**, salts de línia i llistes amb «- ». */
  D.format = function (txt) {
    var linies = Pnt.escapa(txt || '').split(/\n/);
    var out = [], enLlista = false;
    linies.forEach(function (l) {
      var m = l.match(/^\s*[-•]\s+(.*)$/);
      if (m) { if (!enLlista) { out.push('<ul>'); enLlista = true; } out.push('<li>' + m[1] + '</li>'); return; }
      if (enLlista) { out.push('</ul>'); enLlista = false; }
      out.push(l.trim() === '' ? '<div class="dp-buit"></div>' : '<div>' + l + '</div>');
    });
    if (enLlista) out.push('</ul>');
    return negreta(out.join(''));
  };

  /** Logotip (en color o en negatiu). Sense logotip, el nom de l'escola en text. */
  function logo(ctx, negatiu) {
    var u = ctx && ctx.logo ? (negatiu ? ctx.logo.neg : ctx.logo.color) : null;
    var zona = el('div', 'dp-logo-zona');
    if (u) {
      var i = el('img', 'dp-logo');
      i.src = u; i.alt = '';
      zona.appendChild(i);
    } else {
      zona.appendChild(el('div', 'dp-marca-text', Pnt.escapa((ctx && ctx.escola) || 'Vedruna Escorial Vic')));
    }
    return zona;
  }

  function blocText(t, k, opc) {
    opc = opc || {};
    var cos = el('div', 'dp-cos');
    if (t.label) cos.appendChild(el('div', 'dp-etiqueta', Pnt.escapa(t.label)));
    if (t.title) { var h = el('div', 'dp-titol', negreta(Pnt.escapa(t.title))); h.style.fontSize = ((opc.titol || 10.5) * k) + 'em'; cos.appendChild(h); }
    if (t.title && (t.body || t.footer || opc.ratlla)) cos.appendChild(el('div', 'dp-ratlla'));
    if (opc.extra) cos.appendChild(opc.extra);
    if (t.body) { var b = el('div', 'dp-text', D.format(t.body)); b.style.fontSize = ((opc.text || 5) * k) + 'em'; cos.appendChild(b); }
    if (t.footer) { var f = el('div', 'dp-peu', Pnt.escapa(t.footer)); f.style.fontSize = (3.4 * k) + 'em'; cos.appendChild(f); }
    return cos;
  }

  function plantillaDe(item) {
    var t = (item.text && item.text.template) || '';
    for (var i = 0; i < D.PLANTILLES.length; i++) if (D.PLANTILLES[i].id === t) return t;
    return 'granat';
  }

  /* ---------- Diapositives de text ---------- */
  D.text = function (item, ctx) {
    var t = item.text || {};
    var k = (t.size || 100) / 100;
    var tpl = plantillaDe(item);
    if (tpl === 'foto' && !(t.bgMediaId && ctx && ctx.urlMitja && ctx.urlMitja(t.bgMediaId))) tpl = 'granat';
    var n = el('div', 'dp dp-t-' + tpl + (t.align === 'center' && (tpl === 'granat' || tpl === 'paper') ? ' dp-centrat' : ''));

    if (tpl === 'granat' || tpl === 'paper') {
      n.appendChild(el('div', 'dp-tall'));
      n.appendChild(blocText(t, k));
      n.appendChild(logo(ctx, tpl === 'granat'));
    } else if (tpl === 'foto') {
      var f = el('div', 'dp-foto');
      f.style.backgroundImage = 'url("' + ctx.urlMitja(t.bgMediaId) + '")';
      n.appendChild(f);
      var panell = el('div', 'dp-panell');
      panell.appendChild(blocText(t, k, { titol: 9.5, text: 4.6 }));
      panell.appendChild(logo(ctx, true));
      n.appendChild(panell);
    } else if (tpl === 'esdeveniment') {
      var col = el('div', 'dp-data-col');
      if (t.date) {
        var p = t.date.split('-');
        var dow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
        col.innerHTML = '<div class="dp-data-dia-setmana">' + Pnt.NOMS_DIES_LLARGS[dow] + '</div>' +
          '<div class="dp-data-num">' + (+p[2]) + '</div>' +
          '<div class="dp-data-mes">' + Pnt.NOMS_MESOS[+p[1] - 1] + '</div>' +
          (t.time ? '<div class="dp-data-hora">' + Pnt.escapa(t.time.replace(':', '.')) + ' h</div>' : '');
      } else col.innerHTML = '<div class="dp-data-num">?</div>';
      n.appendChild(col);
      var info = null;
      if (t.place || t.time) {
        info = el('div', 'dp-esdev-info');
        if (t.time) info.appendChild(el('div', 'dp-esdev-linia', '<span class="dp-quadret"></span>A les ' + Pnt.escapa(t.time.replace(':', '.')) + ' h'));
        if (t.place) info.appendChild(el('div', 'dp-esdev-linia', '<span class="dp-quadret"></span>' + Pnt.escapa(t.place)));
      }
      var contingut = el('div', 'dp-esdev-cos');
      contingut.appendChild(blocText(t, k, { titol: 9.5, text: 4.6, extra: info, ratlla: true }));
      n.appendChild(contingut);
      n.appendChild(logo(ctx, false));
    }
    return n;
  };

  /* ---------- Rellotge ---------- */
  D.clock = function (item, ctx) {
    var t = item.text || {};
    var n = el('div', 'dp dp-t-granat dp-rellotge dp-centrat');
    n.appendChild(el('div', 'dp-tall'));
    var cos = el('div', 'dp-cos');
    if (t.title) cos.appendChild(el('div', 'dp-etiqueta', Pnt.escapa(t.title)));
    var hora = el('div', 'dp-rel-hora');
    var data = el('div', 'dp-rel-data');
    cos.appendChild(hora); cos.appendChild(data);
    if (t.footer) cos.appendChild(el('div', 'dp-peu', Pnt.escapa(t.footer)));
    n.appendChild(cos);
    n.appendChild(logo(ctx, true));
    function pinta() {
      var l = Pnt.horaLocal(ctx.ara());
      hora.textContent = l.time;
      data.textContent = Pnt.dataLlarga(l);
    }
    pinta();
    var iv = setInterval(pinta, 1000);
    n.atura = function () { clearInterval(iv); };
    return n;
  };

  /* ---------- Compte enrere ---------- */
  D.countdown = function (item, ctx) {
    var t = item.text || {};
    var n = el('div', 'dp dp-t-paper dp-compte dp-centrat');
    n.appendChild(el('div', 'dp-tall'));
    var cos = el('div', 'dp-cos');
    if (t.label) cos.appendChild(el('div', 'dp-etiqueta', Pnt.escapa(t.label)));
    var titol = el('div', 'dp-titol', negreta(Pnt.escapa(t.title || '')));
    titol.style.fontSize = '8em';
    var num = el('div', 'dp-compte-num');
    var unitat = el('div', 'dp-compte-unitat');
    var quan = el('div', 'dp-compte-quan');
    cos.appendChild(titol); cos.appendChild(num); cos.appendChild(unitat); cos.appendChild(quan);
    if (t.footer) cos.appendChild(el('div', 'dp-peu', Pnt.escapa(t.footer)));
    n.appendChild(cos);
    n.appendChild(logo(ctx, false));
    function pinta() {
      var l = Pnt.horaLocal(ctx.ara());
      var p = (t.date || l.date).split('-');
      var dies = Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(l.y, l.m - 1, l.d)) / 864e5);
      var dow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
      quan.textContent = Pnt.dataLlarga({ dow: dow, d: +p[2], m: +p[1] }) + (t.time ? ', a les ' + t.time.replace(':', '.') + ' h' : '');
      if (dies > 1) { num.textContent = dies; unitat.textContent = 'dies'; }
      else if (dies === 1) { num.textContent = '1'; unitat.textContent = 'dia · és demà'; }
      else if (dies === 0) {
        if (t.time) {
          var falten = (parseInt(t.time, 10) * 60 + parseInt(t.time.split(':')[1], 10)) - l.mins;
          if (falten > 0) { num.textContent = Math.floor(falten / 60) + ' h ' + (falten % 60) + ' min'; unitat.textContent = 'és avui'; return; }
        }
        num.textContent = 'Avui'; unitat.textContent = '';
      } else { num.textContent = '—'; unitat.textContent = 'ja ha passat'; }
    }
    pinta();
    var iv = setInterval(pinta, 15000);
    n.atura = function () { clearInterval(iv); };
    return n;
  };

  /** Peu de foto corporatiu (bloc granat amb el tall a 45°). */
  D.peuFoto = function (text, etiqueta) {
    var linies = String(text || '').split('\n');
    var p = el('div', 'dp-peu-foto');
    p.innerHTML = (etiqueta ? '<div class="dp-etiqueta dp-peu-etiqueta">' + Pnt.escapa(etiqueta) + '</div>' : '') +
      (text ? '<div class="dp-peu-foto-1">' + Pnt.escapa(linies[0]) + '</div>' : '') +
      (text && linies.length > 1 ? '<div class="dp-peu-foto-2">' + Pnt.escapa(linies.slice(1).join(' ')) + '</div>' : '');
    return p;
  };

  /* ---------- Collage ----------
   * Cada disposició és una graella (files de lletres, una lletra per foto).
   * A les pantalles verticals la graella es gira (files ↔ columnes). */
  D.COLLAGES = {
    2: [{ id: '2', nom: 'Meitat i meitat', g: ['a b'] },
        { id: '2g', nom: 'Una de gran', g: ['a a b'] }],
    3: [{ id: '3g', nom: 'Una de gran', g: ['a a b', 'a a c'] },
        { id: '3', nom: 'Tres iguals', g: ['a b c'] },
        { id: '3d', nom: 'Gran a la dreta', g: ['a c c', 'b c c'] }],
    4: [{ id: '4', nom: 'Quatre iguals', g: ['a b', 'c d'] },
        { id: '4g', nom: 'Una de gran', g: ['a a b', 'a a c', 'a a d'] },
        { id: '4f', nom: 'En franja', g: ['a b c d'] }],
    5: [{ id: '5g', nom: 'Una de gran', g: ['a a b c', 'a a d e'] },
        { id: '5c', nom: 'Gran al centre', g: ['b a a d', 'c a a e'] }],
    6: [{ id: '6', nom: 'Sis iguals', g: ['a b c', 'd e f'] },
        { id: '6g', nom: 'Una de gran', g: ['a a b c', 'a a d e', 'a a f f'] }]
  };
  D.disposicio = function (n, id) {
    var llista = D.COLLAGES[Math.max(2, Math.min(6, n))] || D.COLLAGES[2];
    for (var i = 0; i < llista.length; i++) if (llista[i].id === id) return llista[i];
    return llista[0];
  };
  function transposa(files) {
    var m = files.map(function (f) { return f.split(' '); });
    var res = [];
    for (var c = 0; c < m[0].length; c++) res.push(m.map(function (f) { return f[c]; }).join(' '));
    return res;
  }
  D.collage = function (item, ctx) {
    var fotos = (item.photos || []).filter(function (id) { return ctx && ctx.urlMitja && ctx.urlMitja(id); });
    var n = el('div', 'dp dp-collage');
    var disp = D.disposicio(fotos.length, item.layout);
    n.dataset.files = JSON.stringify(disp.g);
    var graella = el('div', 'dp-collage-graella');
    var lletres = 'abcdef';
    fotos.slice(0, 6).forEach(function (id, i) {
      var c = el('div', 'dp-collage-foto');
      c.style.gridArea = lletres[i];
      c.style.backgroundImage = 'url("' + ctx.urlMitja(id) + '")';
      graella.appendChild(c);
    });
    n.appendChild(graella);
    aplicaGraella(n, false);
    if (item.caption || item.label) n.appendChild(D.peuFoto(item.caption, item.label));
    return n;
  };
  function aplicaGraella(node, vertical) {
    var g = node.querySelector('.dp-collage-graella');
    if (!g || !node.dataset.files) return;
    var files = JSON.parse(node.dataset.files);
    if (vertical) files = transposa(files);
    g.style.gridTemplateAreas = files.map(function (f) { return '"' + f + '"'; }).join(' ');
    g.style.gridTemplateColumns = 'repeat(' + files[0].split(' ').length + ', 1fr)';
    g.style.gridTemplateRows = 'repeat(' + files.length + ', 1fr)';
  }

  /** Crea la diapositiva corresponent a l'element (o null si no és generada). */
  D.crea = function (item, ctx) {
    if (item.kind === 'text') return D.text(item, ctx);
    if (item.kind === 'clock') return D.clock(item, ctx);
    if (item.kind === 'countdown') return D.countdown(item, ctx);
    if (item.kind === 'collage') return D.collage(item, ctx);
    return null;
  };

  /** Redueix el text fins que hi cap i marca si la pantalla és vertical. */
  D.ajusta = function (node) {
    if (!node || !node.clientHeight) return;
    node.classList.toggle('dp-vertical', node.clientHeight > node.clientWidth);
    if (node.classList.contains('dp-collage')) aplicaGraella(node, node.clientHeight > node.clientWidth);
    var cos = node.querySelector('.dp-cos');
    if (!cos) return;
    var pare = cos.parentElement, cs = getComputedStyle(pare);
    var altDisp = pare.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var ampleDisp = pare.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var escala = 1;
    cos.style.fontSize = '1em';
    for (var i = 0; i < 16 && (cos.scrollHeight > altDisp + 4 || cos.scrollWidth > ampleDisp + 4); i++) {
      escala *= 0.9;
      cos.style.fontSize = escala + 'em';
    }
  };

  /** Fixa la mida base (1em = 1% del costat curt) d'un contenidor. */
  D.escala = function (node, w, h) {
    w = w || node.clientWidth; h = h || node.clientHeight;
    node.style.fontSize = (Math.min(w, h) / 100) + 'px';
  };
})();
