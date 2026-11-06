/* PANTALLES · Diapositives generades (text, rellotge, compte enrere)
 * Les fa servir tant el reproductor com la vista prèvia del panell.
 * Totes les mides van en «em»: 1em = 1% del costat curt de la pantalla. */
(function () {
  'use strict';
  var Pnt = window.Pnt = window.Pnt || {};
  var D = Pnt.diapo = {};

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

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
    return out.join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  };

  function fons(cont, t, ctx) {
    var bg = t.bg || '#c8102e';
    cont.style.background = t.bg2 ? 'linear-gradient(135deg,' + bg + ',' + t.bg2 + ')' : bg;
    cont.style.color = t.fg || '#fff';
    if (t.bgMediaId && ctx && ctx.urlMitja) {
      var u = ctx.urlMitja(t.bgMediaId);
      if (u) {
        var img = el('div', 'dp-fons-img');
        img.style.backgroundImage = 'url("' + u + '")';
        cont.appendChild(img);
        cont.appendChild(el('div', 'dp-fons-vel'));
      }
    }
  }

  /** Redueix la mida de la lletra fins que tot el text hi cap. */
  D.ajusta = function (node) {
    var cos = node && node.querySelector('.dp-cos');
    if (!cos || !node.clientHeight) return;
    var escala = 1;
    cos.style.fontSize = '1em';
    for (var i = 0; i < 14 && (cos.scrollHeight > node.clientHeight * 0.92 || cos.scrollWidth > node.clientWidth * 0.96); i++) {
      escala *= 0.9;
      cos.style.fontSize = escala + 'em';
    }
  };

  D.text = function (item, ctx) {
    var t = item.text || {};
    var n = el('div', 'dp dp-text');
    fons(n, t, ctx);
    var cos = el('div', 'dp-cos dp-al-' + (t.align || 'center'));
    var k = (t.size || 100) / 100;
    if (t.title) { var h = el('div', 'dp-titol', Pnt.escapa(t.title).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')); h.style.fontSize = (11 * k) + 'em'; cos.appendChild(h); }
    if (t.body) { var b = el('div', 'dp-cos-text', D.format(t.body)); b.style.fontSize = (5.8 * k) + 'em'; cos.appendChild(b); }
    if (t.footer) { var f = el('div', 'dp-peu', Pnt.escapa(t.footer)); f.style.fontSize = (3.8 * k) + 'em'; cos.appendChild(f); }
    n.appendChild(cos);
    return n;
  };

  D.clock = function (item, ctx) {
    var t = item.text || {};
    var n = el('div', 'dp dp-rellotge');
    fons(n, t, ctx);
    var cos = el('div', 'dp-cos dp-al-center');
    if (t.title) cos.appendChild(el('div', 'dp-rel-titol', Pnt.escapa(t.title)));
    var hora = el('div', 'dp-rel-hora');
    var data = el('div', 'dp-rel-data');
    cos.appendChild(hora); cos.appendChild(data);
    if (t.footer) cos.appendChild(el('div', 'dp-peu', Pnt.escapa(t.footer)));
    n.appendChild(cos);
    function pinta() {
      var l = Pnt.horaLocal(ctx.ara());
      hora.textContent = l.time;
      data.textContent = Pnt.NOMS_DIES_LLARGS[l.dow] + ', ' + l.d + (/^[aeiou]/.test(Pnt.NOMS_MESOS[l.m - 1]) ? ' d\'' : ' de ') + Pnt.NOMS_MESOS[l.m - 1];
    }
    pinta();
    var iv = setInterval(pinta, 1000);
    n.atura = function () { clearInterval(iv); };
    return n;
  };

  D.countdown = function (item, ctx) {
    var t = item.text || {};
    var n = el('div', 'dp dp-compte');
    fons(n, t, ctx);
    var cos = el('div', 'dp-cos dp-al-center');
    var titol = el('div', 'dp-titol', Pnt.escapa(t.title || ''));
    titol.style.fontSize = '7em';
    var num = el('div', 'dp-compte-num');
    var unitat = el('div', 'dp-compte-unitat');
    cos.appendChild(titol); cos.appendChild(num); cos.appendChild(unitat);
    if (t.footer) cos.appendChild(el('div', 'dp-peu', Pnt.escapa(t.footer)));
    n.appendChild(cos);
    function pinta() {
      var l = Pnt.horaLocal(ctx.ara());
      var p = (t.date || l.date).split('-');
      var dies = Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(l.y, l.m - 1, l.d)) / 864e5);
      if (dies > 1) { num.textContent = dies; unitat.textContent = 'dies'; }
      else if (dies === 1) { num.textContent = '1'; unitat.textContent = 'dia · és demà!'; }
      else if (dies === 0) {
        if (t.time) {
          var falten = (parseInt(t.time, 10) * 60 + parseInt(t.time.split(':')[1], 10)) - l.mins;
          if (falten > 0) { num.textContent = Math.floor(falten / 60) + 'h ' + (falten % 60) + 'min'; unitat.textContent = 'avui a les ' + t.time; return; }
        }
        num.textContent = 'Avui!'; unitat.textContent = '';
      } else { num.textContent = '✓'; unitat.textContent = 'ja ha passat'; }
    }
    pinta();
    var iv = setInterval(pinta, 15000);
    n.atura = function () { clearInterval(iv); };
    return n;
  };

  /** Crea la diapositiva corresponent a l'element (o null si no és generada). */
  D.crea = function (item, ctx) {
    if (item.kind === 'text') return D.text(item, ctx);
    if (item.kind === 'clock') return D.clock(item, ctx);
    if (item.kind === 'countdown') return D.countdown(item, ctx);
    return null;
  };

  /** Fixa la mida base (1em = 1% del costat curt) d'un contenidor. */
  D.escala = function (node, w, h) {
    w = w || node.clientWidth; h = h || node.clientHeight;
    node.style.fontSize = (Math.min(w, h) / 100) + 'px';
  };
})();
