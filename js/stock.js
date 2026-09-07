/**
 * Pantalla de Stock: cargar entradas nuevas (a mano o con ayuda de OCR
 * sobre la foto de un remito) y ver el stock actual por material.
 *
 * El OCR es 100% en el navegador (Tesseract.js, cargado solo cuando se usa
 * esta función, no viene incluido en el paquete offline de la app) y es
 * "mejor esfuerzo": lee el texto de la imagen pero la app todavía tiene
 * que adivinar qué línea es qué material y qué número es la cantidad, así
 * que siempre hay que revisar antes de confirmar — no reemplaza mirar el
 * remito, ayuda a no tipear todo de cero.
 */
(function (global) {
  'use strict';

  var pendientes = []; // { materialId, nombre, cantidad }
  var tesseractCargando = null;

  function normalizar(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function cargarTesseract() {
    if (global.Tesseract) return Promise.resolve();
    if (tesseractCargando) return tesseractCargando;
    tesseractCargando = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('No se pudo cargar el lector de imágenes. Revisá la conexión.')); };
      document.head.appendChild(script);
    });
    return tesseractCargando;
  }

  function buscarMaterialEnLinea(linea, materiales) {
    var lineaNorm = normalizar(linea);
    // Ojo: no se puede sacar la "/" del texto — es justo lo que distingue
    // materiales como "5/8" de "3/4" en nombres de ángulos/caños, así que
    // se mantiene como parte del token en vez de partirlo en dos números.
    var tokens = lineaNorm.replace(/[^a-z0-9.\/ ]/g, ' ').split(/\s+/)
      .filter(function (t) { return t.length >= 2 && /[a-z]|\//.test(t); });
    if (tokens.length === 0) return null;

    var mejor = null, mejorScore = 0, mejorMatches = 0;
    materiales.forEach(function (m) {
      var nombreNorm = normalizar(m.nombre);
      var score = 0, matches = 0;
      tokens.forEach(function (t) {
        if (nombreNorm.indexOf(t) !== -1) {
          score += t.length * (t.indexOf('/') !== -1 ? 3 : 1); // las fracciones pesan más: son lo más distintivo
          matches++;
        }
      });
      if (matches > 0 && (matches > mejorMatches || (matches === mejorMatches && score > mejorScore))) {
        mejorScore = score; mejorMatches = matches; mejor = m;
      }
    });
    if (!mejor || mejorScore < 4) return null;

    var numeros = linea.match(/\d+(?:[.,]\d+)?/g);
    var cantidad = numeros && numeros.length ? parseFloat(numeros[numeros.length - 1].replace(',', '.')) : 0;
    return { materialId: mejor.id, nombre: mejor.nombre, cantidad: cantidad || 0 };
  }

  function agregarPendiente(materialId, nombre, cantidad) {
    var existente = pendientes.find(function (p) { return p.materialId === materialId; });
    if (existente) { existente.cantidad += cantidad; }
    else { pendientes.push({ materialId: materialId, nombre: nombre, cantidad: cantidad }); }
  }

  function renderPendientes() {
    var cont = document.getElementById('stock-pendientes');
    if (!cont) return;
    if (pendientes.length === 0) {
      cont.innerHTML = '<p class="empty-state">Todavía no agregaste nada a la carga.</p>';
      return;
    }
    cont.innerHTML = pendientes.map(function (p, idx) {
      return '<div class="line-item" data-idx="' + idx + '">' +
        '<div class="line-item-name">' + Util.escapeHtml(p.nombre) + '</div>' +
        '<input class="input stock-pend-cant" data-idx="' + idx + '" type="number" min="0" step="0.01" style="max-width:110px;" value="' + p.cantidad + '">' +
        '<button class="line-item-remove" data-idx="' + idx + '" aria-label="Quitar">' + Util.iconClose() + '</button>' +
      '</div>';
    }).join('');

    cont.querySelectorAll('.stock-pend-cant').forEach(function (inp) {
      inp.addEventListener('input', function () {
        pendientes[parseInt(inp.dataset.idx, 10)].cantidad = parseFloat(inp.value) || 0;
      });
    });
    cont.querySelectorAll('.line-item-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pendientes.splice(parseInt(btn.dataset.idx, 10), 1);
        renderPendientes();
      });
    });
  }

  function tablaStockHTML() {
    var materiales = Store.materiales.getAll().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    if (materiales.length === 0) return '<p class="empty-state">Todavía no cargaste materiales.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Material</th><th class="hide-narrow">Grupo</th><th>Unidad</th><th>Stock</th><th></th></tr></thead>' +
      '<tbody>' +
      materiales.map(function (m) {
        return '<tr data-id="' + m.id + '">' +
          '<td class="cell-title cell-wrap">' + Util.escapeHtml(m.nombre) + '</td>' +
          '<td class="cell-sub hide-narrow">' + Util.escapeHtml(m.grupo || '—') + '</td>' +
          '<td>' + Util.escapeHtml(m.unidad) + '</td>' +
          '<td' + (Number(m.stock) > 0 ? '' : ' style="color:var(--danger);font-weight:700;"') + '>' + (m.stock ? m.stock : '0') + '</td>' +
          '<td class="col-actions"><button class="icon-btn" data-action="editar" aria-label="Editar stock">' + Util.iconPencil() + '</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function render() {
    var cont = document.getElementById('stock-container');
    if (!cont) return;
    var materiales = Store.materiales.getAll();

    cont.innerHTML =
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">Cargar remito (foto)</h2>' +
        '<p style="font-size:0.78rem;color:var(--steel-500);margin-bottom:12px;">' +
          'Lee el texto de la foto en el navegador, gratis, pero sin garantías — funciona mejor con remitos impresos y prolijos. ' +
          'Revisá y corregí siempre antes de confirmar.' +
        '</p>' +
        '<input type="file" id="stock-foto" accept="image/*" capture="environment" hidden>' +
        '<button class="btn btn-outline btn-block" id="stock-foto-btn">Elegir foto del remito</button>' +
        '<div id="stock-ocr-estado" style="font-size:0.8rem;color:var(--steel-500);margin-top:8px;"></div>' +
        '<textarea class="input" id="stock-ocr-texto" rows="4" placeholder="Acá aparece el texto leído de la foto…" style="margin-top:8px;" hidden></textarea>' +
        '<button class="btn btn-primary btn-block" id="stock-ocr-buscar" style="margin-top:8px;" hidden>Buscar materiales en el texto</button>' +
      '</div>' +

      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Agregar a mano</h2>' +
        '<div class="field">' +
          '<label for="stock-material">Material</label>' +
          '<div class="autocomplete">' +
            '<input class="input" id="stock-material" placeholder="Escribí para buscar…" autocomplete="off">' +
            '<div class="autocomplete-list" id="stock-material-dropdown" hidden></div>' +
          '</div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="stock-cantidad">Cantidad que entró</label>' +
            '<input class="input" id="stock-cantidad" type="number" min="0" step="0.01" value="1"></div>' +
          '<div class="field" style="justify-content:flex-end;">' +
            '<button type="button" class="btn btn-primary btn-block" id="stock-agregar-btn">+ Agregar</button></div>' +
        '</div>' +
        '<div class="line-items" id="stock-pendientes"></div>' +
        '<button class="btn btn-primary btn-block" id="stock-confirmar-btn" style="margin-top:10px;">Confirmar carga de stock</button>' +
      '</div>' +

      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Stock actual</h2>' +
        tablaStockHTML() +
      '</div>';

    renderPendientes();

    // ---- Autocompletado ----
    var materialInput = document.getElementById('stock-material');
    var dropdown = document.getElementById('stock-material-dropdown');
    var seleccionado = null;

    function elegir(m) {
      materialInput.value = m.nombre;
      seleccionado = m;
      dropdown.hidden = true;
      document.getElementById('stock-cantidad').focus();
    }

    function mostrarDropdown() {
      var q = normalizar(materialInput.value).trim();
      var coincidencias = q ? materiales.filter(function (m) { return normalizar(m.nombre).indexOf(q) !== -1; }).slice(0, 8) : [];
      if (coincidencias.length === 0) { dropdown.hidden = true; dropdown.innerHTML = ''; return; }
      dropdown.innerHTML = coincidencias.map(function (m) {
        return '<button type="button" class="autocomplete-item">' +
          '<span class="autocomplete-item-nombre">' + Util.escapeHtml(m.nombre) + '</span>' +
          '<span class="autocomplete-item-precio">' + Util.escapeHtml(m.unidad) + '</span>' +
        '</button>';
      }).join('');
      dropdown.hidden = false;
      dropdown.querySelectorAll('.autocomplete-item').forEach(function (btn, i) {
        btn.addEventListener('mousedown', function (e) { e.preventDefault(); elegir(coincidencias[i]); });
      });
    }

    materialInput.addEventListener('input', function () { seleccionado = null; mostrarDropdown(); });
    materialInput.addEventListener('focus', mostrarDropdown);
    materialInput.addEventListener('blur', function () { setTimeout(function () { dropdown.hidden = true; }, 120); });

    document.getElementById('stock-agregar-btn').addEventListener('click', function () {
      var nombre = materialInput.value.trim();
      var cantidad = parseFloat(document.getElementById('stock-cantidad').value);
      if (!nombre) { Util.toast('Elegí un material de la lista'); return; }
      if (isNaN(cantidad) || cantidad <= 0) { Util.toast('Ingresá una cantidad válida'); return; }
      var material = (seleccionado && seleccionado.nombre === nombre) ? seleccionado : materiales.find(function (m) { return m.nombre === nombre; });
      if (!material) { Util.toast('Ese material no está en la lista'); return; }
      agregarPendiente(material.id, material.nombre, cantidad);
      renderPendientes();
      materialInput.value = '';
      document.getElementById('stock-cantidad').value = '1';
      seleccionado = null;
    });

    document.getElementById('stock-confirmar-btn').addEventListener('click', function () {
      var validos = pendientes.filter(function (p) { return p.cantidad > 0; });
      if (validos.length === 0) { Util.toast('Agregá al menos una cantidad válida'); return; }
      validos.forEach(function (p) {
        var mat = Store.materiales.get(p.materialId);
        if (!mat) return;
        Store.materiales.save(Object.assign({}, mat, { stock: (Number(mat.stock) || 0) + p.cantidad, actualizado: Store.nowISO() }));
      });
      Util.toast('Stock actualizado (' + validos.length + (validos.length === 1 ? ' material' : ' materiales') + ')');
      pendientes = [];
      render();
    });

    cont.querySelectorAll('[data-action="editar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        global.App.mostrarVista('materiales');
        VistaMateriales.abrirEdicion(id);
      });
    });

    // ---- Foto + OCR ----
    var fotoBtn = document.getElementById('stock-foto-btn');
    var fotoInput = document.getElementById('stock-foto');
    var estadoEl = document.getElementById('stock-ocr-estado');
    var textoEl = document.getElementById('stock-ocr-texto');
    var buscarBtn = document.getElementById('stock-ocr-buscar');

    fotoBtn.addEventListener('click', function () { fotoInput.click(); });
    fotoInput.addEventListener('change', function () {
      var file = fotoInput.files[0];
      if (!file) return;
      estadoEl.textContent = 'Cargando el lector de imágenes…';
      cargarTesseract().then(function () {
        estadoEl.textContent = 'Leyendo la foto… puede tardar unos segundos.';
        return global.Tesseract.recognize(file, 'spa');
      }).then(function (resultado) {
        estadoEl.textContent = 'Listo. Revisá el texto y tocá "Buscar materiales".';
        textoEl.hidden = false;
        buscarBtn.hidden = false;
        textoEl.value = (resultado && resultado.data && resultado.data.text) || '';
      }).catch(function (err) {
        console.error(err);
        estadoEl.textContent = err.message || 'No se pudo leer la imagen.';
      });
    });

    buscarBtn.addEventListener('click', function () {
      var lineas = textoEl.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var encontrados = 0;
      lineas.forEach(function (linea) {
        var m = buscarMaterialEnLinea(linea, materiales);
        if (m) { agregarPendiente(m.materialId, m.nombre, m.cantidad); encontrados++; }
      });
      renderPendientes();
      Util.toast(encontrados > 0
        ? encontrados + ' línea(s) reconocida(s) — revisá cantidades antes de confirmar'
        : 'No reconocí ningún material en el texto — agregalos a mano');
    });
  }

  global.VistaStock = { init: render, render: render };
})(window);
