(function (global) {
  'use strict';

  var editandoId = null;
  var busqueda = '';

  function normalizar(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

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
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-outline" id="mat-cancelar">Cancelar</button>' +
            '<button type="submit" class="btn btn-primary">Guardar</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    document.getElementById('mat-cancelar').addEventListener('click', function () {
      editandoId = null;
      renderForm();
    });
    document.getElementById('mat-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = document.getElementById('mat-nombre').value.trim();
      var unidad = document.getElementById('mat-unidad').value.trim();
      var cantidad = parseFloat(document.getElementById('mat-cantidad').value) || 0;
      var pesoUnidad = parseFloat(document.getElementById('mat-peso').value) || 0;
      var precioKg = parseFloat(document.getElementById('mat-precio-kg').value) || 0;
      var precio = parseFloat(document.getElementById('mat-precio').value) || 0;
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
      item.unidad = unidad;
      item.cantidad = cantidad;
      item.pesoUnidad = pesoUnidad;
      item.precioKg = precioKg;
      item.precio = precio;
      item.actualizado = Store.nowISO();
      Store.materiales.save(item);
      Util.toast('Material guardado');
      editandoId = null;
      renderForm();
      renderLista();
    });
  }

  function celdaPrecios(m) {
    var opciones = Precios.opciones(m);
    if (opciones.length === 0) return '<span class="cell-sub">—</span>';
    return opciones.map(function (op) {
      var ars = Dolar.aPesos(op.precioUsd);
      var principal = Dolar.valorActual() > 0 ? BudgetPDF.money(ars) : Dolar.formatearUsd(op.precioUsd);
      return '<div><strong>' + op.label + ':</strong> ' + principal +
        (Dolar.valorActual() > 0 ? ' <span class="cell-sub">(≈ ' + Dolar.formatearUsd(op.precioUsd) + ')</span>' : '') +
        '</div>';
    }).join('');
  }

  function renderLista() {
    var cont = document.getElementById('mat-lista');
    var materiales = Store.materiales.getAll()
      .filter(function (m) { return !busqueda || normalizar(m.nombre).indexOf(normalizar(busqueda)) !== -1; })
      .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });

    if (materiales.length === 0) {
      cont.innerHTML = '<p class="empty-state">' +
        (busqueda ? 'No hay materiales que coincidan con la búsqueda.' : 'Todavía no cargaste materiales. Tocá "+ Material" para agregar el primero.') +
        '</p>';
      return;
    }

    cont.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Material</th><th>Unidad</th><th class="hide-narrow">Cant./pieza</th><th class="hide-narrow">Kg/pieza</th><th>Precio</th><th class="hide-narrow">Actualizado</th><th></th></tr></thead>' +
        '<tbody>' +
        materiales.map(function (m) {
          return '<tr data-id="' + m.id + '">' +
            '<td class="cell-title cell-wrap">' + Util.escapeHtml(m.nombre) + '</td>' +
            '<td>' + Util.escapeHtml(m.unidad) + '</td>' +
            '<td class="hide-narrow">' + (m.cantidad ? m.cantidad : '—') + '</td>' +
            '<td class="hide-narrow">' + (m.pesoUnidad ? m.pesoUnidad : '—') + '</td>' +
            '<td>' + celdaPrecios(m) + '</td>' +
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
        editandoId = btn.closest('tr').dataset.id;
        renderForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

  function init() {
    editandoId = null;
    renderForm();
    renderLista();

    document.getElementById('mat-nuevo-btn').addEventListener('click', function () {
      editandoId = '';
      renderForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.getElementById('mat-buscar').addEventListener('input', function (e) {
      busqueda = e.target.value;
      renderLista();
    });
  }

  global.VistaMateriales = { init: init, renderLista: renderLista };
})(window);
