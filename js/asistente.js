/**
 * Asistente de precios: NO es un chatbot con IA/red — es un buscador local
 * sobre la lista de materiales ya cargada (funciona sin internet). Entiende
 * medidas tipo "20x20x1.6" y palabras del nombre del material, y contesta
 * con el precio y la fecha de la última actualización.
 */
(function (global) {
  'use strict';

  var STOPWORDS = [
    'de', 'del', 'un', 'una', 'el', 'la', 'los', 'las', 'que', 'cuanto',
    'cuánto', 'cuanta', 'cuánta', 'vale', 'valen', 'precio', 'cuesta',
    'cuestan', 'sale', 'salen', 'por', 'para', 'me', 'decis', 'decís',
    'dime', 'sabes', 'sabés', 'tenes', 'tenés', 'hay'
  ];

  function normalizar(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[¿?¡!]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function medidaDe(str) {
    var m = normalizar(str).match(/\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?){1,3}/i);
    if (!m) return null;
    return m[0].replace(/,/g, '.').replace(/\s+/g, '');
  }

  function tokens(str) {
    return normalizar(str)
      .replace(/x/g, ' x ')
      .split(/[^a-z0-9.]+/)
      .filter(function (t) { return t.length >= 2 && STOPWORDS.indexOf(t) === -1; });
  }

  function buscar(query) {
    var medida = medidaDe(query);
    var qTokens = tokens(query);
    var materiales = global.Store.materiales.getAll();

    var scored = materiales.map(function (mat) {
      var nombreNorm = normalizar(mat.nombre);
      var nombreSinEspacios = nombreNorm.replace(/\s+/g, '');
      var score = 0;
      if (medida && nombreSinEspacios.indexOf(medida) !== -1) score += 100;
      qTokens.forEach(function (t) {
        if (nombreNorm.indexOf(t) !== -1) score += t.length;
      });
      return { mat: mat, score: score };
    }).filter(function (s) { return s.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    return scored;
  }

  function textoPrecio(m) {
    var opciones = global.Precios.opciones(m);
    if (opciones.length === 0) return 'no tiene precio cargado';
    return opciones.map(function (op) {
      if (global.Dolar.valorActual() > 0) {
        return global.BudgetPDF.money(global.Dolar.aPesos(op.precioUsd)) + ' / ' + op.unidadLabel +
          ' (≈ ' + global.Dolar.formatearUsd(op.precioUsd) + ')';
      }
      return global.Dolar.formatearUsd(op.precioUsd) + ' / ' + op.unidadLabel;
    }).join(' · ');
  }

  function fecha(iso) {
    if (!iso) return 'sin fecha registrada';
    var d = new Date(iso);
    return 'actualizado el ' + d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function responder(query) {
    var q = query.trim();
    if (!q) return '¿Qué material querés consultar?';

    var resultados = buscar(q);
    if (resultados.length === 0) {
      return 'No encontré ningún material parecido a "' + q + '". Revisá el nombre en la lista de precios o cargalo si todavía no está.';
    }

    var top = resultados[0];
    var segundo = resultados[1];
    var esClaro = !segundo || (top.score - segundo.score >= 3 && top.score >= 4);

    if (esClaro) {
      var m = top.mat;
      return 'El "' + m.nombre + '" cuesta ' + textoPrecio(m) + ' (' + fecha(m.actualizado) + ').';
    }

    var lista = resultados.slice(0, 5).map(function (r) {
      return '• ' + r.mat.nombre + ' — ' + textoPrecio(r.mat);
    }).join('\n');
    return 'Encontré varios parecidos, ¿cuál de estos?\n' + lista;
  }

  function initUI() {
    var fab = document.getElementById('chat-fab');
    var panel = document.getElementById('chat-panel');
    var closeBtn = document.getElementById('chat-close');
    var log = document.getElementById('chat-log');
    var form = document.getElementById('chat-form');
    var input = document.getElementById('chat-input');
    if (!fab || !panel) return;

    var iniciado = false;

    function addBubble(from, text) {
      var div = document.createElement('div');
      div.className = 'chat-bubble ' + from;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    function open() {
      panel.hidden = false;
      fab.setAttribute('aria-expanded', 'true');
      if (!iniciado) {
        addBubble('bot', '¡Hola! Preguntame el precio de un material, por ejemplo: "cuánto vale un caño de 20x20x1.6".');
        iniciado = true;
      }
      input.focus();
    }
    function close() {
      panel.hidden = true;
      fab.setAttribute('aria-expanded', 'false');
    }

    fab.addEventListener('click', function () {
      panel.hidden ? open() : close();
    });
    closeBtn.addEventListener('click', close);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value;
      if (!q.trim()) return;
      addBubble('user', q);
      input.value = '';
      var respuesta = responder(q);
      setTimeout(function () { addBubble('bot', respuesta); }, 150);
    });
  }

  global.Asistente = { responder: responder, initUI: initUI };
})(window);
