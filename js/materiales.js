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
              '<input class="input" id="mat-unidad" required placeholder="m, kg, unidad…" value="' + Util.escapeHtml(mat ? mat.unidad : '') + '"></div>' +
            '<div class="field"><label for="mat-precio">Precio ($)</label>' +
              '<input class="input" id="mat-precio" type="number" min="0" step="0.01" required value="' + (mat ? mat.precio : '') + '"></div>' +
          '</div>' +
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
      var precio = parseFloat(document.getElementById('mat-precio').value);
      if (!nombre || !unidad || isNaN(precio) || precio < 0) {
        Util.toast('Completá nombre, unidad y un precio válido');
        return;
      }
      var item = mat ? Object.assign({}, mat) : {};
      item.nombre = nombre;
      item.unidad = unidad;
      item.precio = precio;
      item.actualizado = Store.nowISO();
      Store.materiales.save(item);
      Util.toast('Material guardado');
      editandoId = null;
      renderForm();
      renderLista();
    });
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

    cont.innerHTML = materiales.map(function (m) {
      return '<div class="list-row" data-id="' + m.id + '">' +
        '<div class="list-row-main">' +
          '<div class="list-row-title">' + Util.escapeHtml(m.nombre) + '</div>' +
          '<div class="list-row-sub">' + BudgetPDF.money(m.precio) + ' / ' + Util.escapeHtml(m.unidad) +
            (m.actualizado ? ' · act. ' + Util.fechaCorta(m.actualizado) : '') + '</div>' +
        '</div>' +
        '<div class="list-row-actions">' +
          '<button data-action="editar" aria-label="Editar">✏️</button>' +
          '<button data-action="borrar" aria-label="Eliminar">🗑️</button>' +
        '</div>' +
      '</div>';
    }).join('');

    cont.querySelectorAll('[data-action="editar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editandoId = btn.closest('.list-row').dataset.id;
        renderForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    cont.querySelectorAll('[data-action="borrar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('.list-row').dataset.id;
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
