/**
 * Materiales: lista de precios + stock, todo en una sola pantalla.
 * Incluye alta/edición/baja de materiales, filtro por grupo, y las
 * herramientas para cargar stock nuevo (a mano o con ayuda de OCR sobre
 * la foto de un remito) detrás del botón "Cargar stock".
 */
(function (global) {
  'use strict';

  var editandoId = null;
  var busqueda = '';
  var grupoFiltro = '';
  var mostrarCargaStock = false;
  var pendientesStock = []; // { materialId, nombre, cantidad }
  var tesseractCargando = null;

  function normalizar(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function gruposExistentes() {
    var set = {};
    Store.materiales.getAll().forEach(function (m) { if (m.grupo) set[m.grupo] = true; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  // ============ Alta / edición de material ============
  function renderForm() {
    var container = document.getElementById('mat-form-container');
    if (!editandoId && editandoId !== '') { container.innerHTML = ''; return; }

    var mat = editandoId ? global.Store.materiales.get(editandoId) : null;
    container.innerHTML =
      '<div class="form-panel">' +
        '<div class="form-panel-head"><h2>' + (mat ? 'Editar material' : 'Nuevo material') + '</h2></div>' +
        '<form id="mat-form">' +
          '<div class="field"><label for="mat-nombre">Nombre</label>' +
            '<input class="input" id="mat-nombre" required placeholder="Ej: Caño estructural 20x20x1.6mm" value="' + Util.escapeHtml(mat ? mat.nombre : '') + '"></div>' +
          '<div class="field"><label for="mat-grupo">Grupo (ej: Ángulos, Chapas, Pintura)</label>' +
            '<input class="input" id="mat-grupo" list="mat-grupos-datalist" placeholder="Opcional" value="' + Util.escapeHtml(mat ? mat.grupo : '') + '"></div>' +
          '<div class="field-row">' +
            '<div class="field"><label for="mat-unidad">Unidad</label>' +
              '<input class="input" id="mat-unidad" required placeholder="m, kg, unidad, chapa…" value="' + Util.escapeHtml(mat ? mat.unidad : '') + '"></div>' +
            '<div class="field"><label for="mat-cantidad">Cantidad por pieza (ej: metros por barra)</label>' +
              '<input class="input" id="mat-cantidad" type="number" min="0" step="0.01" placeholder="Opcional" value="' + (mat && mat.cantidad ? mat.cantidad : '') + '"></div>' +
          '</div>' +
          '<p style="font-size:0.78rem;color:var(--steel-500);margin:2px 0 10px;">Si se vende por peso (barras, chapas): completá peso y precio del kg — el precio final se calcula solo. Si no, dejalo en blanco y cargá el precio manual de abajo.</p>' +
          '<div class="field-row">' +
            '<div class="field"><label for="mat-peso">Peso de la pieza (kg)</label>' +
              '<input class="input" id="mat-peso" type="number" min="0" step="0.01" placeholder="Opcional" value="' + (mat && mat.pesoUnidad ? mat.pesoUnidad : '') + '"></div>' +
            '<div class="field"><label for="mat-precio-kg">Precio del kg (US$)</label>' +
              '<input class="input" id="mat-precio-kg" type="number" min="0" step="0.01" placeholder="Opcional" value="' + (mat && mat.precioKg ? mat.precioKg : '') + '"></div>' +
          '</div>' +
          '<div class="field"><label for="mat-precio">Precio manual (US$) — si no se vende por peso</label>' +
            '<input class="input" id="mat-precio" type="number" min="0" step="0.01" placeholder="Opcional" value="' + (mat && mat.precio ? mat.precio : '') + '"></div>' +
          '<div class="field"><label for="mat-stock">Stock actual</label>' +
            '<input class="input" id="mat-stock" type="number" min="0" step="0.01" placeholder="0" value="' + (mat && mat.stock ? mat.stock : '') + '"></div>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-outline" id="mat-cancelar">Cancelar</button>' +
            '<button type="submit" class="btn btn-primary">Guardar</button>' +
          '</div>' +
        '</form>' +
        '<datalist id="mat-grupos-datalist">' +
          gruposExistentes().map(function (g) { return '<option value="' + Util.escapeHtml(g) + '">'; }).join('') +
        '</datalist>' +
      '</div>';

    document.getElementById('mat-cancelar').addEventListener('click', function () {
      editandoId = null;
      renderForm();
    });
    document.getElementById('mat-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = document.getElementById('mat-nombre').value.trim();
      var grupo = document.getElementById('mat-grupo').value.trim();
      var unidad = document.getElementById('mat-unidad').value.trim();
      var cantidad = parseFloat(document.getElementById('mat-cantidad').value) || 0;
      var pesoUnidad = parseFloat(document.getElementById('mat-peso').value) || 0;
      var precioKg = parseFloat(document.getElementById('mat-precio-kg').value) || 0;
      var precio = parseFloat(document.getElementById('mat-precio').value) || 0;
      var stock = parseFloat(document.getElementById('mat-stock').value) || 0;
      if (!nombre || !unidad) {
        Util.toast('Completá nombre y unidad');
        return;
      }
      if (precioKg <= 0 && precio <= 0) {
        Util.toast('Cargá el precio del kg o un precio manual');
        return;
      }
      var item = mat ? Object.assign({}, mat) : {};
      item.nombre = nombre;
      item.grupo = grupo;
      item.unidad = unidad;
      item.cantidad = cantidad;
      item.pesoUnidad = pesoUnidad;
      item.precioKg = precioKg;
      item.precio = precio;
      item.stock = stock;
      item.actualizado = Store.nowISO();
      Store.materiales.save(item);
      Util.toast('Material guardado');
      editandoId = null;
      renderForm();
      renderLista();
    });
  }

  // ============ Lista de precios / stock ============
  function celdaPrecioArs(m) {
    var opciones = Precios.opciones(m);
    if (opciones.length === 0) return '<span class="cell-sub">—</span>';
    if (!(Dolar.valorActual() > 0)) return '<span class="cell-sub">Cargá la cotización en Ajustes</span>';
    var multiple = opciones.length > 1;
    return opciones.map(function (op) {
      var precio = BudgetPDF.money(Dolar.aPesos(op.precioUsd));
      return '<div>' + (multiple ? '<strong>' + op.label + ':</strong> ' + precio : precio) + '</div>';
    }).join('');
  }

  function celdaPrecioUsd(m) {
    var opciones = Precios.opciones(m);
    if (opciones.length === 0) return '<span class="cell-sub">—</span>';
    return opciones.map(function (op) {
      return '<div>' + Dolar.formatearUsd(op.precioUsd) + '</div>';
    }).join('');
  }

  function renderFiltroGrupos() {
    var sel = document.getElementById('mat-grupo-filtro');
    if (!sel) return;
    var actual = sel.value;
    sel.innerHTML = '<option value="">Todos los grupos</option>' +
      gruposExistentes().map(function (g) { return '<option value="' + Util.escapeHtml(g) + '">' + Util.escapeHtml(g) + '</option>'; }).join('');
    sel.value = actual;
  }

  function renderLista() {
    var cont = document.getElementById('mat-lista');
    renderFiltroGrupos();
    var materiales = Store.materiales.getAll()
      .filter(function (m) { return !busqueda || normalizar(m.nombre).indexOf(normalizar(busqueda)) !== -1; })
      .filter(function (m) { return !grupoFiltro || m.grupo === grupoFiltro; })
      .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });

    if (materiales.length === 0) {
      cont.innerHTML = '<p class="empty-state">' +
        (busqueda || grupoFiltro ? 'No hay materiales que coincidan.' : 'Todavía no cargaste materiales. Tocá "+ Material" para agregar el primero.') +
        '</p>';
      return;
    }

    cont.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Material</th><th class="hide-narrow">Grupo</th><th>Unidad</th><th class="hide-narrow">Cant./pieza</th><th class="hide-narrow">Kg/pieza</th><th>Precio ($)</th><th class="hide-narrow">Equiv. (US$)</th><th>Stock</th><th class="hide-narrow">Actualizado</th><th></th></tr></thead>' +
        '<tbody>' +
        materiales.map(function (m) {
          return '<tr data-id="' + m.id + '">' +
            '<td class="cell-title cell-wrap">' + Util.escapeHtml(m.nombre) + '</td>' +
            '<td class="cell-sub hide-narrow">' + Util.escapeHtml(m.grupo || '—') + '</td>' +
            '<td>' + Util.escapeHtml(m.unidad) + '</td>' +
            '<td class="hide-narrow">' + (m.cantidad ? m.cantidad : '—') + '</td>' +
            '<td class="hide-narrow">' + (m.pesoUnidad ? m.pesoUnidad : '—') + '</td>' +
            '<td>' + celdaPrecioArs(m) + '</td>' +
            '<td class="cell-sub hide-narrow">' + celdaPrecioUsd(m) + '</td>' +
            '<td' + (Number(m.stock) > 0 ? '' : ' style="color:var(--danger);font-weight:700;"') + '>' + (m.stock ? m.stock : '0') + '</td>' +
            '<td class="cell-sub hide-narrow">' + (m.actualizado ? Util.fechaCorta(m.actualizado) : '—') + '</td>' +
            '<td class="col-actions">' +
              '<button class="icon-btn" data-action="editar" aria-label="Editar">' + Util.iconPencil() + '</button>' +
              '<button class="icon-btn" data-action="borrar" aria-label="Eliminar">' + Util.iconTrash() + '</button>' +
            '</td>' +
          '</tr>';
        }).join('') +
        '</tbody>' +
      '</table></div>';

    cont.querySelectorAll('[data-action="editar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        abrirEdicion(btn.closest('tr').dataset.id);
      });
    });
    cont.querySelectorAll('[data-action="borrar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var mat = Store.materiales.get(id);
        if (!mat) return;
        if (confirm('¿Eliminar "' + mat.nombre + '" de la lista de precios?')) {
          Store.materiales.remove(id);
          Util.toast('Material eliminado');
          renderLista();
        }
      });
    });
  }

  // ============ Cargar stock (a mano o con foto del remito) ============
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

  function agregarPendienteStock(materialId, nombre, cantidad) {
    var existente = pendientesStock.find(function (p) { return p.materialId === materialId; });
    if (existente) { existente.cantidad += cantidad; }
    else { pendientesStock.push({ materialId: materialId, nombre: nombre, cantidad: cantidad }); }
  }

  function renderPendientesStock() {
    var cont = document.getElementById('mat-stock-pendientes');
    if (!cont) return;
    if (pendientesStock.length === 0) {
      cont.innerHTML = '<p class="empty-state">Todavía no agregaste nada a la carga.</p>';
      return;
    }
    cont.innerHTML = pendientesStock.map(function (p, idx) {
      return '<div class="line-item" data-idx="' + idx + '">' +
        '<div class="line-item-name">' + Util.escapeHtml(p.nombre) + '</div>' +
        '<input class="input stock-pend-cant" data-idx="' + idx + '" type="number" min="0" step="0.01" style="max-width:110px;" value="' + p.cantidad + '">' +
        '<button class="line-item-remove" data-idx="' + idx + '" aria-label="Quitar">' + Util.iconClose() + '</button>' +
      '</div>';
    }).join('');

    cont.querySelectorAll('.stock-pend-cant').forEach(function (inp) {
      inp.addEventListener('input', function () {
        pendientesStock[parseInt(inp.dataset.idx, 10)].cantidad = parseFloat(inp.value) || 0;
      });
    });
    cont.querySelectorAll('.line-item-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pendientesStock.splice(parseInt(btn.dataset.idx, 10), 1);
        renderPendientesStock();
      });
    });
  }

  function renderCargaStock() {
    var cont = document.getElementById('mat-stock-container');
    if (!cont) return;
    var btnToggle = document.getElementById('mat-cargar-stock-btn');
    if (btnToggle) btnToggle.textContent = mostrarCargaStock ? 'Ocultar carga de stock' : 'Cargar stock';

    if (!mostrarCargaStock) { cont.innerHTML = ''; return; }

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
        '<div class="line-items" id="mat-stock-pendientes"></div>' +
        '<button class="btn btn-primary btn-block" id="stock-confirmar-btn" style="margin-top:10px;">Confirmar carga de stock</button>' +
      '</div>';

    renderPendientesStock();

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
      agregarPendienteStock(material.id, material.nombre, cantidad);
      renderPendientesStock();
      materialInput.value = '';
      document.getElementById('stock-cantidad').value = '1';
      seleccionado = null;
    });

    document.getElementById('stock-confirmar-btn').addEventListener('click', function () {
      var validos = pendientesStock.filter(function (p) { return p.cantidad > 0; });
      if (validos.length === 0) { Util.toast('Agregá al menos una cantidad válida'); return; }
      validos.forEach(function (p) {
        var mat = Store.materiales.get(p.materialId);
        if (!mat) return;
        Store.materiales.save(Object.assign({}, mat, { stock: (Number(mat.stock) || 0) + p.cantidad, actualizado: Store.nowISO() }));
      });
      Util.toast('Stock actualizado (' + validos.length + (validos.length === 1 ? ' material' : ' materiales') + ')');
      pendientesStock = [];
      renderCargaStock();
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
        if (m) { agregarPendienteStock(m.materialId, m.nombre, m.cantidad); encontrados++; }
      });
      renderPendientesStock();
      Util.toast(encontrados > 0
        ? encontrados + ' línea(s) reconocida(s) — revisá cantidades antes de confirmar'
        : 'No reconocí ningún material en el texto — agregalos a mano');
    });
  }

  function init() {
    editandoId = null;
    renderForm();
    renderLista();
    renderCargaStock();

    document.getElementById('mat-nuevo-btn').addEventListener('click', function () {
      editandoId = '';
      renderForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.getElementById('mat-buscar').addEventListener('input', function (e) {
      busqueda = e.target.value;
      renderLista();
    });
    document.getElementById('mat-grupo-filtro').addEventListener('change', function (e) {
      grupoFiltro = e.target.value;
      renderLista();
    });
    document.getElementById('mat-cargar-stock-btn').addEventListener('click', function () {
      mostrarCargaStock = !mostrarCargaStock;
      renderCargaStock();
      if (mostrarCargaStock) document.getElementById('mat-stock-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function abrirEdicion(id) {
    editandoId = id;
    renderForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    renderLista();
    renderCargaStock();
  }

  global.VistaMateriales = { init: init, renderLista: render, abrirEdicion: abrirEdicion };
})(window);
